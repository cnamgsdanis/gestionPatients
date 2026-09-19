/* ==========================================================================
   PEC — couche d'accès à l'API (production)
   --------------------------------------------------------------------------
   Aucune donnée n'est stockée dans le navigateur : tout passe par le
   back-end (base de données). Le seul élément gardé côté navigateur est le
   jeton JWT de la session, dans sessionStorage (il disparaît à la fermeture
   de l'onglet). Aucun repli local : si le serveur ne répond pas, l'écran le
   dit clairement.

   Adresse de l'API : window.PEC_API_BASE_URL (à définir avant ce fichier)
   sinon, en local (localhost) le proxy de développement http://localhost:8090,
   sinon la même origine que le site (reverse proxy qui relaie /api).

   Les routes marquées « (à créer) » n'existent pas encore côté back-end : voir
   INTEGRATION-BACKEND.md. Tant qu'elles répondent 404 / 405, l'écran concerné
   affiche « fonction non disponible côté serveur » au lieu de faire semblant.
   ========================================================================== */

const API_BASE_URL = (function () {
  const configured = window.PEC_API_BASE_URL;
  if (configured != null) return String(configured).replace(/\/+$/, "");
  return /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? "http://localhost:8090" : "";
})();
const API_TIMEOUT_MS = 20000;

/* ---- Session : jeton JWT dans sessionStorage, rien d'autre ---------------- */

function apiLoadSession() {
  try {
    const raw = sessionStorage.getItem("pec_api_session");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function apiSaveSession(session) {
  try {
    if (session) sessionStorage.setItem("pec_api_session", JSON.stringify(session));
    else sessionStorage.removeItem("pec_api_session");
  } catch (e) { /* stockage indisponible : la session ne survivra pas à l'actualisation */ }
}
let apiSession = apiLoadSession(); // { token, user } | null

function apiIsConnected() { return !!(apiSession && apiSession.token); }
function apiCurrentSession() { return apiSession; }

// Date d'expiration (ms) lue dans le jeton JWT (claim « exp »), ou null.
function apiTokenExpiry() {
  try {
    const part = apiSession.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(decodeURIComponent(escape(atob(part))));
    return payload.exp ? payload.exp * 1000 : null;
  } catch (e) { return null; }
}
function apiTokenExpired() {
  const exp = apiTokenExpiry();
  return !apiIsConnected() || (exp !== null && exp <= Date.now());
}

/* ---- Appel HTTP générique ------------------------------------------------
   - Ajoute Content-Type + Authorization.
   - Rejette avec une Error lisible (message du serveur : { "error": "…" }).
   - err.isNetworkError : serveur injoignable (ou 502/503/504 du proxy).
   - err.status         : code HTTP.  err.unavailable : route absente (404/405/501
                          sur une route « à créer »).
   - Sur 401 (hors connexion) : session effacée et window.onApiUnauthorized()
     appelée (app.js renvoie l'utilisateur vers l'écran de connexion).
   -------------------------------------------------------------------- */
async function apiFetch(method, path, body) {
  const headers = { "Accept": "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (apiSession && apiSession.token) headers["Authorization"] = "Bearer " + apiSession.token;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(API_BASE_URL + path, {
      method: method,
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (networkErr) {
    const err = new Error("Serveur injoignable : vérifiez la connexion, puis réessayez.");
    err.isNetworkError = true;
    err.cause = networkErr;
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* corps vide */ }

  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      const err = new Error("Le serveur est momentanément indisponible (" + res.status + ").");
      err.isNetworkError = true;
      err.status = res.status;
      throw err;
    }
    const missing = res.status === 404 || res.status === 405 || res.status === 501;
    const err = new Error((data && data.error) || (missing
      ? "Cette fonction n'est pas encore disponible côté serveur (" + method + " " + path.split("?")[0] + ")."
      : "Erreur du serveur (" + res.status + ")"));
    err.status = res.status;
    err.body = data;
    err.unavailable = missing;
    if (res.status === 401 && path !== "/api/auth/login") {
      apiSession = null;
      apiSaveSession(null);
      if (typeof window.onApiUnauthorized === "function") window.onApiUnauthorized(err);
    }
    throw err;
  }
  return data;
}
function apiQuery(params) {
  const parts = [];
  Object.keys(params || {}).forEach(k => {
    const v = params[k];
    if (v !== undefined && v !== null && v !== "") parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
  });
  return parts.length ? "?" + parts.join("&") : "";
}

/* ---- Types de données du MPD (backend/MPD/gestionpatient.sql, v4.0) ------------
   Un « patient » est un assuré, présent en base : le front ne le crée pas, il
   ne fait que le rechercher.
   - matricule_nag : INT, 10 chiffres exactement, de 1 000 000 000 à 2 147 483 647
     (CK_Patient_nag_10). Affiché en groupes 3-3-3-1.
   - nature_assure (À AJOUTER côté base) : 1 assuré principal, 2 ayant droit, 3 conjoint.
   - statut (À AJOUTER côté base) : « actif » ou « suspendu ». En attendant, le BIT
     statut_assure est lu ainsi : true = actif, false = suspendu.
   - fonds : TINYINT 1 à 4.  sex : 'M' ou 'F'.  date_naissance : DATE (AAAA-MM-JJ).
   -------------------------------------------------------------------------- */
const NAG_MIN = 1000000000;
const NAG_MAX = 2147483647;

// Ne garde que les chiffres, 10 au maximum : le matricule ne peut pas dépasser 10 chiffres.
function nagDigits(v) {
  return String(v == null ? "" : v).replace(/\D/g, "").slice(0, 10);
}
function isValidNag(v) {
  const d = String(v == null ? "" : v);
  if (!/^\d{10}$/.test(d)) return false;
  const n = parseInt(d, 10);
  return n >= NAG_MIN && n <= NAG_MAX;
}
// Affichage 3-3-3-1 : 1234567890 → « 123 456 789 0 ».
function formatNag(v) {
  return nagDigits(v).replace(/(\d{3})(?=\d)/g, "$1 ");
}
// Champ de saisie du NAG : chiffres seulement, 10 maximum, mis en forme au fil de la frappe.
function attachNagMask(input) {
  input.addEventListener("input", () => {
    const caret = input.selectionStart == null ? input.value.length : input.selectionStart;
    const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, "").length;
    const formatted = formatNag(input.value);
    if (formatted === input.value) return;
    input.value = formatted;
    let pos = 0, seen = 0;
    while (pos < formatted.length && seen < digitsBeforeCaret) { if (/\d/.test(formatted.charAt(pos))) seen++; pos++; }
    try { input.setSelectionRange(pos, pos); } catch (e) { /* champ non sélectionnable */ }
  });
}

const NATURE_ASSURE_LABELS = { 1: "Assuré principal", 2: "Ayant droit", 3: "Conjoint" };
function natureAssureCode(v) {
  const n = parseInt(v, 10);
  return n >= 1 && n <= 3 ? n : 0;
}
function natureAssureLabel(code) {
  return NATURE_ASSURE_LABELS[code] || "—";
}

const STATUT_ASSURE_LABELS = { actif: "Actif", suspendu: "Suspendu" };
// « actif » ou « suspendu » (« » si la base ne dit rien). Lit le champ statut ;
// à défaut, le BIT statut_assure : true / 1 = actif, false / 0 = suspendu.
function statutAssureValue(p) {
  const raw = p && p.statut != null ? p.statut : (p ? p.statut_assure : null);
  if (raw == null) return "";
  if (typeof raw === "string") return /susp/i.test(raw) ? "suspendu" : "actif";
  return raw === false || raw === 0 ? "suspendu" : "actif";
}
function statutAssureLabel(v) {
  return STATUT_ASSURE_LABELS[v] || "—";
}

/* ---- Authentification (module 01) --------------------------------------
   POST /api/auth/login    { username, mot_de_passe } -> { token, user }
   POST /api/auth/register { username, mot_de_passe, nom, email, telephone, role, id_structure } -> Utilisateur (201)
   GET  /api/auth/me       (à créer) -> { user, permissions: ["patient.lire", …] }
   -------------------------------------------------------------------- */
async function apiLogin(username, password) {
  const data = await apiFetch("POST", "/api/auth/login", { username: username, mot_de_passe: password });
  apiSession = { token: data.token, user: data.user };
  apiSaveSession(apiSession);
  return apiSession;
}
// POST /api/auth/logout : le JWT ne peut pas être invalidé côté serveur (pas de liste noire) ;
// l'appel est au mieux, et la session du navigateur est de toute façon effacée.
function apiLogout() {
  if (apiIsConnected()) apiFetch("POST", "/api/auth/logout").catch(() => { /* best-effort */ });
  apiSession = null;
  apiSaveSession(null);
}
function apiRegister(payload) { return apiFetch("POST", "/api/auth/register", payload); }
function apiChangePassword(ancien, nouveau) { return apiFetch("PUT", "/api/auth/change-password", { ancien: ancien, nouveau: nouveau }); }
function apiResetPassword(idUtilisateur, nouveau) { return apiFetch("POST", "/api/auth/reset-password", { id_utilisateur: idUtilisateur, nouveau: nouveau }); }
function apiMe() { return apiFetch("GET", "/api/auth/me"); }

/* ---- Utilisateurs (module 03) et structures ------------------------------ */
function apiListUtilisateurs() { return apiFetch("GET", "/api/utilisateurs"); }
function apiGetUtilisateur(id) { return apiFetch("GET", "/api/utilisateurs/" + id); }
function apiUpdateUtilisateur(id, payload) { return apiFetch("PUT", "/api/utilisateurs/" + id, payload); }
function apiDeleteUtilisateur(id) { return apiFetch("DELETE", "/api/utilisateurs/" + id); }
function apiSetUtilisateurActif(id, actif) { return apiFetch("PATCH", "/api/utilisateurs/" + id + "/actif", { actif: actif }); }
function apiListStructures(type) { return apiFetch("GET", "/api/structures" + apiQuery({ type: type })); }

/* ---- Permissions (module 04) ---------------------------------------------- */
function apiListPermissions() { return apiFetch("GET", "/api/permissions"); }
function apiGetRolePermissions(role) { return apiFetch("GET", "/api/permissions/role/" + role); }
function apiGetPermissionMatrix() { return apiFetch("GET", "/api/permissions/matrix"); }
function apiGrantPermission(role, code) { return apiFetch("POST", "/api/permissions/role/" + role + "/" + code); }
function apiRevokePermission(role, code) { return apiFetch("DELETE", "/api/permissions/role/" + role + "/" + code); }

/* ---- Patients = assurés (module 02) --------------------------------------
   GET /api/patients/nag/{nag}  → un assuré par son matricule (404 : inconnu).
   -------------------------------------------------------------------- */
async function findPatientByMatricule(matricule) {
  try {
    const p = await apiFetch("GET", "/api/patients/nag/" + encodeURIComponent(nagDigits(matricule)));
    return mapBackendPatient(p);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// Dossier patient : historique enregistré côté back-end (consultations et examens validés).
function apiListConsultations(idPatient) { return apiFetch("GET", "/api/consultations" + apiQuery({ id_patient: idPatient })); }
function apiListExamensPatient(idPatient) { return apiFetch("GET", "/api/examens" + apiQuery({ id_patient: idPatient })); }

// Patient.photo_url : chemin stocké en base (ex. « \backend\media\patients\patient_101.jpg »).
// Le back-end Java ne sert pas de fichiers : le proxy / reverse proxy les expose sous /media/<chemin>.
function toPhotoUrl(rawPath) {
  if (!rawPath) return "";
  const normalized = rawPath.replace(/\\/g, "/");
  const marker = "backend/media/";
  const idx = normalized.toLowerCase().indexOf(marker);
  const relative = idx >= 0 ? normalized.slice(idx + marker.length) : normalized.replace(/^\/+/, "");
  return API_BASE_URL + "/media/" + relative;
}

// Patient backend → forme utilisée par les écrans (voir showAssureCard() dans app.js).
function mapBackendPatient(p) {
  if (!p) return null;
  const natureCode = natureAssureCode(p.nature_assure);
  return {
    idPatient: p.id_patient,
    matricule: p.matricule_nag != null ? String(p.matricule_nag) : "",
    nom: p.nom || "",
    prenom: p.prenom || "",
    sexe: p.sex || "",
    dateNaissance: p.date_naissance || "",
    fonds: p.fonds,
    natureCode: natureCode,
    statut: statutAssureValue(p),
    estAssure: natureCode !== 2 && natureCode !== 3,
    photoUrl: toPhotoUrl(p.photo_url),
    telephone: p.contact || "",
    adresse: p.adresse || ""
  };
}

/* ---- Annuaires (à créer) --------------------------------------------------
   GET /api/medecins               → [{ id_utilisateur, nom, code_praticien, type_praticien, id_structure, structure_nom }]
   GET /api/catalogue/medicaments  → [{ designation, prix_reference }]
   -------------------------------------------------------------------- */
function apiListMedecins() { return apiFetch("GET", "/api/medecins"); }
function apiCatalogueMedicaments() { return apiFetch("GET", "/api/catalogue/medicaments"); }

/* ---- Feuilles de soins (à créer) ------------------------------------------
   Une feuille = une consultation ou une feuille d'examen, avec tout ce que le médecin
   y renseigne (voir INTEGRATION-BACKEND.md §3 pour la forme JSON).
   GET    /api/feuilles?nag=&statut=&type=&avec_ordonnance=&servi_par_moi=&depuis=&jusqua=
   POST   /api/feuilles          → crée (le serveur attribue numero, date, id_agent)
   PUT    /api/feuilles/{serverId}  → enregistre (brouillon, validation, délivrance)
   DELETE /api/feuilles/{serverId}
   GET    /api/feuilles/compteurs → { en_attente_medecin, ordonnances_a_servir }
   -------------------------------------------------------------------- */
function apiListFeuilles(params) { return apiFetch("GET", "/api/feuilles" + apiQuery(params)); }
function apiCreateFeuille(feuille) { return apiFetch("POST", "/api/feuilles", feuille); }
function apiUpdateFeuille(serverId, feuille) { return apiFetch("PUT", "/api/feuilles/" + serverId, feuille); }
function apiDeleteFeuille(serverId) { return apiFetch("DELETE", "/api/feuilles/" + serverId); }
function apiFeuillesCompteurs() { return apiFetch("GET", "/api/feuilles/compteurs"); }

/* ---- Règlements des hôpitaux et pharmacies (à créer) ----------------------
   GET  /api/reglements            → [{ id_reglement, kind, structure, montant, date, note, type }]
   POST /api/reglements            → { kind: "hopital"|"pharmacie", structure, montant, type: "reglement"|"avance", note }
   -------------------------------------------------------------------- */
function apiListReglements() { return apiFetch("GET", "/api/reglements"); }
function apiCreateReglement(rec) { return apiFetch("POST", "/api/reglements", rec); }

/* ---- Notifications de l'administrateur (à créer) ---------------------------
   GET /api/notifications                 → mes messages
   PUT /api/notifications/{id}/lu         PUT /api/notifications/{id}/accuse
   POST /api/notifications                → envoi (administrateur)
   GET /api/notifications/envoyees        → messages envoyés, avec lus / accusés
   -------------------------------------------------------------------- */
function apiListNotifications() { return apiFetch("GET", "/api/notifications"); }
function apiMarkNotificationRead(id) { return apiFetch("PUT", "/api/notifications/" + id + "/lu"); }
function apiAcknowledgeNotification(id) { return apiFetch("PUT", "/api/notifications/" + id + "/accuse"); }
function apiSendNotification(payload) { return apiFetch("POST", "/api/notifications", payload); }
function apiListNotificationsEnvoyees(params) { return apiFetch("GET", "/api/notifications/envoyees" + apiQuery(params)); }

/* ---- Journalisation et audit (à créer) -------------------------------------
   POST /api/journal/evenements           → { evenements: [...] } (actions de l'interface ; le serveur trace lui-même l'API)
   GET  /api/journal/connexions           → { items, total }   (?page&taille&recherche&role&resultat&du&au)
   GET  /api/journal/evenements           → { items, total }   (?page&taille&recherche&categorie&resultat&severite&du&au)
   GET  /api/journal/resume               → { evenements_aujourdhui, utilisateurs_actifs_24h, alertes_a_examiner }
   GET  /api/journal/alertes              → { items, total }   (?page&taille&statut)
   PUT  /api/journal/alertes/{id}/revue   → { statut: "Vu"|"Faux positif"|"Confirmé", note }
   GET  /api/journal/integrite            → { ok, verifies, rupture }
   -------------------------------------------------------------------- */
function apiPostJournalEvenements(evenements) { return apiFetch("POST", "/api/journal/evenements", { evenements: evenements }); }
function apiListJournalConnexions(params) { return apiFetch("GET", "/api/journal/connexions" + apiQuery(params)); }
function apiListJournalEvenements(params) { return apiFetch("GET", "/api/journal/evenements" + apiQuery(params)); }
function apiJournalResume() { return apiFetch("GET", "/api/journal/resume"); }
function apiListAlertes(params) { return apiFetch("GET", "/api/journal/alertes" + apiQuery(params)); }
function apiReviewAlerte(id, payload) { return apiFetch("PUT", "/api/journal/alertes/" + id + "/revue", payload); }
function apiJournalIntegrite() { return apiFetch("GET", "/api/journal/integrite"); }

/* ---- Adaptation backend <-> forme attendue par app.js ------------------- */

// Rôle backend (Utilisateur.ROLES_VALIDES) → rôle affiché par le front.
const API_ROLE_TO_FRONT_ROLE = {
  administrateur: "Super Admin",
  directeur_structure: "DG",
  medecin: "Médecin",
  agent_accueil: "Agent hospitalier",
  pharmacien: "Pharmacie",
  caissier_structure: "Caisse"
};
const FRONT_ROLE_TO_API_ROLE = {
  "Super Admin": "administrateur",
  "DG": "directeur_structure",
  "Médecin": "medecin",
  "Agent hospitalier": "agent_accueil",
  "Pharmacie": "pharmacien",
  "Caisse": "caissier_structure"
};

// Utilisateur backend → forme des écrans. Le backend a un seul champ « nom » (nom complet) :
// on sépare sur le premier espace (approximation ; un champ prénom séparé est demandé au back-end).
function mapBackendUser(u) {
  if (!u) return null;
  const parts = (u.nom || "").trim().split(" ");
  const prenom = parts.shift() || "";
  const nom = parts.join(" ");
  return {
    id: u.id_utilisateur,
    apiId: u.id_utilisateur,
    username: u.username,
    nom: nom,
    prenom: prenom,
    email: u.email || "",
    role: API_ROLE_TO_FRONT_ROLE[u.role] || u.role,
    apiRole: u.role,
    structure: u.structure_nom || (u.id_structure ? ("Structure #" + u.id_structure) : ""),
    etablissement: u.structure_nom || "",
    idStructure: u.id_structure,
    dateCreation: apiFormatDate(u.date_creation),
    derniereConnexion: u.derniere_connexion || "",
    statut: u.actif ? "Actif" : "Inactif"
  };
}
function apiFormatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
}

/* ==========================================================================
   api.js — Connexion au backend Java réel (Auth / Utilisateurs / Patients /
   Permissions). Ce fichier ne touche JAMAIS au code backend : il s'adapte
   au contrat existant (voir backend/docs/*.md et le PDF de documentation).

   Design : chaque fonction d'écran (login, Gestion des utilisateurs...)
   essaie d'abord le vrai backend ; si celui-ci est injoignable (Java/SQL
   Server arrêtés), le front retombe sur les données de démonstration
   locales (data.js / localStorage) déjà utilisées jusqu'ici, pour ne pas
   casser le prototype quand l'API n'est pas lancée. Si le backend répond
   mais refuse la requête (401/403/404/...), l'erreur est réelle et n'est
   PAS masquée par un repli silencieux.
   ========================================================================== */

// Adresse de l'API. Par défaut, on cible le proxy CORS fourni
// (tools/dev-proxy.js, port 8090) et non le backend Java directement
// (port 8080) : le backend ne renvoie aucun en-tête CORS et un navigateur
// bloque sinon les requêtes POST/PUT/DELETE/PATCH avant même qu'elles ne
// partent — voir le PDF de documentation, section "CORS". Le proxy relaie
// vers le vrai backend sans rien y modifier. Surchargeable sans toucher ce
// fichier via : <script>window.PEC_API_BASE_URL = "http://...";</script>
// placé AVANT api.js dans index.html (par ex. pour cibler :8080 directement
// dans un contexte où CORS n'entre pas en jeu).
const API_BASE_URL = window.PEC_API_BASE_URL || "http://localhost:8090";

/* ---- Session (token JWT + utilisateur brut renvoyé par le backend) ----- */

function apiLoadSession() {
  try {
    const raw = localStorage.getItem("pec_api_session");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function apiSaveSession(session) {
  try {
    if (session) localStorage.setItem("pec_api_session", JSON.stringify(session));
    else localStorage.removeItem("pec_api_session");
  } catch (e) { /* ignore */ }
}
let apiSession = apiLoadSession(); // { token, user } | null

function apiIsConnected() { return !!(apiSession && apiSession.token); }
function apiCurrentSession() { return apiSession; }

// Délai maximal avant d'abandonner un appel API et de considérer le backend
// injoignable. Sans ça, un port refusé peut mettre plusieurs secondes à
// échouer selon le navigateur/l'OS (observé jusqu'à 10s au 2e appel
// consécutif) — un repli local doit rester rapide et prévisible. 1500ms
// laisse largement le temps à un backend local qui tourne de répondre.
const API_TIMEOUT_MS = 1500;

/* ---- Appel HTTP générique ----------------------------------------------
   - Ajoute Content-Type + Authorization automatiquement.
   - Abandonne après API_TIMEOUT_MS (voir ci-dessus) si le backend ne répond
     pas du tout (arrêté, port bloqué...).
   - Rejette avec une Error lisible (err.message) en cas d'échec HTTP.
   - err.isNetworkError = true si le backend est injoignable (à distinguer
     d'un vrai refus HTTP comme un 401 mauvais mot de passe).
   - Sur 401, vide la session locale (token expiré/invalide).
   -------------------------------------------------------------------- */
async function apiFetch(method, path, body) {
  const headers = { "Content-Type": "application/json" };
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
    const err = new Error("Backend injoignable (" + API_BASE_URL + ")");
    err.isNetworkError = true;
    err.cause = networkErr;
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* corps vide (ex: 204) */ }

  if (!res.ok) {
    // 502/503/504 : le proxy CORS (tools/dev-proxy.js) a bien répondu, mais
    // le vrai backend Java qu'il relaie est injoignable — c'est le même cas
    // que fetch() qui échoue directement (backend arrêté), pas un vrai
    // refus de l'API (401/403/...), donc même traitement : repli local.
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      const err = new Error((data && data.error) || ("Backend injoignable via le proxy (" + res.status + ")"));
      err.isNetworkError = true;
      err.status = res.status;
      throw err;
    }
    if (res.status === 401) { apiSession = null; apiSaveSession(null); }
    const err = new Error((data && data.error) || ("Erreur API (" + res.status + ")"));
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/* ---- Authentification (module 01) --------------------------------------
   POST /api/auth/login    { username, mot_de_passe } -> { token, user }
   POST /api/auth/register { username, mot_de_passe, nom, email, telephone,
                              role, id_structure } -> Utilisateur (201)
   -------------------------------------------------------------------- */

async function apiLogin(username, password) {
  const data = await apiFetch("POST", "/api/auth/login", { username: username, mot_de_passe: password });
  apiSession = { token: data.token, user: data.user };
  apiSaveSession(apiSession);
  return apiSession;
}
// POST /api/auth/logout — le JWT ne peut pas être invalidé côté serveur
// (pas de blacklist, voir AuthController), donc cet appel est au mieux
// (best-effort) : la session locale est de toute façon effacée juste après,
// que le backend réponde ou non.
function apiLogout() {
  if (apiIsConnected()) {
    apiFetch("POST", "/api/auth/logout").catch(() => { /* best-effort */ });
  }
  apiSession = null;
  apiSaveSession(null);
}
function apiRegister(payload) {
  return apiFetch("POST", "/api/auth/register", payload);
}

// PUT /api/auth/change-password { ancien, nouveau } — l'utilisateur connecté
// change son propre mot de passe.
function apiChangePassword(ancien, nouveau) {
  return apiFetch("PUT", "/api/auth/change-password", { ancien: ancien, nouveau: nouveau });
}
// POST /api/auth/reset-password { id_utilisateur, nouveau } — un admin
// (permission utilisateur.modifier) réinitialise le mot de passe d'un autre
// utilisateur.
function apiResetPassword(idUtilisateur, nouveau) {
  return apiFetch("POST", "/api/auth/reset-password", { id_utilisateur: idUtilisateur, nouveau: nouveau });
}

/* ---- Utilisateurs, admin (module 03) ------------------------------------
   GET/PUT/DELETE /api/utilisateurs/{id}, GET /api/utilisateurs,
   PATCH /api/utilisateurs/{id}/actif
   -------------------------------------------------------------------- */

function apiListUtilisateurs() { return apiFetch("GET", "/api/utilisateurs"); }
function apiGetUtilisateur(id) { return apiFetch("GET", "/api/utilisateurs/" + id); }
function apiUpdateUtilisateur(id, payload) { return apiFetch("PUT", "/api/utilisateurs/" + id, payload); }
function apiDeleteUtilisateur(id) { return apiFetch("DELETE", "/api/utilisateurs/" + id); }
function apiSetUtilisateurActif(id, actif) { return apiFetch("PATCH", "/api/utilisateurs/" + id + "/actif", { actif: actif }); }

/* ---- Patients (module 02) ------------------------------------------------
   Utilisée par "Nouvelle prise en charge" (recherche par matricule NAG) —
   voir mapBackendPatient() plus bas. Schéma réel vérifié en base (colonnes
   effectivement présentes dans Patient, différent par endroits de ce que
   décrit backend/docs/01-auth.md, qui est en fait la doc du module Patient
   et pas à jour sur ce point) : id_patient, photo_url, prenom, nom, sex,
   contact, statut_assure (bit), fonds (INT — un CODE DE CATÉGORIE, 1=Public
   2=Privé 3=GEF 4="Fonds 4" et rien d'autre, voir FONDS_LABELS dans app.js ;
   toute autre valeur est une erreur de donnée à corriger en base, pas un
   cas à gérer côté front), matricule_nag (INT — chiffres uniquement).
   Pas de colonne id_assure_principal ni de date de naissance dans le schéma
   réel : aucun lien assuré principal / ayant droit n'est donc disponible
   côté API, et la date de naissance ne peut pas être affichée (voir
   mapBackendPatient). Pas de route de recherche par matricule : on charge
   la liste complète et on filtre côté client (findPatientByMatricule).
   -------------------------------------------------------------------- */

function apiListPatients() { return apiFetch("GET", "/api/patients"); }
function apiGetPatient(id) { return apiFetch("GET", "/api/patients/" + id); }
function apiCreatePatient(payload) { return apiFetch("POST", "/api/patients", payload); }
function apiUpdatePatient(id, payload) { return apiFetch("PUT", "/api/patients/" + id, payload); }
function apiDeletePatient(id) { return apiFetch("DELETE", "/api/patients/" + id); }

// Pas de route GET /api/patients?matricule=... côté backend : on charge la
// liste complète et on filtre côté client sur matricule_nag.
async function findPatientByMatricule(matricule) {
  const list = await apiListPatients();
  // matricule_nag est un INT côté API (JSON number) ; la saisie utilisateur
  // est toujours une chaîne — on compare donc en texte des deux côtés.
  const target = String(matricule).trim();
  const found = (list || []).find(p => p.matricule_nag != null && String(p.matricule_nag) === target);
  return found ? mapBackendPatient(found) : null;
}

// Patient.photo_url est un chemin Windows local (ex:
// "\backend\media\patients\patient_101.jpg", tel que stocké en base),
// injouable tel quel par un navigateur. Le proxy CORS (tools/dev-proxy.js)
// sert désormais ces fichiers sous /media/<chemin> — voir "Sert aussi les
// fichiers de backend/media/" dans dev-proxy.js — donc on ne garde que la
// partie du chemin après "backend/media/" (ou "backend\media\") et on la
// fait pointer vers l'API_BASE_URL courante (le proxy).
function toPhotoUrl(rawPath) {
  if (!rawPath) return "";
  const normalized = rawPath.replace(/\\/g, "/");
  const marker = "backend/media/";
  const idx = normalized.toLowerCase().indexOf(marker);
  const relative = idx >= 0 ? normalized.slice(idx + marker.length) : normalized.replace(/^\/+/, "");
  return API_BASE_URL + "/media/" + relative;
}

// Convertit un Patient backend vers la forme utilisée par l'écran
// "Nouvelle prise en charge" (voir showAssureCard() dans app.js). Champs
// absents du schéma réel (date de naissance, lien assuré principal / ayant
// droit) sont laissés vides plutôt qu'inventés.
function mapBackendPatient(p) {
  if (!p) return null;
  return {
    idPatient: p.id_patient,
    matricule: p.matricule_nag || "",
    nom: p.nom || "",
    prenom: p.prenom || "",
    sexe: p.sex || "",
    dateNaissance: "",
    fonds: p.fonds,
    statutAssure: !!p.statut_assure,
    photoUrl: toPhotoUrl(p.photo_url),
    telephone: p.contact || ""
  };
}

/* ---- Permissions dynamiques, admin (module 04) --------------------------
   Exposées pour un futur branchement de "Gestion des permissions" sur la
   vraie matrice backend — non câblées à l'écran pour l'instant : le
   backend protège des ACTIONS d'API (patient.lire, utilisateur.modifier...)
   alors que "Gestion des permissions" du front contrôle des VUES de l'appli
   (dashboard, rapports...) ; ce sont deux systèmes de permissions distincts
   qui ne se recouvrent pas terme à terme. Voir le PDF.
   -------------------------------------------------------------------- */

function apiListPermissions() { return apiFetch("GET", "/api/permissions"); }
function apiGetRolePermissions(role) { return apiFetch("GET", "/api/permissions/role/" + role); }
function apiGetPermissionMatrix() { return apiFetch("GET", "/api/permissions/matrix"); }
function apiGrantPermission(role, code) { return apiFetch("POST", "/api/permissions/role/" + role + "/" + code); }
function apiRevokePermission(role, code) { return apiFetch("DELETE", "/api/permissions/role/" + role + "/" + code); }

/* ---- Adaptation backend <-> forme attendue par app.js ------------------- */

// Traduit un rôle backend (Utilisateur.ROLES_VALIDES, cote Java) vers un
// rôle interne du front (celui de ROLE_ACCESS_DEFAULT / PERMISSION_VIEWS
// dans app.js), pour que tout le système d'affichage par rôle déjà en
// place continue de fonctionner sans changement avec un compte réel.
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

// Convertit un Utilisateur backend (id_utilisateur, username, nom, email,
// telephone, role, id_structure, actif, date_creation, derniere_connexion)
// vers la forme déjà utilisée partout dans app.js / data.js (id, nom,
// prenom, email, role, structure, dateCreation, statut). Le backend ne
// distingue pas prénom/nom (un seul champ "nom complet") : on sépare sur le
// premier espace, une approximation raisonnable mais imparfaite (voir PDF).
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
    // Pas de module "Structure" côté API pour résoudre un nom : on affiche
    // l'identifiant en attendant (voir PDF, "Périmètre connecté").
    structure: u.id_structure ? ("Structure #" + u.id_structure) : "",
    idStructure: u.id_structure,
    dateCreation: apiFormatDate(u.date_creation),
    statut: u.actif ? "Actif" : "Inactif"
  };
}
function apiFormatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
}

/* ==========================================================================
   PEC — interface. Les données vivent dans la base (API) : voir api.js
   ========================================================================== */

const state = {
  currentAssure: null,
  currentPatient: null,   // { matricule, nom, prenom, dateNaissance, sexe, estAssure }
  currentType: null,      // 'Consultation' | 'Examen'
  currentTM: null,        // 'Plein' | 'Plein (ALD)' | 'Exonéré'
  currentMedecin: null,   // objet de state.medecins (annuaire des médecins, API)
  rows: [],
  examRows: [],           // lignes du tableau "Examens" (bon d'examen)
  editingEntryId: null,   // id de la feuille actuellement affichée dans la feuille de soins (côté médecin)
  prestaLocked: true,     // vrai quand la feuille affichée est déjà validée (lecture seule)
  queueScope: null,       // file du médecin : "mine" (ses patients) | "all" ; null = choisi au premier affichage
  pharma: { nag: "", entries: [], selectedId: null },  // recherche pharmacie : feuilles validées avec ordonnance pour le NAG saisi
  historique: [],         // feuilles de soins chargées depuis l'API (voir persistFeuilles / mergeFeuilles)
  historiqueFilters: { search: "", type: "", statut: "", from: "", to: "" },
  historiquePage: 1,
  ordoRows: [],           // lignes d'ordonnance en cours d'édition sur la feuille de soins (médecin)
  ordoLocked: true,       // vrai quand la feuille affichée est déjà validée (lecture seule)
  currentUser: null,      // utilisateur connecté (forme mapBackendUser)
  reglements: [],         // paiements de l'assurance envers les pharmacies (API) : { id, pharmacie, montant, date, note, type }
  pharmaSuiviFilters: { from: "", to: "", pharmacie: "", statut: "" },
  reglementsHopitaux: [], // paiements envers les hôpitaux (API) : { id, hopital, montant, date, note, type }
  hopitalSuiviFilters: { from: "", to: "", hopital: "", type: "", statut: "", fonds: "", medecin: "" },
  journalFilters: { search: "", role: "", statut: "", from: "", to: "" },
  apiUsers: null,          // utilisateurs chargés depuis l'API (GET /api/utilisateurs)
  dossierPatient: null,        // patient actuellement ouvert dans le Dossier Patient (forme mapBackendPatient)
  dossierFromSheet: false,     // dossier ouvert depuis « Historique des visites » (header de la feuille de soins)
  dossierFocusId: null,        // visite en cours d'examen à mettre en évidence dans la chronologie (id de sa feuille de tête)
  dossierFocusPending: false,  // défilement vers cette visite, une seule fois à l'ouverture
  dossierConsultations: [],    // consultations du patient ouvert (Consultation[], voir api.js)
  dossierExamens: []           // examens du patient ouvert (Examen[], voir api.js)
};

/* ---------------------------------------------------------------------- */
/* Données : tout vit dans la base, via l'API. Aucun stockage local de      */
/* données. Le navigateur ne garde (sessionStorage, propre à l'onglet) que   */
/* le jeton de connexion (api.js), la session (pec_session) et quelques       */
/* préférences d'affichage.                                                  */
/* ---------------------------------------------------------------------- */

function uiPref(key, fallback) {
  try { const raw = sessionStorage.getItem("pec_ui_" + key); return raw === null ? fallback : JSON.parse(raw); } catch (e) { return fallback; }
}
function setUiPref(key, value) {
  try { sessionStorage.setItem("pec_ui_" + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

// Les feuilles sont créées par l'interface avec un identifiant client (unique) ; le serveur en garde la
// trace et attribue le numéro, la date et sa propre clé (serverId).
function newFeuilleId() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); }

// Dernier état connu du serveur pour chaque feuille : { json, serverId }. Sert à savoir ce qui a changé.
const feuilleSnapshot = new Map();
let feuilleQueue = Promise.resolve();

function mergeServerFeuille(local, srv) {
  if (!srv) return;
  // le serveur reste maître de ces champs
  ["serverId", "numero", "date"].forEach(k => { if (srv[k] !== undefined && srv[k] !== null) local[k] = srv[k]; });
}

// Envoie à la base tout ce qui a changé dans state.historique : création, modification, suppression.
// Les envois sont mis en file (jamais deux à la fois) ; la promesse échoue si le serveur refuse.
function persistFeuilles() {
  const run = async () => {
    const seen = new Set();
    for (const e of state.historique.slice()) {
      seen.add(e.id);
      const snap = feuilleSnapshot.get(e.id);
      // Ce qui part est une COPIE figée de la feuille : si elle change pendant l'attente de la réponse (le médecin
      // valide alors qu'un brouillon s'enregistre), le cliché garde ce qui a réellement été envoyé, et la
      // modification suivante sera bien envoyée au tour d'après.
      if (!snap) {
        const sent = JSON.stringify(e);
        const saved = await apiCreateFeuille(JSON.parse(sent));
        mergeServerFeuille(e, saved);
        const copy = JSON.parse(sent);
        mergeServerFeuille(copy, saved);
        feuilleSnapshot.set(e.id, { json: JSON.stringify(copy), serverId: e.serverId });
      } else if (snap.json !== JSON.stringify(e)) {
        e.serverId = e.serverId || snap.serverId;
        const sent = JSON.stringify(e);
        const saved = await apiUpdateFeuille(e.serverId, JSON.parse(sent));
        mergeServerFeuille(e, saved);
        const copy = JSON.parse(sent);
        mergeServerFeuille(copy, saved);
        feuilleSnapshot.set(e.id, { json: JSON.stringify(copy), serverId: e.serverId });
      }
    }
    for (const id of Array.from(feuilleSnapshot.keys())) {
      if (seen.has(id)) continue;
      await apiDeleteFeuille(feuilleSnapshot.get(id).serverId);
      feuilleSnapshot.delete(id);
    }
  };
  feuilleQueue = feuilleQueue.then(run, run);
  return feuilleQueue;
}

// Enregistrement « au fil de l'eau » (brouillon) : on n'attend pas, mais on signale un refus.
function persistFeuillesQuiet() {
  return persistFeuilles().catch(err => reportSyncError(err));
}

let syncErrorShownAt = 0;
function reportSyncError(err) {
  if (Date.now() - syncErrorShownAt > 4000) {
    syncErrorShownAt = Date.now();
    toast({
      kind: err && err.isNetworkError ? "warn" : "urgent",
      title: err && err.isNetworkError ? "Serveur injoignable" : "Enregistrement refusé",
      text: (err && err.message ? err.message : "Erreur inconnue") + (err && err.isNetworkError ? " Vos dernières modifications ne sont pas encore enregistrées." : ""),
      sticky: !(err && err.isNetworkError), ms: 6000
    });
  }
  if (!(err && err.isNetworkError)) pullFeuilles(true).catch(() => { /* on garde l'affichage actuel */ });
}

// Intègre des feuilles reçues du serveur. authoritative : la liste est complète (les feuilles absentes ont
// été supprimées ailleurs) ; sinon c'est un extrait (recherche par NAG…) et on ne retire rien.
// Une feuille modifiée ici et pas encore envoyée n'est jamais écrasée (sauf force).
function mergeFeuilles(list, authoritative, force) {
  const byId = new Map(state.historique.map(h => [h.id, h]));
  const incoming = new Set();
  const out = [];
  (list || []).forEach(srv => {
    incoming.add(srv.id);
    const local = byId.get(srv.id);
    const snap = feuilleSnapshot.get(srv.id);
    const dirty = local && snap && JSON.stringify(local) !== snap.json;
    if (local && dirty && !force) { out.push(local); return; }
    out.push(srv);
    feuilleSnapshot.set(srv.id, { json: JSON.stringify(srv), serverId: srv.serverId });
  });
  if (authoritative) {
    // feuilles créées ici et pas encore envoyées : on les garde en tête ; les autres ont disparu du serveur
    const pending = state.historique.filter(h => !incoming.has(h.id) && !feuilleSnapshot.has(h.id));
    Array.from(feuilleSnapshot.keys()).forEach(id => { if (!incoming.has(id)) feuilleSnapshot.delete(id); });
    state.historique = pending.concat(out);
  } else {
    const others = state.historique.filter(h => !incoming.has(h.id));
    state.historique = out.concat(others);
  }
}

// Paramètres de la liste « par défaut » de chaque rôle (le serveur applique de toute façon ses propres droits).
function feuilleScopeParams() {
  const u = state.currentUser;
  return u && u.role === "Pharmacien" ? { servi_par_moi: 1 } : {};
}
async function pullFeuilles(force) {
  const list = await apiListFeuilles(feuilleScopeParams());
  mergeFeuilles(list, true, !!force);
}

// Compteurs légers (barre latérale) : patients qui attendent le médecin, ordonnances à servir.
state.compteurs = null;
async function pullCompteurs() {
  try { state.compteurs = await apiFeuillesCompteurs(); } catch (e) { state.compteurs = null; }
}

// Chargement de tout ce dont l'utilisateur a besoin, une fois connecté. Un échec partiel n'empêche pas
// d'entrer : les écrans concernés le disent (state.dataErrors).
async function bootstrapData() {
  state.dataErrors = [];
  const u = state.currentUser;
  const finance = u && (u.role === "Super Admin" || u.role === "DG" || u.role === "Caisse");
  const attempt = (label, promise, fallback) => promise.catch(err => {
    state.dataErrors.push(label + " : " + (err && err.unavailable ? "non disponible côté serveur" : (err && err.message) || "erreur"));
    return fallback;
  });
  const [feuilles, reglements, medecins, catalogue, me, structures] = await Promise.all([
    attempt("Feuilles de soins", apiListFeuilles(feuilleScopeParams()), []),
    finance ? attempt("Règlements", apiListReglements(), []) : Promise.resolve([]),
    attempt("Annuaire des médecins", apiListMedecins(), []),
    attempt("Catalogue des médicaments", apiCatalogueMedicaments(), []),
    apiMe().catch(() => null),
    apiListStructures().catch(() => [])
  ]);
  mergeFeuilles(feuilles, true, true);
  state.reglements = (reglements || []).filter(r => r.kind === "pharmacie").map(mapReglement);
  state.reglementsHopitaux = (reglements || []).filter(r => r.kind === "hopital").map(mapReglement);
  state.medecins = (medecins || []).map(mapMedecin);
  state.catalogue = (catalogue || []).map(m => ({ designation: m.designation, prix: Number(m.prix_reference) || 0 }));
  state.structures = structures || [];
  state.permissions = me && Array.isArray(me.permissions) ? new Set(me.permissions) : null;
  // Interrupteur des contrôles anti-fraude : le serveur ne le communique qu'à l'administrateur (null pour les autres profils).
  state.controles = me && typeof me.controles_antifraude === "boolean" ? me.controles_antifraude : null;
  applyControlsUi();
  populateMedecinSelect();
  populatePharmaFilterOptions();
  populateHospFilterOptions();
  await pullCompteurs();
  if (state.dataErrors.length) {
    toast({ kind: "warn", title: "Données incomplètes", text: state.dataErrors.join(" · "), sticky: true });
  }
}
function isoToFR(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  return m ? m[3] + "/" + m[2] + "/" + m[1] : (v || "");
}
function mapReglement(r) {
  return {
    id: r.id_reglement, serverId: r.id_reglement, montant: Number(r.montant) || 0, date: isoToFR(r.date), note: r.note || "", type: r.type || "reglement",
    pharmacie: r.kind === "pharmacie" ? r.structure : undefined, hopital: r.kind === "hopital" ? r.structure : undefined
  };
}
function mapMedecin(m) {
  const parts = (m.nom || "").trim().split(" ");
  const prenom = parts.shift() || "";
  return { id: m.id_utilisateur, nom: parts.join(" ") || prenom, prenom: parts.length ? prenom : "", code: m.code_praticien || "", etablissement: m.structure_nom || "", type: m.type_praticien || "" };
}
state.medecins = [];
state.catalogue = [];
state.structures = [];
state.permissions = null;
state.dataErrors = [];

// Rafraîchissement régulier : ce que les autres utilisateurs ont fait (nouvelles feuilles, validations…)
// apparaît sans recharger la page. On ne touche pas à la feuille en cours de saisie.
let liveRefreshBusy = false;
async function liveRefresh() {
  if (!state.currentUser || liveRefreshBusy || document.hidden) return;
  liveRefreshBusy = true;
  try {
    if (currentViewName !== "soins") await pullFeuilles(false);
    await pullCompteurs();
    refreshNavLive();
    if (currentViewName === "medecin") renderMedecinQueue();
    if (currentViewName === "historique") renderHistorique();
    // Une autre pharmacie a peut-être servi une partie de l'ordonnance affichée : on la relit (sauf si l'on est en pleine saisie).
    if (currentViewName === "pharmacie" && state.pharma && state.pharma.nag && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#pharmaResults"))) {
      await refreshFeuillesByNag(state.pharma.nag);
      runPharmaSearch(state.pharma.nag, true);
    }
    if (state.controles !== null) await syncControles();
    if (typeof pullNotifications === "function") await pullNotifications();
  } catch (e) { /* le prochain tour réessaiera */ } finally { liveRefreshBusy = false; }
}
window.setInterval(liveRefresh, 20000);

/* ---------------------------------------------------------------------- */
/* Contrôles anti-fraude du serveur : interrupteur du Super Admin           */
/* ---------------------------------------------------------------------- */

// Actifs (défaut) : chaque profil ne fait que son étape et l'administrateur ne modifie pas les feuilles.
// Désactivés (« mode supervision ») : l'administrateur peut réaliser lui-même toutes les étapes du circuit ;
// les autres profils restent soumis aux contrôles. Le serveur applique la règle ; ce bouton ne fait que la piloter.
// state.controles : true | false pour l'administrateur, null pour tous les autres profils.
state.controles = null;
function applyControlsUi() {
  const btn = document.getElementById("controlsBtn");
  const banner = document.getElementById("controlsBanner");
  const admin = state.controles !== null && !!state.currentUser && state.currentUser.role === "Super Admin";
  const on = state.controles !== false;
  btn.hidden = !admin;
  btn.classList.toggle("off", admin && !on);
  btn.setAttribute("aria-checked", String(on));
  btn.title = on ? "Contrôles anti-fraude actifs — cliquez pour passer en mode supervision" : "Mode supervision — cliquez pour réactiver les contrôles";
  document.getElementById("controlsBtnLabel").textContent = on ? "Contrôles actifs" : "Contrôles désactivés";   // lu par les lecteurs d'écran ; le bouton n'affiche que l'icône et l'interrupteur
  banner.hidden = !(admin && !on) || !!uiPref("controls_banner_closed", false);
  document.body.classList.toggle("banner-on", !banner.hidden);   // les messages (toasts) se rangent sous le bandeau
  document.body.classList.toggle("supervision", admin && !on);
}
async function syncControles() {
  try {
    const c = await apiGetControles();
    if (c && typeof c.actif === "boolean" && c.actif !== (state.controles !== false)) { state.controles = c.actif; setUiPref("controls_banner_closed", false); applyControlsUi(); }
  } catch (e) { /* ignoré : le bouton garde son dernier état connu */ }
}
async function setControles(actif) {
  const btn = document.getElementById("controlsBtn");
  btn.disabled = true;
  try {
    const r = await apiSetControles(actif);
    state.controles = !!r.actif;
    setUiPref("controls_banner_closed", false);      // un nouveau changement d'état ré-affiche le bandeau
    applyControlsUi();                               // l'interrupteur et le bandeau suffisent : pas de message en plus
    if (currentViewName === "journalisation") renderJournalisation();
  } catch (err) {
    showInfoModal("Interrupteur non modifié", "<p>" + escapeHtml(err.message) + "</p>");
  } finally { btn.disabled = false; }
}
function toggleControles() {
  if (state.controles === null) return;
  if (state.controles === false) { setControles(true); return; }        // réactiver : immédiat
  askConfirm("Le serveur ne bloquera plus vos actions d'administrateur : vous pourrez corriger l'accueil, remplir et valider une feuille de soins, puis servir une ordonnance. " +
    "Les autres profils restent soumis aux contrôles. Cette désactivation est tracée au journal et déclenche une alerte de sécurité.",
    () => setControles(false), { title: "Passer en mode supervision ?", confirmLabel: "Désactiver les contrôles" });
}
document.getElementById("controlsBtn").addEventListener("click", toggleControles);
document.getElementById("controlsBannerBtn").addEventListener("click", () => setControles(true));
document.getElementById("controlsBannerClose").addEventListener("click", () => { setUiPref("controls_banner_closed", true); applyControlsUi(); });

// Une session expirée (jeton refusé) ramène à l'écran de connexion avec un message clair.
window.onApiUnauthorized = function () {
  if (!state.currentUser) return;
  performLogout({ expired: true });
};

/* ---------------------------------------------------------------------- */
/* Écran de connexion : animations "médicales / stratosphériques"          */
/* ---------------------------------------------------------------------- */

function buildLoginParticles() {
  const layer = document.getElementById("loginParticles");
  if (!layer) return;
  layer.innerHTML = "";
  const count = 28;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "med-particle";
    const size = Math.random() * 5 + 3;
    p.style.width = size + "px";
    p.style.height = size + "px";
    p.style.left = Math.random() * 100 + "%";
    p.style.setProperty("--drift", (Math.random() * 60 - 30) + "px");
    p.style.animationDuration = (Math.random() * 12 + 14) + "s";
    p.style.animationDelay = (Math.random() * -24) + "s";
    layer.appendChild(p);
  }
}

let loginDnaAnimId = null;
function buildLoginDna() {
  const helix = document.getElementById("loginDnaHelix");
  if (!helix) return;
  helix.innerHTML = "";
  const LEVELS = 16;
  const spacing = 24;
  const amplitude = 54;
  const nodes = [];
  for (let i = 0; i < LEVELS; i++) {
    const a = document.createElement("div");
    a.className = "dna-node a";
    const b = document.createElement("div");
    b.className = "dna-node b";
    const rung = document.createElement("div");
    rung.className = "dna-rung";
    helix.appendChild(rung);
    helix.appendChild(a);
    helix.appendChild(b);
    nodes.push({ a: a, b: b, rung: rung, y: i * spacing });
  }

  let t = 0;
  function frame() {
    t += 0.014;
    nodes.forEach((n, i) => {
      const phase = t + i * 0.35;
      const xA = Math.sin(phase) * amplitude;
      const xB = -xA;
      const depth = Math.cos(phase);
      const scaleA = 0.6 + (depth + 1) / 2 * 0.6;
      const scaleB = 0.6 + (1 - (depth + 1) / 2) * 0.6;

      n.a.style.top = n.y + "px";
      n.a.style.transform = "translate(calc(-50% + " + xA.toFixed(1) + "px), -50%) scale(" + scaleA.toFixed(2) + ")";
      n.a.style.opacity = (0.3 + (depth + 1) / 2 * 0.6).toFixed(2);

      n.b.style.top = n.y + "px";
      n.b.style.transform = "translate(calc(-50% + " + xB.toFixed(1) + "px), -50%) scale(" + scaleB.toFixed(2) + ")";
      n.b.style.opacity = (0.3 + (1 - (depth + 1) / 2) * 0.6).toFixed(2);

      const left = Math.min(xA, xB);
      const width = Math.abs(xA - xB);
      n.rung.style.top = n.y + "px";
      n.rung.style.left = "calc(50% + " + left.toFixed(1) + "px)";
      n.rung.style.width = width.toFixed(1) + "px";
      n.rung.style.opacity = (0.12 + Math.abs(depth) * 0.12).toFixed(2);
    });
    loginDnaAnimId = requestAnimationFrame(frame);
  }
  frame();
}
function stopLoginDna() {
  if (loginDnaAnimId) cancelAnimationFrame(loginDnaAnimId);
  loginDnaAnimId = null;
}

/* ---------------------------------------------------------------------- */
/* Écran de connexion : validation, bascule mot de passe, authentification */
/* simulée (aucun backend connecté pour l'instant)                        */
/* ---------------------------------------------------------------------- */

function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

function setFieldError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const err = document.getElementById(errorId);
  if (message) {
    err.textContent = message;
    err.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.classList.add("has-error");
  } else {
    err.textContent = "";
    err.hidden = true;
    input.removeAttribute("aria-invalid");
    input.classList.remove("has-error");
  }
}

// TODO: remplacer par un véritable appel à l'API d'authentification quand elle sera disponible.
// La signature (retourne une Promise) est conçue pour être compatible avec un futur fetch()/API réelle.
function mockAuthenticate(username, password) {
  return new Promise(resolve => {
    setTimeout(() => resolve({ ok: true }), 800);
  });
}

// Transition animée, rapide, entre l'écran de connexion et l'application —
// le logo pulse avec un anneau qui tourne le temps du chargement, puis
// s'efface pour révéler l'app déjà sur la bonne vue (callback).
function playLoginTransition(callback, user, waitFor) {
  const overlay = document.getElementById("loginTransition");
  // Salutation selon l'heure + prénom de la personne qui vient de se connecter.
  const greet = document.getElementById("loginGreeting");
  const first = displayFirstName(user);
  greet.hidden = !user;
  if (user) {
    document.getElementById("loginGreetingHello").textContent = greetingWord() + ",";
    document.getElementById("loginGreetingName").textContent = first || user.nom || "";
  }
  document.getElementById("loginTransitionText").textContent = user ? "Préparation de votre espace…" : "Connexion en cours…";
  document.getElementById("view-login").hidden = true;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("active"));
  window.setTimeout(() => {
    // l'écran d'accueil reste tant que les données ne sont pas là
    Promise.resolve(waitFor).catch(() => { /* l'échec est signalé par bootstrapData */ }).then(() => {
      overlay.classList.add("leaving");
      window.setTimeout(() => {
        overlay.hidden = true;
        overlay.classList.remove("active", "leaving");
        document.getElementById("appShell").hidden = false;
        stopLoginDna();
        callback();
      }, 350);
    });
  }, user ? 1500 : 650);
}

// Gestion des accès par rôle : purement côté front (protection d'affichage
// et de navigation dans cette SPA), puisque l'application n'a pas de backend
// réel — voir §1 du guide de design du projet. Ceci n'est PAS une sécurité
// applicative : sans API à protéger, on ne peut garantir qu'une restriction
// côté serveur. Chaque rôle a la liste des vues autorisées et une vue
// d'atterrissage par défaut à la connexion.
//
// La matrice est modifiable par le Super Admin depuis "Gestion des
// permissions" (state.roleAccess, persistée dans pec_role_access) ; ce
// bloc ne fournit que les valeurs par défaut ("réinitialiser").
const ROLE_ACCESS_DEFAULT = {
  "Super Admin": { views: ["dashboard", "rapports", "nouvelle-pec", "medecin", "pharmacie", "historique", "users", "structures", "journalisation"], landing: "dashboard" },
  "DG": { views: ["dashboard", "rapports", "journalisation"], landing: "dashboard" },
  "Médecin": { views: ["medecin"], landing: "medecin" },
  "Agent hospitalier": { views: ["nouvelle-pec", "historique"], landing: "nouvelle-pec" },
  "Pharmacien": { views: ["pharmacie"], landing: "pharmacie" },
  "Caisse": { views: ["dashboard", "rapports"], landing: "rapports" }
};
// Accès par rôle : valeurs par défaut du front, affinées par les permissions réelles du compte quand le
// serveur les fournit (GET /api/auth/me). Rien n'est enregistré dans le navigateur.
state.roleAccess = JSON.parse(JSON.stringify(ROLE_ACCESS_DEFAULT));
// Permission(s) du serveur dont au moins une est nécessaire pour voir chaque page.
const VIEW_PERMISSIONS = {
  dashboard: ["prestation.lire", "pec.lire"],
  rapports: ["prestation.lire", "pec.lire"],
  "nouvelle-pec": ["prestation.creer"],
  medecin: ["ordonnance.creer", "prestation.lire"],
  pharmacie: ["ordonnance.delivrer", "ordonnance.lire"],
  historique: ["prestation.lire", "pec.lire"],
  users: ["utilisateur.lire"],
  structures: ["structure.lire"],
  journalisation: ["journal.lire", "utilisateur.lire"],
  permissions: ["permission.lire"]
};
function permittedByServer(view) {
  if (!state.permissions) return true;                    // le serveur ne dit rien : les droits du rôle suffisent
  const needed = VIEW_PERMISSIONS[view];
  return !needed || needed.some(code => state.permissions.has(code));
}

// "soins" (feuille de soins) n'a pas d'item de sidebar propre : on y accède
// depuis "nouvelle-pec" (agent) ou "medecin" (validation) — donc autorisé
// dès que l'un des deux l'est, sans case à cocher dédiée dans la matrice.
function getEffectiveViews(role) {
  const access = state.roleAccess[role];
  if (!access) return null;
  const views = access.views.slice();
  if (views.includes("nouvelle-pec") || views.includes("medecin")) {
    if (!views.includes("soins")) views.push("soins");
    if (!views.includes("dossier-patient")) views.push("dossier-patient");
  }
  return views.filter(v => permittedByServer(v));
}

// Le cloisonnement par rôle (barre latérale + accès aux vues) est
// temporairement désactivé : la gestion réelle des rôles/permissions viendra
// avec le backend. La matrice (state.roleAccess) et l'écran "Gestion des
// permissions" restent pleinement fonctionnels pour la préparer à l'avance —
// il suffira de repasser ce drapeau à true pour réactiver l'application
// des restrictions ci-dessous (dont le verrou du Super Admin sur cet écran).
const ROLE_ENFORCEMENT_ENABLED = true;

function applyRoleAccess(user) {
  if (!ROLE_ENFORCEMENT_ENABLED) {
    document.querySelectorAll(".nav-item[data-view]").forEach(btn => { btn.hidden = false; });
    return;
  }
  const isSuperAdmin = !!user && user.role === "Super Admin";
  const views = user ? getEffectiveViews(user.role) : null;
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    if (btn.dataset.view === "permissions") { btn.hidden = !isSuperAdmin; return; }
    btn.hidden = !!views && !views.includes(btn.dataset.view);
  });
}

// Vrai si la vue est autorisée pour l'utilisateur connecté — appelé par
// goToView() pour empêcher qu'un appel direct (bouton, raccourci) contourne
// le cloisonnement visuel de la barre latérale.
function isViewAllowed(name) {
  if (!ROLE_ENFORCEMENT_ENABLED) return true;
  if (!state.currentUser) return true;
  if (name === "permissions") return state.currentUser.role === "Super Admin";
  const views = getEffectiveViews(state.currentUser.role);
  if (!views) return true;
  return views.includes(name);
}

// Reflète l'utilisateur réellement connecté dans le menu utilisateur de la
// topbar (déclencheur + en-tête du dropdown, tous deux à l'intérieur de
// #userMenu) — jusqu'ici figé sur "Alice NDONG / Super Admin".
function updateUserPill(user, email) {
  const name = user ? (user.prenom + " " + user.nom) : (email || "—");
  const role = user ? user.role : "Utilisateur";
  const initials = user
    ? ((user.prenom[0] || "") + (user.nom[0] || "")).toUpperCase()
    : (email ? email.slice(0, 2).toUpperCase() : "??");

  ["userMenu", "sidebarUser"].forEach(id => {
    const scope = document.getElementById(id);
    if (!scope) return;
    scope.querySelectorAll(".name").forEach(el => { el.textContent = name; });
    scope.querySelectorAll(".role").forEach(el => { el.textContent = role; });
    scope.querySelectorAll(".avatar").forEach(el => {
      const dot = el.querySelector(".avatar-dot");   // pastille « en ligne » à conserver
      el.textContent = initials;
      if (dot) el.appendChild(dot);
    });
  });
  renderProfileSwitcher();
  updateGreeting();
}

/* ---------------------------------------------------------------------- */
/* Profils : un compte peut en porter plusieurs (un profil = un rôle = un    */
/* ensemble d'interfaces). Le profil ACTIF décide des écrans et des droits ; */
/* on change de profil depuis le menu utilisateur (POST /api/auth/profil).  */
/* ---------------------------------------------------------------------- */

const ALL_API_ROLES = Object.keys(API_ROLE_TO_FRONT_ROLE);
const VIEW_LABELS = { dashboard: "Tableau de bord", rapports: "Rapports", "nouvelle-pec": "Nouvelle prise en charge", medecin: "Espace Médecin", pharmacie: "Espace Pharmacien",
  historique: "Historique PEC", users: "Gestion des utilisateurs", structures: "Structures", journalisation: "Journalisation", permissions: "Gestion des permissions" };

// Interfaces (écrans) qu'ouvre un profil, selon la matrice d'accès (state.roleAccess).
function profileInterfaces(apiRole) {
  const front = API_ROLE_TO_FRONT_ROLE[apiRole] || apiRole;
  const access = state.roleAccess[front];
  const views = access ? access.views.slice() : [];
  if (front === "Super Admin") views.push("permissions");
  return views.map(v => VIEW_LABELS[v] || v);
}

function renderProfileSwitcher() {
  const u = state.currentUser;
  const wrap = document.getElementById("userMenuProfiles");
  const list = document.getElementById("userMenuProfilesList");
  if (!wrap || !list) return;
  if (!u || !u.profils || u.profils.length < 2) { wrap.hidden = true; list.innerHTML = ""; return; }
  wrap.hidden = false;
  const active = FRONT_ROLE_TO_API_ROLE[u.role] || u.role;
  list.innerHTML = u.profils.map(p =>
    '<button type="button" class="udp-item' + (p.api === active ? " active" : "") + '" data-profil="' + p.api + '" role="menuitemradio" aria-checked="' + (p.api === active) + '">' +
      '<span class="udp-dot" aria-hidden="true"></span><span>' + escapeHtml(p.label) + "</span>" + (p.api === u.profilPrincipal ? "<small>principal</small>" : "") + "</button>").join("");
}
document.getElementById("userMenuProfilesList").addEventListener("click", e => {
  const b = e.target.closest("[data-profil]");
  if (b && !b.classList.contains("active")) switchProfil(b.dataset.profil);
});

let switchingProfil = false;
async function switchProfil(profilApi) {
  if (switchingProfil || !state.currentUser) return;
  switchingProfil = true;
  setUserMenuOpen(false);
  try {
    // rien de non enregistré ne doit se perdre dans le changement
    try { await persistFeuilles(); } catch (err) {
      showInfoModal("Changement de profil impossible", "<p>" + escapeHtml(err.message) + "</p><p class=\"hint\">Des modifications ne sont pas encore enregistrées : elles restent affichées.</p>");
      return;
    }
    let user;
    try { user = mapBackendUser((await apiSwitchProfil(profilApi)).user); } catch (err) {
      showInfoModal("Changement de profil impossible", "<p>" + escapeHtml(err.message) + "</p>");
      return;
    }
    // Comme une connexion : les données sont rechargées avec les droits du nouveau profil, puis on ouvre son interface.
    resetForProfileChange();
    state.currentUser = user;
    persistSession();
    applyRoleAccess(user);
    updateUserPill(user, user.email);
    const ready = bootstrapData();
    playLoginTransition(() => {
      applyRoleAccess(state.currentUser);
      const access = state.roleAccess[state.currentUser.role];
      goToView(access && access.landing && isViewAllowed(access.landing) ? access.landing : firstAllowedView());
      afterLogin(false);
      toast({ kind: "success", title: "Profil actif : " + user.role, text: "Vous travaillez maintenant avec ce profil.", ms: 3500 });
    }, user, ready);
  } finally { switchingProfil = false; }
}
function resetForProfileChange() {
  setDrawerOpen(false);
  setNotifPanelOpen(false);
  hideNavTip();
  state.queueScope = null;
  state.editingEntryId = null;
  state.compteurs = null;
  state.controles = null;
  applyControlsUi();
  clearPharmaResults();
  viewHistory = [];
}


let loginSubmitting = false;
document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  if (loginSubmitting) return;

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPass").value;
  let valid = true;

  if (!username) {
    setFieldError("loginUsername", "loginUsernameError", "Le nom d'utilisateur est obligatoire.");
    valid = false;
  } else {
    setFieldError("loginUsername", "loginUsernameError", "");
  }

  if (!password) {
    setFieldError("loginPass", "loginPassError", "Le mot de passe est obligatoire.");
    valid = false;
  } else {
    setFieldError("loginPass", "loginPassError", "");
  }

  if (!valid) return;

  loginSubmitting = true;
  const btn = document.getElementById("loginSubmitBtn");
  btn.disabled = true;
  btn.classList.add("loading");
  btn.querySelector(".btn-label").textContent = "Connexion...";

  authenticate(username, password).then(result => {
    loginSubmitting = false;
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.querySelector(".btn-label").textContent = "Se connecter";

    if (result.error || !result.user) {
      // Le serveur a répondu et refusé la connexion (identifiants invalides, compte désactivé…) ; il trace lui-même la tentative.
      setFieldError("loginPass", "loginPassError", result.error || "Identifiants invalides.");
      return;
    }

    // Compte créé (ou mot de passe réinitialisé) par un administrateur : le mot de passe reçu est temporaire.
    // Le serveur ferme toutes les routes métier tant que le titulaire n'a pas choisi le sien.
    if (result.user.doitChangerMdp) { promptFirstPassword(username, password); return; }
    enterApp(result.user, username);
  });
});

// Entrée dans l'application une fois la connexion acceptée (et le mot de passe personnel choisi).
function enterApp(user, username) {
  beginSession(user);
  applyRoleAccess(state.currentUser);
  updateUserPill(state.currentUser, username);
  // Les données (feuilles, règlements, annuaires…) se chargent pendant l'animation d'accueil.
  const ready = bootstrapData();
  playLoginTransition(() => {
    applyRoleAccess(state.currentUser);          // les permissions du serveur affinent le menu
    const access = state.roleAccess[state.currentUser.role];
    goToView(access && access.landing && isViewAllowed(access.landing) ? access.landing : firstAllowedView());
    afterLogin(true);
  }, state.currentUser, ready);
}

/* ---- Première connexion : choisir son mot de passe (PUT /api/auth/change-password) ---- */
const forcePasswordModal = document.getElementById("forcePasswordModal");
let forcePasswordUsername = "";
function promptFirstPassword(username, temporary) {
  forcePasswordUsername = username;
  document.getElementById("forcePasswordForm").reset();
  document.getElementById("fp-ancien").value = temporary || "";
  const err = document.getElementById("fp-error");
  err.hidden = true;
  err.textContent = "";
  forcePasswordModal.hidden = false;
  window.setTimeout(() => document.getElementById("fp-nouveau").focus(), 60);
}
function closeForcePassword() {
  forcePasswordModal.hidden = true;
  document.getElementById("forcePasswordForm").reset();
}
document.getElementById("fp-cancel").addEventListener("click", () => {
  apiLogout();                                   // le jeton restreint n'a plus d'usage
  closeForcePassword();
  document.getElementById("loginForm").reset();
});
document.getElementById("forcePasswordForm").addEventListener("submit", e => {
  e.preventDefault();
  const ancien = document.getElementById("fp-ancien").value;
  const nouveau = document.getElementById("fp-nouveau").value;
  const confirm = document.getElementById("fp-confirm").value;
  const err = document.getElementById("fp-error");
  const fail = msg => { err.textContent = msg; err.hidden = false; };
  err.hidden = true;
  if (nouveau.length < 4) return fail("Le nouveau mot de passe doit comporter au moins 4 caractères.");
  if (nouveau === ancien) return fail("Le nouveau mot de passe doit être différent du mot de passe temporaire.");
  if (nouveau !== confirm) return fail("La confirmation ne correspond pas au nouveau mot de passe.");
  const btn = document.getElementById("fp-submit");
  btn.disabled = true;
  apiChangePassword(ancien, nouveau).then(() => {
    closeForcePassword();
    const s = apiCurrentSession();
    enterApp(mapBackendUser(s.user), forcePasswordUsername);
  }).catch(e2 => fail(e2.message || "Le mot de passe n'a pas pu être enregistré."))
    .finally(() => { btn.disabled = false; });
});

function firstAllowedView() {
  const b = document.querySelector(".nav-item[data-view]:not([hidden])");
  return b ? b.dataset.view : "dashboard";
}

// Authentification : POST /api/auth/login. Aucun compte local, aucun repli : le serveur décide.
async function authenticate(username, password) {
  try {
    const session = await apiLogin(username, password);
    return { user: mapBackendUser(session.user) };
  } catch (err) {
    return { error: err.message || "Identifiants invalides." };
  }
}

document.getElementById("togglePass").addEventListener("click", function () {
  const input = document.getElementById("loginPass");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  this.setAttribute("aria-pressed", String(show));
  this.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
  this.querySelector(".eye-on").hidden = show;
  this.querySelector(".eye-off").hidden = !show;
});

// Échappe un texte avant de l'insérer dans un innerHTML (ex : message
// d'erreur API affiché tel quel dans showInfoModal).
function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

// Panneau d'information générique (mot de passe oublié / création de compte / mentions légales).
// Prêt à être remplacé par une vraie navigation si un système de routage est introduit.
// onClose (optionnel) : appelé quand la modale se ferme, quel que soit le
// bouton utilisé (X ou Fermer) — utilisé par ex. pour vider un formulaire
// une fois que l'utilisateur a pris connaissance du message.
let infoModalOnClose = null;
function showInfoModal(title, bodyHtml, onClose) {
  document.querySelector("#infoModal .modal").className = "modal";
  document.getElementById("infoModalTitle").textContent = title;
  document.getElementById("infoModalBody").innerHTML = bodyHtml;
  infoModalOnClose = onClose || null;
  document.getElementById("infoModal").hidden = false;
}
function closeInfoModal() {
  document.getElementById("infoModal").hidden = true;
  const cb = infoModalOnClose;
  infoModalOnClose = null;
  if (cb) cb();
}
document.getElementById("closeInfoModal").addEventListener("click", closeInfoModal);
document.getElementById("closeInfoModalBtn").addEventListener("click", closeInfoModal);

// Modale de confirmation (suppressions) à accent rouge — remplace les confirm()
// natifs du navigateur pour rester cohérent avec le design de l'application.
let confirmModalCallback = null;
function askConfirm(message, onConfirm, opts) {
  // Accent rouge pour une suppression ; neutre (opts.neutral) pour une
  // confirmation positive, comme la délivrance d'un médicament.
  const neutral = !!(opts && opts.neutral);
  document.querySelector("#confirmModal .modal").className = "modal " + (neutral ? "modal-accent-blue" : "modal-danger");
  document.querySelector("#confirmModal .modal-head-icon").hidden = neutral;
  document.getElementById("confirmModalBtn").className = neutral ? "btn-primary" : "btn-danger";
  document.getElementById("confirmModalTitle").textContent = (opts && opts.title) || "Confirmer la suppression";
  document.getElementById("confirmModalBody").textContent = message;
  document.getElementById("confirmModalBtn").textContent = (opts && opts.confirmLabel) || "Supprimer";
  confirmModalCallback = onConfirm;
  document.getElementById("confirmModal").hidden = false;
}
function closeConfirmModal() {
  document.getElementById("confirmModal").hidden = true;
  confirmModalCallback = null;
}
document.getElementById("closeConfirmModal").addEventListener("click", closeConfirmModal);
document.getElementById("cancelConfirmModal").addEventListener("click", closeConfirmModal);
document.getElementById("confirmModalBtn").addEventListener("click", () => {
  const cb = confirmModalCallback;
  closeConfirmModal();
  if (cb) cb();
});

function performLogout(opts) {
  if (!(opts && opts.expired)) audit("auth.deconnexion", { message: "Déconnexion" });
  apiLogout();
  clearSession();
  setDrawerOpen(false);
  setNotifPanelOpen(false);
  hideNavTip();
  document.getElementById("toastStack").innerHTML = "";
  document.title = BASE_TITLE;
  document.getElementById("appShell").hidden = true;
  document.getElementById("view-login").hidden = false;
  document.getElementById("loginForm").reset();
  setFieldError("loginUsername", "loginUsernameError", "");
  setFieldError("loginPass", "loginPassError", "");
  resetSearch();
  state.currentUser = null;
  applyRoleAccess(null);
  goToView("dashboard");   // en quittant la feuille de soins, la saisie en cours est gardée en brouillon
  state.editingEntryId = null;
  state.queueScope = null;
  viewHistory = [];
  feuilleSnapshot.clear();
  state.historique = []; state.reglements = []; state.reglementsHopitaux = []; state.medecins = []; state.catalogue = [];
  state.notifications = []; state.apiUsers = null; state.permissions = null; state.compteurs = null;
  state.controles = null; applyControlsUi();
  buildLoginParticles();
  buildLoginDna();
  if (opts && opts.expired) setFieldError("loginPass", "loginPassError", "Votre session a expiré : reconnectez-vous.");
}
document.getElementById("logoutBtn").addEventListener("click", performLogout);

/* ---------------------------------------------------------------------- */
/* Menu utilisateur (topbar) : dropdown profil                            */
/* ---------------------------------------------------------------------- */

const userMenuTrigger = document.getElementById("userMenuTrigger");
const userDropdown = document.getElementById("userDropdown");

function setUserMenuOpen(open) {
  userDropdown.classList.toggle("open", open);
  userMenuTrigger.setAttribute("aria-expanded", String(open));
}
userMenuTrigger.addEventListener("click", e => {
  e.stopPropagation();
  setUserMenuOpen(!userDropdown.classList.contains("open"));
});
document.addEventListener("click", e => {
  if (!document.getElementById("userMenu").contains(e.target)) setUserMenuOpen(false);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") setUserMenuOpen(false);
});

function openProfilModal() {
  const u = state.currentUser;
  document.getElementById("profil-nom").value = u ? (u.prenom + " " + u.nom) : "";
  document.getElementById("profil-email").value = u ? u.email : "";
  // profil actif, puis les autres profils du compte s'il en a
  const others = u && u.profils ? u.profils.filter(p => p.label !== u.role).map(p => p.label) : [];
  document.getElementById("profil-role").value = u ? u.role + (others.length ? " (autres profils : " + others.join(", ") + ")" : "") : "Utilisateur";
  const etabWrap = document.getElementById("profil-etab-wrap");
  if (u && u.etablissement) {
    document.getElementById("profil-etab").value = u.etablissement;
    etabWrap.hidden = false;
  } else {
    etabWrap.hidden = true;
  }
  // Nom, e-mail et rôle sont ceux du compte (modifiables par l'administrateur) ; seul le mot de passe se change ici.
  document.getElementById("profil-nom").disabled = true;
  document.getElementById("profil-password-wrap").hidden = false;
  document.getElementById("profil-pass-ancien").value = "";
  document.getElementById("profil-pass-nouveau").value = "";
  document.getElementById("profilModal").hidden = false;
}
document.getElementById("userMenuProfil").addEventListener("click", () => { setUserMenuOpen(false); openProfilModal(); });
document.getElementById("closeProfilModal").addEventListener("click", () => { document.getElementById("profilModal").hidden = true; });
document.getElementById("cancelProfilModal").addEventListener("click", () => { document.getElementById("profilModal").hidden = true; });
document.getElementById("profilForm").addEventListener("submit", e => {
  e.preventDefault();
  const u = state.currentUser;
  if (!u) { document.getElementById("profilModal").hidden = true; return; }
  const ancien = document.getElementById("profil-pass-ancien").value;
  const nouveau = document.getElementById("profil-pass-nouveau").value;
  if (ancien || nouveau) {
    apiChangePassword(ancien, nouveau).then(() => {
      document.getElementById("profilModal").hidden = true;
      showInfoModal("Mot de passe modifié", "<p>Votre mot de passe a été mis à jour.</p>");
    }).catch(err => showInfoModal("Erreur", "<p>" + escapeHtml(err.message) + "</p>"));
    return;
  }
  document.getElementById("profilModal").hidden = true;
});

document.getElementById("userMenuParams").addEventListener("click", () => {
  setUserMenuOpen(false);
  showInfoModal("Paramètres", "<p>Vos données sont enregistrées dans la base de la CNAMGS : rien n'est conservé dans ce navigateur, hormis la session de cet onglet.</p>" +
    "<p>Pour changer votre mot de passe, ouvrez « Mon compte ».</p>");
});
document.getElementById("userMenuNotifs").addEventListener("click", () => {
  setUserMenuOpen(false);
  openNotifPanel();
});
document.getElementById("userMenuHelp").addEventListener("click", () => {
  setUserMenuOpen(false);
  showInfoModal("Aide / Support", "<p>Pour toute question, contactez votre administrateur CNAMGS. Une page d'aide dédiée sera ajoutée prochainement.</p>");
});
document.getElementById("userMenuLogout").addEventListener("click", () => {
  setUserMenuOpen(false);
  performLogout();
});

/* ---------------------------------------------------------------------- */
/* Barre latérale : réduction, tiroir mobile, pastille qui glisse, halo,   */
/* infobulles, « pouls du circuit »                                        */
/* ---------------------------------------------------------------------- */

const sidebarEl = document.getElementById("sidebar");
const navScrollEl = document.getElementById("sidebarNav");
const navIndicatorEl = document.getElementById("navIndicator");
const navTipEl = document.getElementById("navTip");
const sidebarBackdropEl = document.getElementById("sidebarBackdrop");
const topbarMenuBtn = document.getElementById("topbarMenuBtn");
const MOBILE_MQ = window.matchMedia("(max-width: 980px)");
function isMobileNav() { return MOBILE_MQ.matches; }

// La pastille lumineuse glisse jusqu'à l'item actif (position calculée, pas de saut).
function placeNavIndicator() {
  const active = navScrollEl.querySelector(".nav-item.active:not([hidden])");
  if (!active || active.offsetParent === null) {
    navIndicatorEl.classList.remove("ready");
    navScrollEl.classList.remove("has-indicator");
    return;
  }
  navIndicatorEl.style.height = active.offsetHeight + "px";
  navIndicatorEl.style.transform = "translateY(" + active.offsetTop + "px)";
  navIndicatorEl.classList.add("ready");
  navScrollEl.classList.add("has-indicator");
}
window.addEventListener("resize", () => window.requestAnimationFrame(placeNavIndicator));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeNavIndicator);

function hideNavTip() { navTipEl.hidden = true; }
function showNavTip(el) {
  if (isMobileNav() || !sidebarEl.classList.contains("collapsed") || !el.dataset.tip) return;
  const r = el.getBoundingClientRect();
  navTipEl.textContent = el.dataset.tip;
  navTipEl.style.left = (r.right + 14) + "px";
  navTipEl.style.top = (r.top + r.height / 2) + "px";
  navTipEl.hidden = false;
}
sidebarEl.addEventListener("pointerover", e => { const el = e.target.closest("[data-tip]"); if (el) showNavTip(el); });
sidebarEl.addEventListener("pointerout", e => { if (e.target.closest("[data-tip]")) hideNavTip(); });
sidebarEl.addEventListener("focusin", e => { const el = e.target.closest("[data-tip]"); if (el) showNavTip(el); });
sidebarEl.addEventListener("focusout", hideNavTip);
navScrollEl.addEventListener("scroll", hideNavTip, { passive: true });

// Halo qui suit le curseur sur l'item survolé.
sidebarEl.addEventListener("pointermove", e => {
  const el = e.target.closest(".nav-item, .btn-logout");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", (e.clientX - r.left) + "px");
  el.style.setProperty("--my", (e.clientY - r.top) + "px");
});

function setSidebarCollapsed(collapsed, persist) {
  sidebarEl.classList.toggle("collapsed", collapsed);
  if (persist !== false) setUiPref("sidebar_collapsed", collapsed);
  hideNavTip();
  window.setTimeout(placeNavIndicator, 320); // après la transition de largeur
}
document.getElementById("sidebarCollapseBtn").addEventListener("click", function () {
  setSidebarCollapsed(!sidebarEl.classList.contains("collapsed"));
});
// Sans préférence enregistrée, les écrans de taille tablette démarrent avec le menu réduit.
(function initSidebarState() {
  const saved = uiPref("sidebar_collapsed", null);
  setSidebarCollapsed(saved === null ? window.innerWidth <= 1180 : !!saved, false);
})();

// Tiroir (tablette / téléphone) : bouton ☰ dans l'en-tête, voile, balayage, Échap.
function syncSidebarInert() {
  // Hors champ sur mobile, le menu sort de l'ordre de tabulation et des lecteurs d'écran.
  sidebarEl.inert = isMobileNav() && !sidebarEl.classList.contains("open");
}
function setDrawerOpen(open) {
  if (open && !isMobileNav()) return;
  sidebarEl.classList.toggle("open", open);
  document.body.classList.toggle("drawer-open", open);
  topbarMenuBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    sidebarBackdropEl.hidden = false;
    window.requestAnimationFrame(() => sidebarBackdropEl.classList.add("show"));
  } else {
    sidebarBackdropEl.classList.remove("show");
    window.setTimeout(() => { if (!sidebarEl.classList.contains("open")) sidebarBackdropEl.hidden = true; }, 260);
  }
  syncSidebarInert();
  if (open) {
    const first = sidebarEl.querySelector(".nav-item.active:not([hidden])") || sidebarEl.querySelector(".nav-item:not([hidden])");
    if (first) first.focus({ preventScroll: true });
  } else if (document.activeElement && sidebarEl.contains(document.activeElement)) {
    topbarMenuBtn.focus({ preventScroll: true });
  }
}
topbarMenuBtn.addEventListener("click", () => setDrawerOpen(!sidebarEl.classList.contains("open")));
sidebarBackdropEl.addEventListener("click", () => setDrawerOpen(false));
document.getElementById("sidebarCloseBtn").addEventListener("click", () => setDrawerOpen(false));
MOBILE_MQ.addEventListener("change", () => { setDrawerOpen(false); syncSidebarInert(); hideNavTip(); window.requestAnimationFrame(placeNavIndicator); });
syncSidebarInert();

let swipeX0 = null, swipeY0 = null;
document.addEventListener("touchstart", e => { const t = e.touches[0]; swipeX0 = t.clientX; swipeY0 = t.clientY; }, { passive: true });
document.addEventListener("touchend", e => {
  if (swipeX0 === null) return;
  const t = e.changedTouches[0], dx = t.clientX - swipeX0, dy = t.clientY - swipeY0;
  const open = sidebarEl.classList.contains("open");
  if (isMobileNav() && !document.getElementById("appShell").hidden && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
    if (!open && swipeX0 < 26 && dx > 0) setDrawerOpen(true);
    else if (open && dx < 0) setDrawerOpen(false);
  }
  swipeX0 = swipeY0 = null;
}, { passive: true });

// Pastilles de la barre latérale : patients qui attendent le médecin, ordonnances à servir.
function pharmaPendingCount() {
  if (state.compteurs && state.compteurs.ordonnances_a_servir != null) return Number(state.compteurs.ordonnances_a_servir) || 0;   // compteur du serveur
  return state.historique.filter(h => isSentToPharmacy(h) && entryHasRemaining(h)).length;
}
function refreshNavLive() {
  if (!state.currentUser) return;
  refreshPendingBadge();
  const rx = pharmaPendingCount();
  const pb = document.getElementById("pharmaNavBadge");
  pb.textContent = rx;
  pb.hidden = rx === 0;
}
window.setInterval(refreshNavLive, 4000);

/* ---------------------------------------------------------------------- */
/* En-tête : horloge vivante, salutation par l'heure, jauge de défilement   */
/* ---------------------------------------------------------------------- */

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const SUN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

// « Bonsoir » à partir de 18 h et jusqu'à 5 h, « Bonjour » le reste du temps.
function isEvening(d) { const h = (d || new Date()).getHours(); return h >= 18 || h < 5; }
function greetingWord(d) { return isEvening(d) ? "Bonsoir" : "Bonjour"; }
function displayFirstName(u) {
  const p = ((u && u.prenom) || "").trim().split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : "";
}

function updateGreeting() {
  const el = document.getElementById("topbarGreet");
  if (!el) return;
  const night = isEvening();
  const name = displayFirstName(state.currentUser);
  document.getElementById("greetText").textContent = greetingWord() + (name ? ", " + name : "");
  const mode = night ? "night" : "day";
  if (el.dataset.mode !== mode) {   // on ne recrée l'icône que si le moment de la journée change (le soleil tourne en continu)
    el.dataset.mode = mode;
    document.getElementById("greetIco").innerHTML = night ? MOON_SVG : SUN_SVG;
    el.classList.toggle("is-night", night);
  }
}

function updateClock() {
  const t = document.getElementById("clockTime");
  if (!t) return;
  const d = new Date();
  t.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  const txt = JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear();
  document.getElementById("clockDate").textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
  if (d.getSeconds() === 0) updateGreeting();
}
setInterval(updateClock, 1000);

function updateScrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  document.getElementById("topbarProgress").style.setProperty("--p", max > 4 ? Math.min(1, window.scrollY / max).toFixed(3) : "0");
}
window.addEventListener("scroll", updateScrollProgress, { passive: true });
window.addEventListener("resize", updateScrollProgress);

/* ---------------------------------------------------------------------- */
/* Tableaux : sur téléphone, chaque ligne devient une fiche « libellé —     */
/* valeur ». Les libellés viennent de l'en-tête de chaque tableau ; la mise   */
/* en forme est purement CSS (voir « stack » dans style.css).                */
/* ---------------------------------------------------------------------- */

function labelDataTables() {
  document.querySelectorAll("table.data-table:not(.no-stack)").forEach(table => {
    table.classList.add("stack");
    const heads = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent.trim());
    table.querySelectorAll("tbody tr").forEach(tr => {
      if (tr.children.length !== heads.length) return;   // ligne à cellule fusionnée (« Chargement… ») : pas de libellé
      Array.from(tr.children).forEach((td, i) => { if (td.getAttribute("data-label") !== heads[i]) td.setAttribute("data-label", heads[i]); });
    });
  });
}
let labelTablesQueued = false;
new MutationObserver(() => {
  if (labelTablesQueued) return;
  labelTablesQueued = true;
  window.requestAnimationFrame(() => { labelTablesQueued = false; labelDataTables(); });
}).observe(document.getElementById("appShell"), { childList: true, subtree: true });
labelDataTables();

/* ---------------------------------------------------------------------- */
/* Toasts : petits messages éphémères                                      */
/* ---------------------------------------------------------------------- */

const TOAST_ICONS = {
  info: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>',
  success: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  warn: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18h.01"/></svg>',
  urgent: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  security: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M12 8v4"/><path d="M12 15.5h.01"/></svg>'
};
function toast(o) {
  const stack = document.getElementById("toastStack");
  const kind = o.kind || "info";
  const el = document.createElement("div");
  el.className = "toast toast-" + kind;
  el.setAttribute("role", kind === "urgent" ? "alert" : "status");
  const ms = o.sticky ? 0 : (o.ms || 5200);
  el.innerHTML =
    '<div class="toast-ico">' + (TOAST_ICONS[kind] || TOAST_ICONS.info) + "</div>" +
    '<div class="toast-body"><b>' + escapeHtml(o.title || "") + "</b>" + (o.text ? "<span>" + escapeHtml(o.text) + "</span>" : "") + "</div>" +
    '<button type="button" class="toast-x" aria-label="Fermer">&times;</button>' +
    (ms ? '<i class="toast-bar" style="animation-duration:' + ms + 'ms"></i>' : "");
  const close = () => {
    if (el.classList.contains("leaving")) return;
    el.classList.add("leaving");
    window.setTimeout(() => el.remove(), 300);
  };
  el.querySelector(".toast-x").addEventListener("click", e => { e.stopPropagation(); close(); });
  if (o.onClick) {
    el.dataset.click = "1";
    el.addEventListener("click", () => { close(); o.onClick(); });
  }
  stack.appendChild(el);
  while (stack.children.length > 4) stack.firstElementChild.remove();
  if (ms) window.setTimeout(close, ms);
  return el;
}

/* ---------------------------------------------------------------------- */
/* Session : l'actualisation de la page ne déconnecte plus                  */
/* La session vit dans sessionStorage : elle survit au rechargement de la   */
/* page, mais pas à la fermeture de l'onglet (poste partagé à l'hôpital /   */
/* à la pharmacie) et chaque onglet peut porter un utilisateur différent.   */
/* ---------------------------------------------------------------------- */

const SESSION_KEY = "pec_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
let sessionMeta = null; // { sessionId, startedAt } de la session en cours

function newId(prefix) { return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function readSessionRecord() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
}
function persistSession() {
  if (!state.currentUser || !sessionMeta) return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      sessionId: sessionMeta.sessionId,
      startedAt: sessionMeta.startedAt,
      expiresAt: Date.now() + SESSION_TTL_MS,
      user: state.currentUser,
      view: currentViewName,
      ctx: navContext
    }));
  } catch (e) { /* stockage indisponible : la session ne survivra simplement pas à l'actualisation */ }
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  sessionMeta = null;
  document.documentElement.classList.remove("has-session");
}
function beginSession(user) {
  sessionMeta = { sessionId: newId("S"), startedAt: Date.now() };
  state.currentUser = user;
  persistSession();
}

// Rétablit l'utilisateur et la page où il se trouvait ; résout à faux s'il n'y a rien à rétablir.
async function restoreSession() {
  const rec = readSessionRecord();
  if (!rec || !rec.user || rec.expiresAt <= Date.now() || apiTokenExpired()) {
    apiLogout();
    clearSession();
    return false;
  }
  const user = mapBackendUser(apiCurrentSession().user);
  if (!user) { clearSession(); return false; }
  if (user.doitChangerMdp) { apiLogout(); clearSession(); return false; }   // mot de passe temporaire : on repasse par la connexion

  sessionMeta = { sessionId: rec.sessionId || newId("S"), startedAt: rec.startedAt || Date.now() };
  state.currentUser = user;
  applyRoleAccess(user);
  updateUserPill(user, user.email);
  await bootstrapData();                        // les données viennent du serveur ; l'écran de chargement reste affiché
  applyRoleAccess(user);
  document.getElementById("view-login").hidden = true;
  document.getElementById("appShell").hidden = false;
  document.documentElement.classList.remove("has-session");
  stopLoginDna();

  const access = state.roleAccess[user.role];
  let view = rec.view;
  // La feuille de soins et le dossier dépendent d'un contexte en mémoire : on revient à leur vue d'origine.
  if (view === "soins" || view === "dossier-patient") view = rec.ctx || (access && access.landing) || "dashboard";
  if (!view || !document.getElementById("view-" + view) || !isViewAllowed(view)) view = (access && access.landing && isViewAllowed(access.landing)) ? access.landing : firstAllowedView();
  goToView(view);
  afterLogin(false);
  return true;
}

// Ce qui suit une connexion réussie (ou une session rétablie).
function afterLogin(fresh) {
  if (!fresh) pullNotifications().catch(() => {});
  updateGreeting();
  refreshNavLive();
  renderNotifBadge();
  window.requestAnimationFrame(placeNavIndicator);
  updateScrollProgress();
  if (!fresh) return;
  const u = state.currentUser;
  const previous = u.derniereConnexion ? new Date(u.derniereConnexion) : null;   // valeur d'avant cette connexion
  toast({
    kind: "success",
    title: greetingWord() + (displayFirstName(u) ? ", " + displayFirstName(u) : ""),
    text: "Ravi de vous revoir." + (previous && !isNaN(previous.getTime()) ? " Dernière connexion : " + pad(previous.getDate()) + "/" + pad(previous.getMonth() + 1) + "/" + previous.getFullYear() + " à " + pad(previous.getHours()) + ":" + pad(previous.getMinutes()) + "." : ""),
    ms: 5000
  });
  pullNotifications().then(announceUnreadOnLogin).catch(() => {});
}

/* ---------------------------------------------------------------------- */
/* Notifications : messages de l'administrateur et alertes de sécurité      */
/* ---------------------------------------------------------------------- */

const BASE_TITLE = document.title;
const NOTIF_PRIO_LABEL = { info: "Information", importante: "Importante", urgente: "Urgente" };
const NOTIF_ENVELOPE_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
const NOTIF_SHIELD_SVG = TOAST_ICONS.security;
const NOTIF_ALERT_SVG = TOAST_ICONS.warn;

// Les messages viennent du serveur (GET /api/notifications) : uniquement ceux de l'utilisateur connecté.
state.notifications = [];
state.notificationsUnavailable = false;
const notifKnown = new Set();
let notifLoaded = false;

function userKey(u) { return u ? String(u.email || u.username || u.id || "").toLowerCase() : ""; }
function fullName(u) { return u ? ((u.prenom || "") + " " + (u.nom || "")).trim() : ""; }
function knownUsers() { return state.apiUsers || []; }
function canSendNotifications() { return !!state.currentUser && state.currentUser.role === "Super Admin"; }

function mapNotification(n) {
  return {
    id: n.id_notification,
    from: { nom: n.expediteur_nom || "Administrateur", role: n.expediteur_role || "" },
    titre: n.titre || "",
    message: n.message || "",
    priorite: n.priorite || "info",
    categorie: n.categorie || "message",
    date: n.date_envoi,
    expire: n.expire_le || null,
    accuse: !!n.accuse_requis,
    lu: !!n.lu,
    acquitte: !!n.accuse
  };
}
function notifExpired(n) { return !!n.expire && new Date(n.expire).getTime() < Date.now(); }
function myNotifications() {
  return state.notifications.filter(n => !notifExpired(n)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function isUnread(n) { return !n.lu; }
function unreadNotifications() { return myNotifications().filter(isUnread); }

// Récupère mes messages ; ceux qui arrivent après le premier chargement sont annoncés (toast + cloche).
async function pullNotifications() {
  let list;
  try { list = await apiListNotifications(); }
  catch (err) { if (err.unavailable) state.notificationsUnavailable = true; return; }
  const items = (list || []).map(mapNotification);
  const fresh = notifLoaded ? items.filter(n => !notifKnown.has(n.id) && !n.lu) : [];
  items.forEach(n => notifKnown.add(n.id));
  state.notifications = items;
  notifLoaded = true;
  renderNotifBadge();
  if (notifPanelEl.classList.contains("open")) renderNotifPanel();
  fresh.reverse().forEach(announceNotification);
  if (currentViewName === "journalisation" && state.journalTab === "messages") renderJournalisation();
}

function timeAgo(iso) {
  const d = new Date(iso), s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "à l'instant";
  if (s < 3600) return "il y a " + Math.max(1, Math.floor(s / 60)) + " min";
  if (s < 86400) return "il y a " + Math.floor(s / 3600) + " h";
  if (s < 172800) return "hier à " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  return "le " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
}
function fullDateTime(iso) {
  const d = new Date(iso);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " à " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function notifIcon(n) { return n.categorie === "securite" ? NOTIF_SHIELD_SVG : (n.priorite === "urgente" ? NOTIF_ALERT_SVG : NOTIF_ENVELOPE_SVG); }
function notifTag(n) { return n.categorie === "securite" ? "Sécurité" : NOTIF_PRIO_LABEL[n.priorite] || "Information"; }
function notifClass(n) { return n.categorie === "securite" ? "securite" : (n.priorite || "info"); }

const notifBellBtn = document.getElementById("notifBellBtn");
const notifPanelEl = document.getElementById("notifPanel");
let notifFilter = "all";

function renderNotifBadge() {
  const list = unreadNotifications(), n = list.length;
  const badge = document.getElementById("notifBadge");
  badge.hidden = n === 0;
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.classList.toggle("urgent", list.some(x => x.priorite === "urgente"));
  const mc = document.getElementById("userMenuNotifCount");
  mc.hidden = n === 0;
  mc.textContent = n > 99 ? "99+" : String(n);
  notifBellBtn.setAttribute("aria-label", n ? "Notifications — " + n + " non lue" + (n > 1 ? "s" : "") : "Notifications");
  document.title = (n ? "(" + n + ") " : "") + BASE_TITLE;
}

function renderNotifPanel() {
  const all = myNotifications();
  const unread = all.filter(isUnread);
  const list = notifFilter === "unread" ? unread : all;
  document.getElementById("notifSub").textContent = state.notificationsUnavailable ? "Messagerie non disponible côté serveur" : (unread.length
    ? unread.length + " non lue" + (unread.length > 1 ? "s" : "") + " sur " + all.length
    : (all.length ? "Tout est lu · " + all.length + " message" + (all.length > 1 ? "s" : "") : "Aucun message"));
  document.getElementById("notifMarkAllBtn").hidden = unread.length === 0;
  document.querySelectorAll("#notifTabs button").forEach(b => b.classList.toggle("active", b.dataset.f === notifFilter));
  document.getElementById("notifFoot").hidden = !canSendNotifications();
  const host = document.getElementById("notifList");
  if (!list.length) {
    host.innerHTML = '<div class="notif-empty"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>' +
      (notifFilter === "unread" ? "Aucune notification non lue." : "Aucune notification pour le moment.") + "</div>";
    return;
  }
  host.innerHTML = list.slice(0, 30).map((n, i) =>
    '<button type="button" class="notif-item ' + notifClass(n) + (isUnread(n) ? " unread" : "") + '" data-id="' + escapeHtml(String(n.id)) + '" style="animation-delay:' + Math.min(i, 8) * 30 + 'ms">' +
      '<span class="n-ico">' + notifIcon(n) + "</span>" +
      '<span class="n-main">' +
        '<span class="n-title"><span>' + escapeHtml(n.titre) + '</span><em class="n-tag">' + notifTag(n) + "</em></span>" +
        '<span class="n-text">' + escapeHtml(n.message) + "</span>" +
        '<span class="n-meta">' + escapeHtml(n.from.nom) + " · " + timeAgo(n.date) + (n.accuse && !n.acquitte ? " · accusé requis" : "") + "</span>" +
      "</span>" +
    "</button>"
  ).join("");
}

function setNotifPanelOpen(open) {
  notifPanelEl.classList.toggle("open", open);
  notifBellBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    setUserMenuOpen(false);
    renderNotifPanel();
    document.querySelectorAll("#toastStack .toast[data-click] .toast-x").forEach(x => x.click());
  }
}
function openNotifPanel() { setNotifPanelOpen(true); }
notifBellBtn.addEventListener("click", e => { e.stopPropagation(); setNotifPanelOpen(!notifPanelEl.classList.contains("open")); });
document.addEventListener("click", e => { if (!document.getElementById("notifMenu").contains(e.target)) setNotifPanelOpen(false); });
document.getElementById("notifTabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-f]");
  if (!b) return;
  notifFilter = b.dataset.f;
  renderNotifPanel();
});
document.getElementById("notifList").addEventListener("click", e => {
  const item = e.target.closest(".notif-item");
  if (item) openNotification(item.dataset.id);
});
document.getElementById("notifMarkAllBtn").addEventListener("click", () => {
  unreadNotifications().forEach(n => markRead(n.id, true));
  renderNotifBadge();
  renderNotifPanel();
});

function findNotification(id) { return state.notifications.find(x => String(x.id) === String(id)); }
function markRead(id, quiet) {
  const n = findNotification(id);
  if (!n || n.lu) return;
  n.lu = true;
  apiMarkNotificationRead(n.id).catch(() => { n.lu = false; renderNotifBadge(); });
  if (!quiet) audit("notification.lire", { ressourceType: "Notification", ressourceId: n.id, ressourceLibelle: n.titre });
  renderNotifBadge();
}
function acknowledgeNotification(id) {
  const n = findNotification(id);
  if (!n) return Promise.resolve();
  return apiAcknowledgeNotification(n.id).then(() => {
    n.acquitte = true; n.lu = true;
    audit("notification.accuser", { ressourceType: "Notification", ressourceId: n.id, ressourceLibelle: n.titre });
    renderNotifBadge();
  });
}

function openNotification(id) {
  const n = findNotification(id);
  if (!n) return;
  setNotifPanelOpen(false);
  markRead(n.id);
  const needsAck = n.accuse && !n.acquitte;
  const pill = n.categorie === "securite" ? "examen" : (n.priorite === "urgente" ? "inactif" : (n.priorite === "importante" ? "attente" : "consultation"));
  showInfoModal(n.titre,
    '<div class="notif-detail-meta"><span class="pill ' + pill + '">' + notifTag(n) + "</span>" +
      "<span>De <b>" + escapeHtml(n.from.nom) + "</b></span><span>" + fullDateTime(n.date) + "</span></div>" +
    '<p class="notif-detail-text">' + escapeHtml(n.message) + "</p>" +
    (n.accuse
      ? '<div class="notif-ack-row">' + (needsAck
          ? "<span>L'expéditeur demande un accusé de lecture.</span>" + '<button type="button" class="btn-primary btn-sm" id="notifAckBtn">J\'ai pris connaissance</button>'
          : "<span>✓ Vous avez accusé réception de ce message.</span>") + "</div>"
      : ""));
  const ack = document.getElementById("notifAckBtn");
  if (ack) ack.addEventListener("click", () => {
    acknowledgeNotification(n.id).then(() => {
      closeInfoModal();
      toast({ kind: "success", title: "Accusé envoyé", text: "L'expéditeur voit que vous avez pris connaissance du message.", ms: 3600 });
    }).catch(err => toast({ kind: "urgent", title: "Accusé non enregistré", text: err.message, ms: 5000 }));
  });
}

// Un message arrive pour l'utilisateur connecté : cloche qui sonne + toast (collant s'il est urgent).
function announceNotification(n) {
  notifBellBtn.classList.remove("ring"); void notifBellBtn.offsetWidth; notifBellBtn.classList.add("ring");
  toast({
    kind: n.categorie === "securite" ? "security" : (n.priorite === "urgente" ? "urgent" : (n.priorite === "importante" ? "warn" : "info")),
    title: n.titre,
    text: n.message.length > 110 ? n.message.slice(0, 107) + "…" : n.message,
    sticky: n.priorite === "urgente",
    ms: 7000,
    onClick: () => openNotification(n.id)
  });
}
function announceUnreadOnLogin() {
  const unread = unreadNotifications();
  if (!unread.length) return;
  const urgent = unread.filter(n => n.priorite === "urgente");
  urgent.slice(0, 2).forEach(announceNotification);
  const others = unread.length - Math.min(urgent.length, 2);
  if (others > 0) {
    notifBellBtn.classList.remove("ring"); void notifBellBtn.offsetWidth; notifBellBtn.classList.add("ring");
    toast({
      kind: "info", title: unread.length === 1 ? "Un nouveau message" : unread.length + " nouveaux messages",
      text: "De l'administrateur — cliquez pour les consulter.", ms: 6500, onClick: openNotifPanel
    });
  }
}

// ---- Composeur (Super Admin) ----
const composeModal = document.getElementById("composeModal");
let composePriorite = "info";

// Destinataires : le serveur reçoit un type (tous / role / etablissement / user) et une valeur (rôle API, id de structure, id d'utilisateur).
function composeTargetOptions(type) {
  const users = knownUsers();
  if (type === "role") return Object.keys(FRONT_ROLE_TO_API_ROLE).map(r => ({ v: FRONT_ROLE_TO_API_ROLE[r], l: r }));
  if (type === "etablissement") return (state.structures || []).map(s => ({ v: String(s.id_structure), l: s.raison_sociale }));
  if (type === "user") return users.map(u => ({ v: String(u.id), l: fullName(u) + " — " + u.role }));
  return [];
}
function composeTo() {
  const type = document.getElementById("composeTarget").value;
  return type === "all" ? { type: "all" } : { type: type, value: document.getElementById("composeValue").value };
}
function notifMatches(to, u) {
  if (!to || to.type === "all") return true;
  if (to.type === "role") return u.apiRole === to.value;
  if (to.type === "etablissement") return String(u.idStructure) === String(to.value);
  if (to.type === "user") return String(u.id) === String(to.value);
  return false;
}
// Aperçu des destinataires (comptes actifs, hors l'expéditeur).
function notifRecipients(probe) {
  const me = state.currentUser;
  return knownUsers().filter(u => u.statut !== "Inactif" && notifMatches(probe.to, u) && (!me || u.id !== me.id));
}
function refreshComposeValue() {
  const type = document.getElementById("composeTarget").value;
  const wrap = document.getElementById("composeValueWrap");
  wrap.hidden = type === "all";
  if (type !== "all") {
    document.getElementById("composeValueLabel").textContent = { role: "Profil", etablissement: "Établissement", user: "Utilisateur" }[type];
    document.getElementById("composeValue").innerHTML = composeTargetOptions(type).map(o => '<option value="' + escapeHtml(o.v) + '">' + escapeHtml(o.l) + "</option>").join("");
  }
  renderComposeRecap();
}
function renderComposeRecap() {
  const rec = notifRecipients({ to: composeTo() });
  const el = document.getElementById("composeRecap");
  el.classList.toggle("empty", rec.length === 0);
  el.textContent = rec.length
    ? "Sera reçu par " + rec.length + " utilisateur" + (rec.length > 1 ? "s" : "") + " : " + rec.slice(0, 4).map(fullName).join(", ") + (rec.length > 4 ? " et " + (rec.length - 4) + " autre" + (rec.length - 4 > 1 ? "s" : "") : "") + "."
    : "Aucun destinataire actif pour ce choix.";
}
async function openComposeModal() {
  if (!canSendNotifications()) return;
  setNotifPanelOpen(false);
  document.getElementById("composeForm").reset();
  composePriorite = "info";
  document.querySelectorAll("#composePriorite .chip").forEach(c => c.classList.toggle("active", c.dataset.p === "info"));
  document.getElementById("composeError").hidden = true;
  document.getElementById("composeCount").textContent = "0 / 600";
  composeModal.hidden = false;
  document.getElementById("composeTitle").focus();
  // la liste des comptes vient du serveur (aperçu et choix d'un utilisateur)
  if (!state.apiUsers) { try { state.apiUsers = (await apiListUtilisateurs()).map(mapBackendUser); } catch (e) { state.apiUsers = []; } }
  refreshComposeValue();
}
function closeComposeModal() { composeModal.hidden = true; }
document.getElementById("notifComposeBtn").addEventListener("click", openComposeModal);
document.getElementById("closeComposeModal").addEventListener("click", closeComposeModal);
document.getElementById("cancelComposeModal").addEventListener("click", closeComposeModal);
document.getElementById("composeTarget").addEventListener("change", refreshComposeValue);
document.getElementById("composeValue").addEventListener("change", renderComposeRecap);
document.getElementById("composeText").addEventListener("input", e => { document.getElementById("composeCount").textContent = e.target.value.length + " / 600"; });
document.getElementById("composePriorite").addEventListener("click", e => {
  const b = e.target.closest(".chip");
  if (!b) return;
  composePriorite = b.dataset.p;
  document.querySelectorAll("#composePriorite .chip").forEach(c => c.classList.toggle("active", c === b));
});
document.getElementById("composeForm").addEventListener("submit", e => {
  e.preventDefault();
  const titre = document.getElementById("composeTitle").value.trim();
  const message = document.getElementById("composeText").value.trim();
  const err = document.getElementById("composeError");
  const to = composeTo();
  const recipients = notifRecipients({ to: to });
  let msg = "";
  if (titre.length < 3) msg = "Donnez un titre au message (3 caractères au moins).";
  else if (message.length < 3) msg = "Le message est vide.";
  else if (!recipients.length) msg = "Aucun destinataire actif pour ce choix.";
  err.hidden = !msg;
  err.textContent = msg;
  if (msg) return;
  const send = document.getElementById("composeSendBtn");
  send.disabled = true;
  apiSendNotification({
    cible_type: to.type, cible_valeur: to.value || null, titre: titre, message: message,
    priorite: composePriorite, categorie: "message", accuse_requis: document.getElementById("composeAck").checked
  }).then(res => {
    audit("notification.envoyer", { ressourceType: "Notification", ressourceId: res && res.id_notification, ressourceLibelle: titre, apres: { destinataires: recipients.length, cible: to, priorite: composePriorite } });
    closeComposeModal();
    const n = res && res.destinataires != null ? res.destinataires : recipients.length;
    toast({ kind: "success", title: "Message envoyé", text: "Reçu par " + n + " utilisateur" + (n > 1 ? "s" : "") + ".", ms: 4200 });
    if (currentViewName === "journalisation") renderJournalisation();
  }).catch(e2 => {
    err.hidden = false;
    err.textContent = e2.unavailable ? "La messagerie n'est pas encore disponible côté serveur (POST /api/notifications à créer)." : e2.message;
  }).finally(() => { send.disabled = false; });
});

/* ---------------------------------------------------------------------- */
/* Touche Échap : ferme la fenêtre de message, le panneau de notifications  */
/* ou le tiroir de navigation                                              */
/* ---------------------------------------------------------------------- */

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!composeModal.hidden) closeComposeModal();
  else if (notifPanelEl.classList.contains("open")) setNotifPanelOpen(false);
  else if (sidebarEl.classList.contains("open")) setDrawerOpen(false);
});

/* ---------------------------------------------------------------------- */
/* Navigation entre les vues de l'application                             */
/* ---------------------------------------------------------------------- */

const VIEW_META = {
  dashboard: { title: "Tableau de bord", crumb: "Accueil" },
  "nouvelle-pec": { title: "Nouvelle prise en charge", crumb: "Accueil / Nouvelle prise en charge" },
  medecin: { title: "Espace Médecin", crumb: "Accueil / Espace Médecin" },
  soins: { title: "Feuille de soins", crumb: "Accueil / Feuille de soins" },
  "dossier-patient": { title: "Dossier patient", crumb: "Accueil / Nouvelle prise en charge / Dossier patient" },
  historique: { title: "Historique PEC", crumb: "Accueil / Historique" },
  users: { title: "Gestion des utilisateurs", crumb: "Accueil / Utilisateurs" },
  structures: { title: "Structures", crumb: "Accueil / Structures" },
  pharmacie: { title: "Espace Pharmacien", crumb: "Accueil / Espace Pharmacien" },
  rapports: { title: "Rapports", crumb: "Accueil / Rapports" },
  permissions: { title: "Gestion des permissions", crumb: "Accueil / Permissions" },
  journalisation: { title: "Journalisation", crumb: "Accueil / Journalisation" }
};

// Pile des vues visitées, pour que le bouton retour revienne à l'écran
// précédent (quel qu'il soit) plutôt que de toujours ramener au tableau de
// bord. goToView(name, { fromBack: true }) est utilisé par ce bouton pour
// dépiler sans re-pousser la vue qu'on quitte.
let viewHistory = [];
let currentViewName = null;

// Vue de la barre latérale dont dépend une sous-vue (feuille de soins, dossier
// patient) : elle reste allumée dans le menu et apparaît dans le fil d'Ariane,
// pour que le médecin sache toujours d'où il vient et où il se trouve.
let navContext = "dashboard";

function hasNavItem(name) {
  return !!document.querySelector('.nav-item[data-view="' + name + '"]');
}

// Titre et fil d'Ariane d'une vue. Les sous-vues (feuille de soins, dossier
// patient) sont calculées : elles dépendent de la vue d'origine et de la
// feuille affichée.
function getViewMeta(name) {
  const parent = VIEW_META[navContext] || VIEW_META.medecin;
  if (name === "soins") {
    const entry = state.historique.find(h => h.id === state.editingEntryId);
    return {
      title: entry && entry.type === "Examen" ? "Feuille d'examen" : "Feuille de soins",
      crumb: "Accueil / " + parent.title + (entry ? " / " + entry.numero : ""),
      parentView: navContext
    };
  }
  if (name === "dossier-patient") {
    return { title: "Dossier patient", crumb: "Accueil / " + parent.title + " / Dossier patient", parentView: navContext };
  }
  return VIEW_META[name];
}

function applyViewChrome(name) {
  const meta = getViewMeta(name);
  document.getElementById("topbarTitle").textContent = meta.title;
  renderCrumb(meta);
  // Pastille d'icône de la page (celle de son entrée de menu ; une sous-vue reprend l'icône de sa vue d'origine).
  const src = document.querySelector('.nav-item[data-view="' + (hasNavItem(name) ? name : navContext) + '"] .nav-ico');
  const holder = document.getElementById("topbarViewIco");
  if (src && holder) {
    holder.innerHTML = src.innerHTML;
    holder.classList.remove("pop"); void holder.offsetWidth; holder.classList.add("pop");
  }
}

function goToView(name, opts) {
  const fromBack = !!(opts && opts.fromBack);
  if (!isViewAllowed(name)) {
    audit("ui.refuse", { resultat: "REFUSE", vue: name, message: "Accès refusé à la page « " + name + " »" });
    name = state.roleAccess[state.currentUser.role].landing;
  }
  // La feuille de soins n'a de sens que pour une feuille en cours d'examen
  // (ex. retour arrière vers une feuille déjà validée ou supprimée).
  if (name === "soins" && !state.historique.some(h => h.id === state.editingEntryId)) name = "medecin";
  // Quitter la feuille de soins ne perd rien : les saisies restent en brouillon.
  if (currentViewName === "soins" && name !== "soins") saveSoinsDraft();
  if (!fromBack && currentViewName && currentViewName !== name) {
    viewHistory.push(currentViewName);
  }
  const viewChanged = currentViewName !== name;
  currentViewName = name;
  if (hasNavItem(name)) navContext = name;

  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  document.getElementById("view-" + name).hidden = false;

  const navTarget = hasNavItem(name) ? name : navContext;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === navTarget));

  document.getElementById("topbarBackBtn").hidden = name === "dashboard";
  document.getElementById("topbarHistoryBtn").hidden = name !== "soins";
  applyViewChrome(name);

  if (name === "historique") renderHistorique();
  if (name === "users") renderUsers();
  if (name === "structures") renderStructuresPage();
  if (name === "dashboard") renderDashboardStats();
  if (name === "medecin") renderMedecinQueue();
  if (name === "pharmacie") resetPharmaSearch();
  if (name === "rapports") renderRapports();
  if (name === "permissions") loadApiPermissions();
  if (name === "journalisation") renderJournalisation();
  refreshViewData(name);

  // Habillage : tiroir refermé sur mobile, page remontée, pastille du menu, pouls, session.
  if (isMobileNav()) setDrawerOpen(false);
  if (viewChanged) window.scrollTo(0, 0);
  window.requestAnimationFrame(() => { placeNavIndicator(); updateScrollProgress(); });
  refreshNavLive();
  persistSession();
  if (viewChanged && state.currentUser) audit("vue.ouvrir", { vue: name, ressourceType: "Page", ressourceLibelle: getViewMeta(name).title });
}

// Les feuilles (et les règlements pour les pages financières) sont relus à l'ouverture des pages qui les affichent.
function refreshViewData(name) {
  if (!state.currentUser || ["medecin", "historique", "dashboard", "rapports"].indexOf(name) < 0) return;
  const finance = (name === "dashboard" || name === "rapports") && ["Super Admin", "DG", "Caisse"].indexOf(state.currentUser.role) >= 0;
  Promise.all([
    pullFeuilles(false),
    finance ? apiListReglements().then(list => {
      state.reglements = (list || []).filter(r => r.kind === "pharmacie").map(mapReglement);
      state.reglementsHopitaux = (list || []).filter(r => r.kind === "hopital").map(mapReglement);
    }) : null
  ]).then(() => {
    if (currentViewName !== name) return;
    if (name === "medecin") renderMedecinQueue();
    else if (name === "historique") renderHistorique();
    else if (name === "dashboard") renderDashboardStats();
    else if (name === "rapports") renderRapports();
    refreshNavLive();
  }).catch(err => { if (!err.isNetworkError) reportDataError(err); });
}
let dataErrorShownAt = 0;
function reportDataError(err) {
  if (Date.now() - dataErrorShownAt < 8000) return;
  dataErrorShownAt = Date.now();
  toast({ kind: "warn", title: "Données non actualisées", text: err.unavailable ? "Cette fonction n'est pas encore disponible côté serveur." : err.message, ms: 6000 });
}

// "Accueil" (racine du fil d'Ariane) est cliquable et ramène au tableau de
// bord ; le segment courant reste du texte simple — motif standard de
// breadcrumb, cohérent avec le bouton retour à côté du titre.
function renderCrumb(meta) {
  const el = document.getElementById("topbarCrumb");
  const parts = meta.crumb.split(" / ");
  if (parts.length === 1) {
    el.innerHTML = '<span class="crumb-current">' + escapeHtml(parts[0]) + "</span>";
    return;
  }
  // Une sous-vue (feuille de soins, dossier) rend aussi sa vue d'origine
  // cliquable : « Accueil / Espace Médecin / F2026-00012 ».
  const hasParent = !!meta.parentView && parts.length > 2;
  el.innerHTML =
    '<button type="button" class="crumb-link" id="crumbHomeBtn">' + escapeHtml(parts[0]) + "</button>" +
    '<span class="crumb-sep">/</span>' +
    (hasParent
      ? '<button type="button" class="crumb-link" id="crumbParentBtn">' + escapeHtml(parts[1]) + "</button>" +
        '<span class="crumb-sep">/</span>' +
        '<span class="crumb-current">' + escapeHtml(parts.slice(2).join(" / ")) + "</span>"
      : '<span class="crumb-current">' + escapeHtml(parts.slice(1).join(" / ")) + "</span>");
  document.getElementById("crumbHomeBtn").addEventListener("click", () => goToView("dashboard"));
  if (hasParent) document.getElementById("crumbParentBtn").addEventListener("click", () => goToView(meta.parentView));
}
document.getElementById("topbarBackBtn").addEventListener("click", () => {
  const previous = viewHistory.pop();
  goToView(previous || "dashboard", { fromBack: true });
});

// La marque "CNAMGS / Circuit de l'assuré" en haut de la sidebar agit comme
// un lien vers l'accueil, comme le logo de la plupart des apps pro.
document.getElementById("sidebarBrandBtn").addEventListener("click", () => goToView("dashboard"));
document.getElementById("sidebarBrandBtn").addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToView("dashboard"); }
});

// Ouvre la page Rapports directement sur l'onglet demandé (utilisé par les
// boutons "Voir le rapport complet" du tableau de bord).
function goToRapportTab(tab) {
  goToView("rapports");
  document.querySelectorAll("#rapportsTabToggle .chip").forEach(c => c.classList.toggle("active", c.dataset.tab === tab));
  document.getElementById("rapport-hopitaux").hidden = tab !== "hopitaux";
  document.getElementById("rapport-pharmacies").hidden = tab !== "pharmacies";
}
document.querySelectorAll("#rapportsTabToggle .chip").forEach(chip => {
  chip.addEventListener("click", () => goToRapportTab(chip.dataset.tab));
});
document.querySelectorAll("[data-rapport-tab]").forEach(btn => {
  btn.addEventListener("click", () => goToRapportTab(btn.dataset.rapportTab));
});

document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
  btn.addEventListener("click", () => goToView(btn.dataset.view));
});

/* ---------------------------------------------------------------------- */
/* Recherche d'un assuré par matricule                                    */
/* ---------------------------------------------------------------------- */

function populateMedecinSelect() {
  const sel = document.getElementById("medecinSelect");
  sel.innerHTML = '<option value="">' + (state.medecins.length ? "— Choisir un médecin —" : "— Annuaire des médecins indisponible —") + "</option>";
  state.medecins.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = "Dr. " + (m.prenom ? m.prenom + " " : "") + m.nom + (m.etablissement ? " — " + m.etablissement : "");
    sel.appendChild(opt);
  });
}
populateMedecinSelect();

function resetSearch() {
  state.currentAssure = null;
  state.currentPatient = null;
  state.currentTM = null;
  state.currentMedecin = null;
  document.getElementById("assureFound").hidden = true;
  document.getElementById("assureFound").classList.remove("is-suspended");
  const pecColReset = document.querySelector("#assureFound .assure-pec-col");
  pecColReset.classList.remove("is-blocked");
  pecColReset.inert = false;
  document.getElementById("notFoundMsg").hidden = true;
  document.getElementById("matriculeInput").value = "";
  document.querySelectorAll("#tmChoices .chip").forEach(c => c.classList.remove("active"));
  document.getElementById("medecinSelect").value = "";
  document.getElementById("pec-quartier").value = "";
  document.getElementById("pec-telephone").value = "";
  document.getElementById("pec-service").value = "";
  document.getElementById("nouvellePecConsultationBtn").hidden = true;
  document.getElementById("assurePhotoCol").classList.remove("patient-frequent", "patient-new");
  updateActionButtons();
}

// Recherche exclusivement dans la vraie base (table Patient, via l'API) —
// plus aucune donnée générique locale : en production, un matricule qui
// n'existe pas réellement en base ne doit jamais faire apparaître un
// assuré fictif.
async function runSearch(matricule) {
  matricule = nagDigits(matricule);
  const notFound = document.getElementById("notFoundMsg");
  const notFoundText = document.getElementById("notFoundText");
  const card = document.getElementById("assureFound");
  if (!matricule) {
    notFound.hidden = true;
    card.hidden = true;
    state.currentAssure = null;
    updateActionButtons();
    return;
  }

  const btn = document.getElementById("searchBtn");
  notFound.hidden = true;
  card.hidden = true;

  // Le NAG est un INT de 10 chiffres (CK_Patient_nag_10) : inutile d'interroger
  // la base avec autre chose.
  if (!isValidNag(matricule)) {
    state.currentAssure = null;
    notFoundText.textContent = matricule.length !== 10
      ? "Le matricule (NAG) comporte exactement 10 chiffres."
      : "Matricule invalide : le NAG est compris entre 1 000 000 000 et 2 147 483 647.";
    notFound.hidden = false;
    updateActionButtons();
    audit("patient.rechercher", { resultat: "ECHEC", message: "NAG invalide (" + matricule.length + " chiffres)", apres: { trouve: false } });
    return;
  }

  btn.disabled = true;
  try {
    const found = await findPatientByMatricule(matricule);
    btn.disabled = false;
    if (!found) {
      state.currentAssure = null;
      notFoundText.textContent = "Aucun assuré trouvé pour ce matricule.";
      notFound.hidden = false;
      updateActionButtons();
      audit("patient.rechercher", { nag: matricule, message: "Aucun assuré pour ce NAG", apres: { trouve: false } });
      return;
    }
    state.currentAssure = found;
    showAssureCard(found);
    audit("patient.rechercher", { nag: matricule, ressourceType: "Assuré", ressourceLibelle: ((found.prenom || "") + " " + (found.nom || "")).trim(), message: isSuspended(found) ? "Assuré suspendu : prise en charge bloquée" : "", apres: { trouve: true, statut: found.statut } });
  } catch (err) {
    btn.disabled = false;
    state.currentAssure = null;
    notFoundText.textContent = err.isNetworkError
      ? "Backend injoignable — impossible de rechercher un assuré pour le moment."
      : "Erreur lors de la recherche : " + err.message;
    notFound.hidden = false;
    updateActionButtons();
  }
}

// Avatar d'un assuré : utilise la vraie photo (Patient.photo_url) quand
// elle est chargeable, sinon un cadre d'initiales à couleur stable (dérivée
// du nom) comme repli visuel.
const AVATAR_COLORS = ["#4d9e63", "#14479c", "#b6791f", "#8a3fa0", "#c0392b", "#1f8a8a", "#2f7d45"];
function avatarColorFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function setAvatar(el, prenom, nom, photoUrl) {
  if (!el) return;
  const initials = ((prenom || "").charAt(0) + (nom || "").charAt(0)).toUpperCase();
  const color = avatarColorFor((prenom || "") + (nom || ""));
  el.innerHTML = "";
  el.style.background = color;
  if (!photoUrl) {
    el.textContent = initials;
    return;
  }
  // Pas de texte pendant que la photo est tentée : évite l'affichage des
  // deux à la fois pendant le chargement. Si la photo échoue (fichier
  // absent, cas fréquent pour les données de test), on retombe sur les
  // initiales seulement à ce moment-là.
  const img = document.createElement("img");
  img.alt = (prenom || "") + " " + (nom || "");
  img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;";
  img.onerror = () => { img.remove(); el.textContent = initials; };
  img.src = photoUrl;
  el.appendChild(img);
}

// Fonds (Patient.fonds, désormais INT en base) : un code de catégorie,
// exactement 4 valeurs valides. Toute autre valeur est signalée comme une
// erreur de donnée plutôt que masquée ou affichée comme si elle était valide.
const FONDS_LABELS = { 1: "Public", 2: "Privé", 3: "GEF", 4: "Fonds 4" };
function fondsLabel(fonds) {
  if (fonds == null) return "—";
  const key = Math.round(num(fonds));
  return FONDS_LABELS[key] || ("Erreur (valeur " + fonds + ")");
}

/* ---- Assuré suspendu : alerte rouge, et aucune prestation ne peut être enregistrée ---- */

function isSuspended(a) { return !!a && a.statut === "suspendu"; }

// Interroge la base (API, à défaut base locale) : renvoie l'assuré s'il est suspendu, sinon null.
function checkNagSuspended(nag) {
  const digits = nagDigits(nag);
  if (!digits) return Promise.resolve(null);
  return findPatientByMatricule(digits).then(p => (isSuspended(p) ? p : null)).catch(() => null);
}

// Fenêtre rouge : l'assuré est suspendu, la conséquence dépend de l'étape (accueil, médecin, pharmacie).
function showSuspendedModal(nom, nag, consequence) {
  showInfoModal("Assuré suspendu",
    '<div class="suspended-modal"><span class="sa-ico big"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></span><div>' +
    "<p><b>" + escapeHtml(nom || "Cet assuré") + "</b>" + (nag ? " (" + escapeHtml(formatNag(nag)) + ")" : "") + " est <b>suspendu</b>.</p>" +
    "<p>Il ne peut recevoir <b>aucune prestation</b> : " + escapeHtml(consequence) + "</p>" +
    '<p class="hint">Sa situation doit d\'abord être régularisée auprès de la CNAMGS.</p></div></div>');
  document.querySelector("#infoModal .modal").className = "modal modal-danger";
}

// Laisse passer (proceed) sauf si l'assuré est suspendu : dans ce cas, fenêtre rouge et trace dans le journal.
function guardSuspended(nag, nom, consequence, proceed, auditAction) {
  checkNagSuspended(nag).then(p => {
    if (!p) { proceed(); return; }
    audit(auditAction || "feuille.ouvrir", { resultat: "REFUSE", nag: nag, ressourceType: "Assuré", ressourceLibelle: nom || fullName(p), message: "Refusé : assuré suspendu" });
    showSuspendedModal(nom || fullName(p), nag, consequence);
  });
}

function showAssureCard(assure) {
  document.getElementById("assureFound").hidden = false;
  document.getElementById("af-nom").textContent = assure.prenom + " " + assure.nom;
  // Statut (actif / suspendu) et nature (assuré principal, ayant droit, conjoint) de l'assuré.
  const statutBadge = document.getElementById("af-statut");
  statutBadge.textContent = "Statut : " + statutAssureLabel(assure.statut);
  statutBadge.classList.toggle("suspendu", assure.statut === "suspendu");
  // Assuré suspendu : cachet « SUSPENDU », formulaire de prise en charge verrouillé, consigne rouge sous le formulaire.
  const suspended = isSuspended(assure);
  document.getElementById("assureFound").classList.toggle("is-suspended", suspended);
  document.getElementById("assurePhotoCol").classList.toggle("is-suspended", suspended);
  const pecCol = document.querySelector("#assureFound .assure-pec-col");
  pecCol.classList.toggle("is-blocked", suspended);
  pecCol.inert = suspended;
  document.getElementById("af-nature").textContent = natureAssureLabel(assure.natureCode);
  document.getElementById("af-matricule").textContent = formatNag(assure.matricule) || "—";
  document.getElementById("af-naissance").textContent = assure.dateNaissance ? dossierDateFR(assure.dateNaissance) : "—";
  document.getElementById("af-fonds").textContent = fondsLabel(assure.fonds);
  setAvatar(document.getElementById("af-avatar"), assure.prenom, assure.nom, assure.photoUrl);

  // Le patient de la prise en charge est l'assuré recherché.
  state.currentPatient = {
    matricule: assure.matricule,
    nom: assure.nom,
    prenom: assure.prenom,
    dateNaissance: assure.dateNaissance,
    sexe: assure.sexe,
    estAssure: assure.estAssure
  };
  updateActionButtons();

  state.currentTM = null;
  state.currentMedecin = null;
  document.querySelectorAll("#tmChoices .chip").forEach(c => c.classList.remove("active"));
  document.getElementById("medecinSelect").value = "";
  // Quartier et service repartent vierges à chaque nouvelle recherche (propres
  // à cette visite) ; le téléphone est repris du dossier mais reste modifiable.
  document.getElementById("pec-quartier").value = "";
  document.getElementById("pec-telephone").value = assure.telephone || "";
  document.getElementById("pec-service").value = "";
  updateActionButtons();

  // « Nouvelle consultation » (crée directement une nouvelle feuille « En
  // attente » pour le médecin, comme « Enregistrer ») n'apparaît que pour un
  // patient déjà venu en consultation plus d'une fois — repéré via son
  // dossier réel. C'est ici, à l'accueil, que démarre toute nouvelle
  // consultation ; le dossier patient, lui, n'en démarre jamais. La
  // carte assuré change aussi de couleur selon ce même historique (habitué
  // en vert, jamais consulté en gris).
  const btn = document.getElementById("nouvellePecConsultationBtn");
  const photoCol = document.getElementById("assurePhotoCol");
  btn.hidden = true;
  photoCol.classList.remove("patient-frequent", "patient-new");
  if (assure.idPatient != null) {
    apiListConsultations(assure.idPatient).then(list => {
      // L'assuré affiché a pu changer entre-temps (nouvelle recherche) :
      // on ignore un résultat qui ne concerne plus l'assuré courant.
      if (state.currentAssure !== assure) return;
      const count = (list || []).length;
      btn.hidden = isSuspended(assure) || !(count > 1);
      photoCol.classList.toggle("patient-frequent", count > 1);
      photoCol.classList.toggle("patient-new", count === 0);
    }).catch(() => { btn.hidden = true; });
  }
}

const READY_HINT_DEFAULT = "Sélectionnez un patient, un ticket modérateur et un médecin pour continuer.";
function updateActionButtons() {
  // Un assuré suspendu ne peut jamais avoir de prise en charge, quoi qu'on sélectionne.
  const suspended = isSuspended(state.currentAssure);
  const ready = !!(state.currentAssure && state.currentPatient && state.currentTM && state.currentMedecin) && !suspended;
  document.getElementById("enregistrerPecBtn").disabled = !ready;
  document.getElementById("nouvellePecConsultationBtn").disabled = !ready;
  const hint = document.getElementById("readyHint");
  if (hint) {
    hint.hidden = ready;
    hint.textContent = suspended ? "Enregistrement impossible : l'assuré est suspendu, il ne peut recevoir aucune prestation." : READY_HINT_DEFAULT;
    hint.classList.toggle("hint-danger", suspended);
  }
}

// Ceinture et bretelles : même si le bouton est activé par un autre moyen, on refuse et on le trace.
function refuseSuspendedPec() {
  const a = state.currentAssure;
  audit("pec.creer", { resultat: "REFUSE", nag: a.matricule, ressourceType: "Assuré", ressourceLibelle: fullName(a), message: "Prise en charge refusée : assuré suspendu" });
  showSuspendedModal(fullName(a), a.matricule, "aucune prise en charge ne peut être enregistrée.");
}

attachNagMask(document.getElementById("matriculeInput"));
attachNagMask(document.getElementById("pharmaNagInput"));
document.getElementById("searchBtn").addEventListener("click", () => runSearch(document.getElementById("matriculeInput").value));
document.getElementById("matriculeInput").addEventListener("keydown", e => { if (e.key === "Enter") runSearch(e.target.value); });
document.getElementById("changeAssureBtn").addEventListener("click", resetSearch);

document.querySelectorAll("#tmChoices .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    state.currentTM = chip.dataset.tm;
    document.querySelectorAll("#tmChoices .chip").forEach(c => c.classList.toggle("active", c === chip));
    updateActionButtons();
  });
});

document.getElementById("medecinSelect").addEventListener("change", e => {
  const id = parseInt(e.target.value, 10);
  state.currentMedecin = state.medecins.find(m => m.id === id) || null;
  updateActionButtons();
});

/* ---------------------------------------------------------------------- */
/* Dossier patient : informations générales + chronologie des visites.     */
/* Une visite regroupe la consultation, son ordonnance et les bons d'examen */
/* liés (feuilles locales, state.historique). Les enregistrements du       */
/* dossier venus de l'API (Consultation / Examen — CRÉER / LIRE / MODIFIER  */
/* uniquement, jamais de suppression, voir ConsultationController /         */
/* ExamenController) complètent ce que ces feuilles ne couvrent pas.        */
/*                                                                        */
/* Une nouvelle consultation ne se démarre PAS ici : le patient repasse par */
/* l'accueil (« Nouvelle prise en charge »), et c'est le médecin qui        */
/* recommande un examen depuis la consultation.                            */
/* ---------------------------------------------------------------------- */

document.getElementById("openDossierPatientBtn").addEventListener("click", () => {
  if (!state.currentAssure || state.currentAssure.idPatient == null) return;
  openDossierPatient(state.currentAssure);
});

// opts.fromSheet : ouvert depuis « Historique des visites » (header de la feuille
// de soins) — la visite en cours d'examen (opts.focusId) est mise en évidence et
// un bouton ramène à la feuille.
function openDossierPatient(patient, opts) {
  state.dossierPatient = patient;
  state.dossierConsultations = [];
  state.dossierExamens = [];
  state.dossierFromSheet = !!(opts && opts.fromSheet);
  state.dossierFocusId = opts && opts.focusId != null ? opts.focusId : null;
  state.dossierFocusPending = state.dossierFocusId != null;
  resetPage("timeline");
  audit("dossier.ouvrir", { nag: patient.matricule, ressourceType: "Assuré", ressourceId: patient.idPatient || patient.id || "", ressourceLibelle: ((patient.prenom || "") + " " + (patient.nom || "")).trim() });
  renderDossierPatientInfo();
  goToView("dossier-patient");
  renderDossierTimeline();
  reloadDossier();
}

function renderDossierPatientInfo() {
  const p = state.dossierPatient;
  if (!p) return;
  document.getElementById("dpHeading").textContent = "Dossier patient — " + p.prenom + " " + p.nom;
  document.getElementById("dp-nom").textContent = p.prenom + " " + p.nom;
  document.getElementById("dp-matricule").textContent = formatNag(p.matricule) || "—";
  document.getElementById("dp-sexe").textContent = p.sexe === "F" ? "Féminin" : (p.sexe === "M" ? "Masculin" : "—");
  document.getElementById("dp-naissance").textContent = p.dateNaissance ? dossierDateFR(p.dateNaissance) : "—";
  document.getElementById("dp-adresse").textContent = p.adresse || "—";
  document.getElementById("dp-telephone").textContent = p.telephone || "—";
  document.getElementById("dp-nature").textContent = natureAssureLabel(p.natureCode);
  const dpStatut = document.getElementById("dp-statut");
  dpStatut.textContent = statutAssureLabel(p.statut);
  dpStatut.className = p.statut ? "statut-" + p.statut : "";
  document.getElementById("dpSuspendedAlert").hidden = !isSuspended(p);
  setAvatar(document.getElementById("dp-avatar"), p.prenom, p.nom, p.photoUrl);
  document.getElementById("dpBackToSheetBtn").hidden = !state.dossierFromSheet;
}

// Statuts de la base : Prise_en_charge (en_attente | validee | rejetee) pour une
// consultation, Examen (en_attente | en_cours | termine | annule) pour un examen.
const STATUT_LABELS = {
  en_attente: "En attente", validee: "Validée", rejetee: "Rejetée",
  en_cours: "En cours", termine: "Terminé", annule: "Annulé"
};
function statutLabel(statut) {
  return STATUT_LABELS[statut] || "En attente";
}
function statutPillClass(statut) {
  if (statut === "validee" || statut === "termine") return "validee";
  if (statut === "rejetee" || statut === "annule") return "rejetee";
  return "attente";
}
function dossierDateFR(isoDate) {
  if (!isoDate) return "—";
  const parts = isoDate.split("-");
  return parts.length === 3 ? (parts[2] + "/" + parts[1] + "/" + parts[0]) : isoDate;
}
function money(n) { return (n == null ? 0 : n).toLocaleString("fr-FR") + " FCFA"; }

// Enregistrements du dossier côté API (avec repli local, voir api.js).
function reloadDossier() {
  const p = state.dossierPatient;
  if (!p) return;
  if (p.matricule) {
    apiListFeuilles({ nag: p.matricule }).then(list => {
      if (state.dossierPatient !== p) return;
      mergeFeuilles(list, false, false);
      renderDossierTimeline();
    }).catch(() => { /* le dossier s'affiche avec ce qui est déjà chargé */ });
  }
  if (p.idPatient == null) return;
  Promise.all([apiListConsultations(p.idPatient), apiListExamensPatient(p.idPatient)]).then(res => {
    if (state.dossierPatient !== p) return; // un autre dossier a été ouvert entre-temps
    state.dossierConsultations = res[0] || [];
    state.dossierExamens = res[1] || [];
    renderDossierTimeline();
  }).catch(err => showInfoModal("Erreur", "<p>" + escapeHtml(err.message) + "</p>"));
}

// Feuilles locales du patient ouvert (par matricule), toutes étapes confondues.
function localSheetsOfPatient(p) {
  const mat = String(p.matricule || "");
  return mat ? state.historique.filter(h => String(h.matricule) === mat) : [];
}

// Regroupe consultations, bons liés et enregistrements API en « visites »,
// de la plus récente à la plus ancienne.
function buildDossierVisits() {
  const p = state.dossierPatient;
  if (!p) return [];
  const sheets = localSheetsOfPatient(p);
  const consults = sheets.filter(h => h.type === "Consultation");
  const exams = sheets.filter(h => h.type === "Examen");
  const usedExamIds = new Set();

  const visits = consults.map(c => {
    const bons = (c.linkedExamenIds || []).map(id => state.historique.find(h => h.id === id)).filter(Boolean);
    exams.forEach(e => { if (e.linkedConsultationId === c.id && !bons.includes(e)) bons.push(e); });
    bons.forEach(b => usedExamIds.add(b.id));
    return { consult: c, bons: bons, iso: frToISO(c.date) };
  });
  // Bon d'examen dont la consultation n'appartient pas à ce dossier (ou feuille d'examen isolée).
  exams.filter(e => !usedExamIds.has(e.id)).forEach(e => visits.push({ consult: null, bons: [e], iso: frToISO(e.date) }));

  // Enregistrements de l'API non couverts par une feuille locale : consultations
  // repérées par leur numéro de feuille, examens appariés date + type (chaque
  // examen local validé « consomme » au plus un enregistrement API).
  const knownNumeros = new Set(consults.map(c => c.numero));
  state.dossierConsultations.forEach(c => {
    if (c.numero_de_feuille && knownNumeros.has(c.numero_de_feuille)) return;
    visits.push({ consult: null, bons: [], apiConsult: c, iso: c.date || "" });
  });
  const pool = state.dossierExamens.slice();
  exams.filter(e => e.statut === "Validée").forEach(e => {
    const iso = frToISO(e.date);
    const type = e.examNature || "Examen";
    const i = pool.findIndex(x => x.date_examen === iso && (x.type_examen || "Examen") === type);
    if (i !== -1) pool.splice(i, 1);
  });
  pool.forEach(x => visits.push({ consult: null, bons: [], apiExam: x, iso: x.date_examen || "" }));

  const rank = v => state.historique.indexOf(v.consult || v.bons[0]);
  visits.sort((a, b) => (b.iso || "").localeCompare(a.iso || "") || rank(a) - rank(b));
  return visits;
}

function entryStatutPill(e) {
  const done = e.statut === "Validée";
  return '<span class="pill ' + (done ? "validee" : "attente") + '">' + (done ? "Validée" : "En attente") + "</span>";
}
function ordoSummary(e) {
  const rows = e.ordonnance || [];
  if (!rows.length) return "Sans ordonnance";
  return "Ordonnance : " + rows.map(r => escapeHtml(r.designation) + " × " + escapeHtml(r.quantite)).join(", ");
}
function examSummary(e) {
  const n = (e.examens || []).filter(r => r.designation).length;
  return [escapeHtml(e.examNature || ""), n ? n + " examen" + (n > 1 ? "s" : "") : ""].filter(Boolean).join(" — ") || "Contenu à renseigner";
}
function entryAmountNote(e) {
  const n = parseFloat(e.totalMontant);
  return n > 0 ? " · " + money(n) : "";
}

// child : la feuille d'examen est présentée en retrait sous la consultation de la
// même visite ; parent : cette consultation (la feuille d'examen y est liée).
function visitLineHtml(e, child, parent) {
  const isExam = e.type === "Examen";
  const link = parent
    ? 'Liée à la consultation <a href="#" class="visit-link" data-preview="' + parent.id + '">' + escapeHtml(parent.numero) + "</a>"
    : "Sans consultation liée";
  const sub = isExam
    ? examSummary(e) + " · " + link + " · " + escapeHtml(e.medecin || "—")
    : escapeHtml(e.medecin || "—") + (e.medecinEtab ? " — " + escapeHtml(e.medecinEtab) : "") + " · " + ordoSummary(e);
  return '<div class="visit-line' + (child ? " bon" : "") + '">' +
    '<div class="visit-line-main">' +
      '<div class="visit-line-title"><span class="pill ' + (isExam ? "examen" : "consultation") + '">' + (isExam ? "Examen" : "Consultation") + "</span>" +
        escapeHtml(e.numero) + " " + entryStatutPill(e) + "</div>" +
      '<div class="visit-line-sub">' + sub + escapeHtml(entryAmountNote(e)) + "</div>" +
    "</div>" +
    '<button type="button" class="btn-secondary btn-sm" data-preview="' + e.id + '">Voir</button>' +
  "</div>";
}

function visitCardHtml(v) {
  const lines = [];
  const hasConsult = !!(v.consult || v.apiConsult);
  if (v.consult) lines.push(visitLineHtml(v.consult, false));
  v.bons.forEach(b => lines.push(visitLineHtml(b, hasConsult, v.consult)));
  if (v.apiConsult) {
    const c = v.apiConsult;
    lines.push('<div class="visit-line"><div class="visit-line-main">' +
      '<div class="visit-line-title"><span class="pill consultation">Consultation</span>' + escapeHtml(c.numero_de_feuille || "—") + ' <span class="pill ' + statutPillClass(c.statut) + '">' + statutLabel(c.statut) + "</span></div>" +
      '<div class="visit-line-sub">' + escapeHtml(c.medecin_nom || "—") + (c.montant ? " · " + escapeHtml(money(c.montant)) : "") + "</div></div>" +
      '<button type="button" class="btn-secondary btn-sm" data-preview-api="' + c.id_prestation + '">Voir</button></div>');
  }
  if (v.apiExam) {
    const x = v.apiExam;
    lines.push('<div class="visit-line"><div class="visit-line-main">' +
      '<div class="visit-line-title"><span class="pill examen">Examen</span>' + escapeHtml(x.type_examen || "—") + ' <span class="pill ' + statutPillClass(x.statut) + '">' + statutLabel(x.statut) + "</span></div>" +
      '<div class="visit-line-sub">' + escapeHtml(x.medecin_nom || "—") + (x.montant ? " · " + escapeHtml(money(x.montant)) : "") + "</div></div></div>");
  }
  const onlyExam = !hasConsult;
  const count = v.bons.length;
  const key = v.consult ? v.consult.id : (v.bons[0] ? v.bons[0].id : "");
  const current = state.dossierFocusId != null && key === state.dossierFocusId;
  return '<div class="visit-card' + (onlyExam ? " examen" : "") + (current ? " current" : "") + '" data-visit="' + key + '">' +
    '<div class="visit-card-head"><strong>' + (onlyExam ? "Examen du " : "Visite du ") + dossierDateFR(v.iso) + "</strong>" +
    (current ? '<span class="pill attente">En cours d\'examen</span>' : "") +
    "<span class=\"hint\" style=\"margin:0\">" + (onlyExam ? "Examen seul" : (count ? count + " feuille" + (count > 1 ? "s" : "") + " d'examen liée" + (count > 1 ? "s" : "") : "Sans feuille d'examen")) + "</span></div>" +
    lines.join("") + "</div>";
}

function renderDossierTimeline() {
  const wrap = document.getElementById("dpTimeline");
  const empty = document.getElementById("dpTimelineEmpty");
  if (!wrap) return;
  const visits = buildDossierVisits();
  empty.hidden = visits.length > 0;
  // Arrivé depuis la feuille de soins : la page qui contient la visite en cours s'affiche d'office.
  if (state.dossierFocusPending) {
    const at = visits.findIndex(v => { const h = v.consult || v.bons[0]; return h && h.id === state.dossierFocusId; });
    if (at >= 0) PAGER_STATE.timeline = Math.floor(at / 5) + 1;
  }
  const info = pageSlice("timeline", visits, 5);
  renderPager("dpTimelinePager", "timeline", info, renderDossierTimeline, "visites");
  wrap.innerHTML = info.items.map(visitCardHtml).join("");
  wrap.querySelectorAll("[data-preview]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      previewEntry(parseInt(btn.dataset.preview, 10));
    });
  });
  // Arrivé depuis la feuille de soins : la visite en cours est amenée à l'écran si elle n'y est pas déjà (une seule fois).
  if (state.dossierFocusPending) {
    const cur = wrap.querySelector(".visit-card.current");
    if (cur) { cur.scrollIntoView({ behavior: "smooth", block: "nearest" }); state.dossierFocusPending = false; }
  }
  wrap.querySelectorAll("[data-preview-api]").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = state.dossierConsultations.find(x => x.id_prestation === parseInt(btn.dataset.previewApi, 10));
      if (c) previewConsultation(c);
    });
  });
}

// Aperçu façon « feuille de soins » d'une Consultation venant de l'API, quand
// la feuille locale d'origine est introuvable (autre session/poste, par
// exemple) : moins de champs disponibles (ce modèle ne porte ni prestations
// détaillées, ni fonds/TM/code praticien), même présentation visuelle que
// previewEntry(), qui reste l'aperçu de référence (retrouvé par numéro de
// feuille, copié dans numero_de_feuille à la synchronisation).
function previewConsultation(c) {
  const source = c.numero_de_feuille ? state.historique.find(h => h.numero === c.numero_de_feuille) : null;
  if (source) { previewEntry(source.id); return; }

  const p = state.dossierPatient;
  const statutClass = statutPillClass(c.statut);
  document.getElementById("previewBody").innerHTML =
    '<div class="preview-head"><img src="CNAMGS.png" alt="CNAMGS" /><div>' +
      '<span class="pill consultation">Consultation</span> ' +
      '<span class="pill ' + statutClass + '">' + statutLabel(c.statut) + "</span>" +
      '<div class="preview-num">' + escapeHtml(c.numero_de_feuille || "—") + "</div>" +
    "</div></div>" +
    '<div class="preview-grid">' +
      "<div><b>Patient</b><span>" + escapeHtml(p ? (p.prenom + " " + p.nom) : "—") + "</span></div>" +
      "<div><b>Matricule</b><span>" + escapeHtml(p ? formatNag(p.matricule) : "—") + "</span></div>" +
      "<div><b>Date</b><span>" + dossierDateFR(c.date) + "</span></div>" +
      "<div><b>Médecin</b><span>" + escapeHtml(c.medecin_nom || "—") + "</span></div>" +
      "<div><b>Type de feuille</b><span>" + escapeHtml(c.type_feuille || "—") + "</span></div>" +
      "<div><b>N° de feuille</b><span>" + escapeHtml(c.numero_de_feuille || "—") + "</span></div>" +
    "</div>" +
    (c.montant || c.montant_pec
      ? '<div class="preview-totals">' +
          "<div>Montant <b>" + money(c.montant) + "</b></div>" +
          "<div>Montant CNAMGS <b>" + money(c.montant_pec) + "</b></div>" +
        "</div>"
      : "");
  document.getElementById("previewModal").hidden = false;
}

// Si l'utilisateur connecté est lui-même un médecin, on le retrouve dans l'annuaire des médecins (API) par son
// identifiant. Sans correspondance (autre rôle, annuaire indisponible) : null, donc pas de filtre « Mes patients ».
function isMyPatient(h, me) { return h.medecinId != null ? h.medecinId === me.id : (!!h.medecinCode && h.medecinCode === me.code); }
function matchCurrentUserToMedecin() {
  const u = state.currentUser;
  if (!u || u.role !== "Médecin") return null;
  return state.medecins.find(m => m.id === u.id) || null;
}

/* ---------------------------------------------------------------------- */
/* Code QR (généré côté client, à partir du numéro de feuille + matricule) */
/* ---------------------------------------------------------------------- */

function drawPseudoQR(canvas, seedStr) {
  const ctx = canvas.getContext("2d");
  const size = 21;
  const cell = Math.floor(canvas.width / size);
  const offset = Math.floor((canvas.width - cell * size) / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    seed ^= seedStr.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  seed = seed >>> 0;
  function rand() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  function isFinder(x, y) {
    const zones = [[0, 0], [size - 7, 0], [0, size - 7]];
    return zones.some(z => x >= z[0] && x < z[0] + 7 && y >= z[1] && y < z[1] + 7);
  }

  ctx.fillStyle = "#123a2a";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFinder(x, y)) continue;
      if (rand() < 0.42) ctx.fillRect(offset + x * cell, offset + y * cell, cell, cell);
    }
  }

  function drawFinder(fx, fy) {
    ctx.fillStyle = "#123a2a";
    ctx.fillRect(offset + fx * cell, offset + fy * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(offset + (fx + 1) * cell, offset + (fy + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = "#123a2a";
    ctx.fillRect(offset + (fx + 2) * cell, offset + (fy + 2) * cell, 3 * cell, 3 * cell);
  }
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);
}

/* ---------------------------------------------------------------------- */
/* Feuille de soins (Consultation / Examen)                               */
/* ---------------------------------------------------------------------- */

function pad(n) { return String(n).padStart(2, "0"); }
function todayFR() {
  const d = new Date();
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
}
function nextFeuilleNum() {
  const prefix = "F" + new Date().getFullYear() + "-";
  const fmtNum = n => prefix + String(n).padStart(5, "0");
  let n = state.historique.length + 1;
  // Le numéro sert de clé (dossier patient, pharmacie) : il doit rester unique
  // même après la suppression d'un bon d'examen.
  while (state.historique.some(h => h.numero === fmtNum(n))) n++;
  return fmtNum(n);
}

const TYPE_LABELS = { generaliste: "Généraliste", specialiste: "Spécialiste", autre: "Autre" };
const TM_IDS = { "Plein": "tm-plein", "Plein (ALD)": "tm-ald", "Exonéré": "tm-exonere" };

/* ---------------------------------------------------------------------- */
/* Feuille de soins côté médecin. Une seule vue pour la feuille consultation */
/* et pour la feuille d'examen ajoutée depuis elle : seuls le thème (vert /  */
/* bleu) et les sections affichées changent. Tout ce que l'accueil a        */
/* renseigné arrive pré-rempli et verrouillé ; le médecin ne complète que   */
/* sa partie (prestation, ordonnance, feuille d'examen, signature).         */
/* ---------------------------------------------------------------------- */

const PRESTA_FIELD_IDS = ["presta-date", "presta-code", "presta-domicile-oui", "presta-domicile-non", "totalMontant", "totalTm", "totalPart"];
const EXAM_FIELD_IDS = [
  "exam-presta-date", "exam-etablissement", "exam-code-praticien", "exam-code-etablissement", "exam-motif",
  "exam-nature-radiologie", "exam-nature-biologie", "exam-nature-autre",
  "exam-situation-hospitalise", "exam-situation-externe",
  "exam-pub-signature", "exam-specialiste-signature"
];

function setDisabledIds(ids, disabled) {
  ids.forEach(id => { document.getElementById(id).disabled = disabled; });
}

// La racine d'une visite est la consultation ; une feuille d'examen s'y
// rattache par linkedConsultationId.
function visitRootOf(entry) {
  if (entry.type === "Consultation") return entry;
  return entry.linkedConsultationId ? (state.historique.find(h => h.id === entry.linkedConsultationId) || null) : null;
}

// Toutes les feuilles de la visite de `entry` : la consultation puis ses
// feuilles d'examen. Une feuille d'examen sans consultation forme une visite à
// elle seule.
function visitEntries(entry) {
  const root = visitRootOf(entry);
  if (!root) return [entry];
  const bons = (root.linkedExamenIds || []).map(id => state.historique.find(h => h.id === id)).filter(Boolean);
  if (entry.type === "Examen" && !bons.includes(entry)) bons.push(entry);
  return [root].concat(bons);
}

function currentSoinsEntry() {
  return state.historique.find(h => h.id === state.editingEntryId) || null;
}

function openSoinsForValidation(entryId, opts) {
  const entry = state.historique.find(h => h.id === entryId);
  if (!entry) return;
  const skipNav = !!(opts && opts.skipNav);
  const isExam = entry.type === "Examen";
  const editable = entry.statut !== "Validée"; // une feuille déjà validée s'affiche en lecture seule
  state.editingEntryId = entryId;
  state.currentType = entry.type;
  audit("feuille.ouvrir", { nag: entry.matricule, ressourceType: entry.type === "Examen" ? "Feuille d'examen" : "Feuille de soins", ressourceId: entry.id, ressourceLibelle: entry.numero, apres: { statut: entry.statut } });

  const badge = document.getElementById("soinsBadge");
  badge.textContent = entry.type;
  badge.className = "soins-type-badge " + (isExam ? "examen" : "consultation");

  document.getElementById("soinsNum").value = entry.numero;
  document.getElementById("soinsDate").value = entry.date;
  document.getElementById("soinsFonds").value = entry.fonds || "";
  document.getElementById("soinsFonds").disabled = true;

  // Patient : donnée de l'assuré, verrouillée.
  document.getElementById("p-patientNom").value = entry.patientNom || "";
  document.getElementById("p-dateNaissance").value = displayDateFR(entry.dateNaissance);
  document.getElementById("p-matriculePatient").value = formatNag(entry.matricule);

  const isSelf = !!entry.estAssure;
  document.getElementById("chk-assure").checked = isSelf;
  document.getElementById("chk-ayant").checked = !isSelf;
  document.getElementById("chk-assure-wrap").classList.toggle("on", isSelf);
  document.getElementById("chk-ayant-wrap").classList.toggle("on", !isSelf);

  document.getElementById("soinsWrap").classList.toggle("examen-theme", isExam);
  document.getElementById("prSectionTitle").textContent = isExam ? "Praticien prescripteur" : "Praticien";
  document.getElementById("prestationsSection").hidden = isExam;
  document.getElementById("ordonnanceSection").hidden = isExam;
  document.getElementById("examenSection").hidden = !isExam;

  updateExamSwitchUI(entry);

  // Praticien : pré-rempli à l'accueil, verrouillé — seule la signature revient au médecin.
  document.getElementById("pr-nom").value = entry.medecin || "";
  document.getElementById("pr-etab").value = entry.medecinEtab || "";
  document.getElementById("pr-code").value = entry.medecinCode || "";
  document.getElementById("pr-signature").value = entry.signature || "";
  document.getElementById("pr-signature").disabled = !editable;

  Object.keys(TYPE_LABELS).forEach(key => {
    const checked = entry.medecinType === TYPE_LABELS[key];
    document.getElementById("pr-type-" + key).checked = checked;
    document.getElementById("pr-type-" + key + "-wrap").classList.toggle("on", checked);
  });

  // Ticket modérateur : renseigné à l'accueil, verrouillé.
  Object.keys(TM_IDS).forEach(key => {
    const id = TM_IDS[key];
    const checked = entry.ticketModerateur === key;
    document.getElementById(id).checked = checked;
    document.getElementById(id + "-wrap").classList.toggle("locked", checked);
  });

  // Condition de prise en charge : déjà renseignée à l'accueil, verrouillée pour le médecin.
  document.getElementById("tiers-oui").checked = entry.accidentTiers === "Oui";
  document.getElementById("tiers-non").checked = entry.accidentTiers === "Non";
  document.getElementById("grossesse-oui").checked = entry.grossesse === "Oui";
  document.getElementById("grossesse-non").checked = entry.grossesse === "Non";
  document.querySelectorAll('input[name=tiers], input[name=grossesse]').forEach(el => { el.disabled = true; });

  // Prestation (consultation) : le travail du médecin.
  document.getElementById("presta-date").value = entry.prestaDate || todayFR();
  document.getElementById("presta-code").value = entry.prestaCode || "";
  document.getElementById("presta-domicile-oui").checked = entry.prestaDomicile === "Oui";
  document.getElementById("presta-domicile-non").checked = entry.prestaDomicile === "Non";
  document.getElementById("totalMontant").value = entry.totalMontant || "0";
  document.getElementById("totalTm").value = entry.totalTm || "0";
  document.getElementById("totalPart").value = entry.totalPart || "0";
  setDisabledIds(PRESTA_FIELD_IDS, !editable);

  // Ordonnance : le médecin prescrit désignation + quantité + posologie/durée (pas de montant).
  state.ordoLocked = !editable;
  document.getElementById("addOrdoRowBtn").disabled = !editable;
  document.getElementById("removeOrdoRowBtn").disabled = !editable;
  state.ordoRows = (entry.ordonnance && entry.ordonnance.length) ? entry.ordonnance.map(r => Object.assign({}, r)) : [emptyOrdoRow()];

  // Feuille d'examen : prestation + examens, le travail du médecin.
  document.getElementById("exam-presta-date").value = entry.examDate || todayFR();
  document.getElementById("exam-etablissement").value = entry.examEtablissement || "";
  document.getElementById("exam-code-praticien").value = entry.examCodePraticien || "";
  document.getElementById("exam-code-etablissement").value = entry.examCodeEtablissement || "";
  document.getElementById("exam-motif").value = entry.examMotif || "";
  document.getElementById("exam-pub-signature").value = entry.examPubSignature || "";
  document.getElementById("exam-specialiste-signature").value = entry.examSpecialisteSignature || "";
  document.getElementById("exam-nature-radiologie").checked = entry.examNature === "Radiologie";
  document.getElementById("exam-nature-biologie").checked = entry.examNature === "Biologie";
  document.getElementById("exam-nature-autre").checked = entry.examNature === "Autre";
  document.getElementById("exam-situation-hospitalise").checked = entry.examSituation === "Hospitalisé";
  document.getElementById("exam-situation-externe").checked = entry.examSituation === "Soins Externes";
  setDisabledIds(EXAM_FIELD_IDS, !editable);
  state.prestaLocked = !editable;
  document.getElementById("addExamRowBtn").disabled = !editable;
  document.getElementById("removeExamRowBtn").disabled = !editable;
  state.examRows = (entry.examens && entry.examens.length) ? entry.examens.map(r => Object.assign({}, r)) : [emptyExamRow()];

  // Rien à valider quand toutes les feuilles de la visite le sont déjà.
  document.getElementById("saveSoinsBtn").hidden = visitEntries(entry).every(e => e.statut === "Validée");

  drawPseudoQR(document.getElementById("qrCanvas"), (entry.matricule || "") + "-" + entry.numero);

  renderOrdoRows();
  renderExamRows();
  if (skipNav) applyViewChrome("soins"); else goToView("soins");
}

// Enregistre la saisie en cours dans la feuille affichée, sans toucher à son
// statut : appelé en quittant la feuille, en basculant vers l'autre feuille et
// avant toute validation, pour ne jamais perdre une saisie.
function saveSoinsDraft() {
  const entry = currentSoinsEntry();
  if (!entry || entry.statut === "Validée") return;
  captureFormIntoEntry(entry);
  persistFeuillesQuiet();
}

/* ---- Validation : consultation + feuille d'examen d'un coup -------------- */

// Une ligne d'ordonnance est « complète » si le médicament, une quantité
// (entier ≥ 1, Prescription.quantite_prescrite > 0 en base) et la posologie /
// durée sont renseignés : c'est ce que le pharmacien délivre, il n'y a donc
// rien à deviner de son côté.
function ordoRowMissing(r) {
  const miss = [];
  if (!r.designation) miss.push("médicament");
  const q = String(r.quantite || "").trim();
  if (!/^\d+$/.test(q) || parseInt(q, 10) < 1) miss.push("quantité (entier ≥ 1)");
  if (!String(r.posologie || "").trim()) miss.push("posologie / durée");
  return miss;
}
function ordoRowIsBlank(r) {
  return !r.designation && !String(r.quantite || "").trim() && !String(r.posologie || "").trim();
}

// Points bloquants d'une feuille — uniquement la partie du médecin (ce que
// l'accueil a renseigné est verrouillé, le médecin ne peut pas le corriger).
function entryProblems(entry) {
  const p = [];
  if (!(entry.signature || "").trim()) p.push({ field: "pr-signature", text: "Signature du praticien manquante" });
  if (entry.type === "Examen") {
    if (!extractFRDate(entry.examDate)) p.push({ field: "exam-presta-date", text: "Date de la prestation d'examen invalide (format JJ/MM/AAAA)" });
    if (!entry.examNature) p.push({ field: "exam-presta-date", text: "Nature de la prestation à choisir (Radiologie, Biologie ou Autre)" });
    if (!(entry.examens || []).some(r => (r.designation || "").trim())) p.push({ field: "examenBody", text: "Aucun examen désigné" });
  } else {
    if (!extractFRDate(entry.prestaDate)) p.push({ field: "presta-date", text: "Date de la prestation invalide (format JJ/MM/AAAA)" });
    (entry.ordonnance || []).forEach((r, i) => {
      const miss = ordoRowMissing(r);
      if (miss.length) p.push({ field: "ordoBody", text: "Ordonnance, ligne " + (i + 1) + " : " + miss.join(", ") + " à préciser" });
    });
  }
  return p;
}

function paperTitleHtml(e) {
  const isExam = e.type === "Examen";
  return '<span class="pill ' + (isExam ? "examen" : "consultation") + '">' + (isExam ? "Examen" : "Consultation") + "</span> " + escapeHtml(e.numero);
}

// Amène le médecin sur le premier champ à corriger de la feuille affichée.
function focusProblemField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.focus({ preventScroll: true });
}

let visitModalFocusField = null;
function closeVisitModal(skipFocus) {
  document.getElementById("visitModal").hidden = true;
  const field = visitModalFocusField;
  visitModalFocusField = null;
  if (field && !skipFocus) focusProblemField(field);
}
document.getElementById("closeVisitModal").addEventListener("click", () => closeVisitModal());
document.getElementById("cancelVisitModal").addEventListener("click", () => closeVisitModal());
document.getElementById("confirmVisitBtn").addEventListener("click", () => commitVisitValidation());
document.getElementById("visitModalBody").addEventListener("click", e => {
  const btn = e.target.closest("[data-goto]");
  if (!btn) return;
  closeVisitModal(true);
  flipSoinsTo(parseInt(btn.dataset.goto, 10));
});

// « Valider et enregistrer » : enregistre le brouillon, puis soit liste ce qui
// reste à compléter (validation bloquée), soit demande confirmation en
// récapitulant les feuilles validées d'un coup (consultation + feuille d'examen
// ajoutée) — on ne peut pas laisser l'une validée et l'autre oubliée.
function openVisitValidation() {
  const entry = currentSoinsEntry();
  if (!entry) return;
  guardSuspended(entry.matricule, entry.patientNom, "la feuille ne peut pas être validée.", openVisitValidationNow, "feuille.valider");
}
function openVisitValidationNow() {
  const current = currentSoinsEntry();
  if (!current) return;
  saveSoinsDraft();
  const group = visitEntries(current);
  const pending = group.filter(e => e.statut !== "Validée");
  if (!pending.length) return;

  const issues = pending.map(e => ({ entry: e, problems: entryProblems(e) })).filter(x => x.problems.length);
  const body = document.getElementById("visitModalBody");
  const confirmBtn = document.getElementById("confirmVisitBtn");

  if (issues.length) {
    document.getElementById("visitModalTitle").textContent = "À compléter avant de valider";
    body.innerHTML =
      '<p class="hint" style="margin:0 0 12px">La validation est bloquée tant que les points suivants ne sont pas renseignés.</p>' +
      '<ul class="visit-recap">' + issues.map(x =>
        '<li class="' + (x.entry.type === "Examen" ? "examen" : "consultation") + '">' +
          '<div class="visit-recap-title">' + paperTitleHtml(x.entry) + "</div>" +
          "<ul>" + x.problems.map(pr => "<li>" + escapeHtml(pr.text) + "</li>").join("") + "</ul>" +
          (x.entry.id !== current.id ? '<button type="button" class="btn-secondary btn-sm" data-goto="' + x.entry.id + '">Aller à cette feuille</button>' : "") +
        "</li>"
      ).join("") + "</ul>";
    confirmBtn.hidden = true;
    const own = issues.find(x => x.entry.id === current.id);
    visitModalFocusField = own ? own.problems[0].field : null;
  } else {
    // Consultation à valider sans aucun médicament : on demande au médecin s'il en est sûr
    // (elle ne sera pas envoyée à la pharmacie).
    const noMeds = pending.filter(e => e.type === "Consultation" && !(e.ordonnance || []).length);
    document.getElementById("visitModalTitle").textContent = noMeds.length ? "Valider sans médicaments ?" : (group.length > 1 ? "Valider les feuilles" : "Valider la feuille");
    const warn = noMeds.length
      ? '<div class="visit-warn"><b>Aucun médicament n\'est prescrit</b> sur la consultation ' + escapeHtml(noMeds[0].numero) +
        ". Elle sera validée et versée au dossier, mais <b>elle ne sera pas envoyée à la pharmacie</b>.<br />Êtes-vous sûr de vouloir valider sans médicaments ?</div>"
      : "";
    body.innerHTML = warn +
      '<p class="hint" style="margin:0 0 12px">Les feuilles ci-dessous seront validées et versées au dossier de <b>' + escapeHtml(current.patientNom || "") + "</b>. Cette action est définitive.</p>" +
      '<ul class="visit-recap">' + group.map(e => {
        const done = e.statut === "Validée";
        const detail = e.type === "Examen"
          ? escapeHtml(e.examNature || "") + " — " + (e.examens || []).filter(r => r.designation).length + " examen(s)"
          : ((e.ordonnance || []).length
              ? (e.ordonnance || []).length + " médicament(s) prescrit(s) — envoyée à la pharmacie"
              : "Aucun médicament prescrit — non envoyée à la pharmacie");
        return '<li class="' + (e.type === "Examen" ? "examen" : "consultation") + (done ? " done" : "") + '">' +
          '<div class="visit-recap-title">' + paperTitleHtml(e) + (done ? ' <span class="pill validee">Déjà validée</span>' : "") + "</div>" +
          '<div class="visit-recap-sub">' + detail + "</div></li>";
      }).join("") + "</ul>";
    confirmBtn.textContent = noMeds.length ? "Oui, valider sans médicaments" : "Confirmer la validation";
    confirmBtn.hidden = false;
    visitModalFocusField = null;
  }
  document.getElementById("visitModal").hidden = false;
}

async function commitVisitValidation() {
  const current = currentSoinsEntry();
  if (!current) return;
  const group = visitEntries(current);
  const pending = group.filter(e => e.statut !== "Validée");
  const visitRef = newId("V");   // corrélation : toutes les feuilles validées d'un coup
  pending.forEach(e => { e.statut = "Validée"; });
  try {
    await persistFeuilles();
  } catch (err) {
    // le serveur a refusé (droits, assuré suspendu, feuille déjà validée…) ou ne répond pas : rien n'est validé
    pending.forEach(e => { e.statut = "En attente"; });
    closeVisitModal(true);
    showInfoModal("Validation impossible", "<p>" + escapeHtml(err.message) + "</p><p class=\"hint\">La feuille reste en attente : vous pouvez réessayer.</p>");
    if (!err.isNetworkError) pullFeuilles(true).catch(() => {});
    return;
  }
  pending.forEach(e => {
    audit("feuille.valider", {
      correlationId: visitRef, nag: e.matricule, ressourceType: e.type === "Examen" ? "Feuille d'examen" : "Feuille de soins", ressourceId: e.id, ressourceLibelle: e.numero,
      avant: { statut: "En attente" },
      apres: { statut: "Validée", medicaments: (e.ordonnance || []).filter(m => m.designation).length, envoyeePharmacie: e.type === "Consultation" && (e.ordonnance || []).some(m => m.designation) }
    });
  });
  state.editingEntryId = null;
  refreshPendingBadge();
  closeVisitModal(true);
  goToView("medecin");
  const consult = pending.find(e => e.type === "Consultation");
  const pharmacyNote = !consult ? "" : (isSentToPharmacy(consult)
    ? "<p>L'ordonnance est envoyée à la pharmacie.</p>"
    : "<p>Sans médicaments prescrits : la feuille n'est <b>pas</b> envoyée à la pharmacie.</p>");
  showInfoModal(
    pending.length > 1 ? "Feuilles validées" : "Feuille validée",
    "<p>" + pending.length + " feuille" + (pending.length > 1 ? "s validées" : " validée") + " pour <b>" + escapeHtml(current.patientNom || "") +
    "</b> — le dossier du patient est mis à jour.</p>" + pharmacyNote
  );
}

// « Historique des visites » (header de la feuille de soins) : ouvre le dossier de
// l'assuré examiné, sur sa chronologie. La visite en cours y est mise en évidence,
// avec sa feuille d'examen rattachée à sa consultation, et un bouton ramène à la
// feuille (la saisie en cours est gardée en brouillon).
async function openHistoryFromSheet() {
  const entry = currentSoinsEntry();
  if (!entry) return;
  saveSoinsDraft();
  const head = visitRootOf(entry) || entry;
  try {
    const patient = await findPatientByMatricule(entry.matricule);
    if (!patient) {
      showInfoModal("Dossier introuvable", "<p>Aucun assuré en base pour le matricule <b>" + escapeHtml(formatNag(entry.matricule)) + "</b>.</p>");
      return;
    }
    openDossierPatient(patient, { fromSheet: true, focusId: head.id });
  } catch (err) {
    showInfoModal("Erreur API", "<p>" + escapeHtml(err.message) + "</p>");
  }
}
document.getElementById("topbarHistoryBtn").addEventListener("click", openHistoryFromSheet);
document.getElementById("dpBackToSheetBtn").addEventListener("click", () => {
  if (viewHistory[viewHistory.length - 1] === "soins") viewHistory.pop();
  goToView("soins", { fromBack: true });
});

document.getElementById("saveSoinsBtn").addEventListener("click", openVisitValidation);
document.getElementById("cancelSoinsBtn").addEventListener("click", () => goToView("medecin"));

// Correspondance Patient.fonds (code 1-4, voir FONDS_LABELS) → libellé du
// menu "Fonds" de la feuille de soins (trois valeurs fixes, sans équivalent
// pour le code 4 — repli sur "Fonds Secteur Privé", la valeur la plus
// courante, faute de mieux).
const SOINS_FONDS_LABEL = { 1: "Fonds Secteur Public", 2: "Fonds Secteur Privé", 3: "Fonds Garantie Sociale" };

// « Enregistrer » (Nouvelle prise en charge) : plus de choix Consultation/
// Examen à cette étape — c'est le médecin qui décide au moment de la
// validation (voir commitVisitValidation). On crée directement
// une entrée "En attente" dans la file du médecin, avec les seules infos
// déjà connues à ce stade (patient, ticket modérateur, médecin) ; le détail
// (prestations, ordonnance, bon d'examen) sera rempli par le médecin à la
// validation — comme aujourd'hui pour une entrée créée par l'agent.
document.getElementById("enregistrerPecBtn").addEventListener("click", async () => {
  const patient = state.currentPatient;
  const medecin = state.currentMedecin;
  if (!state.currentAssure || !patient || !state.currentTM || !medecin) return;
  if (isSuspended(state.currentAssure)) { refuseSuspendedPec(); return; }

  const entry = {
    id: newFeuilleId(),
    numero: nextFeuilleNum(),
    date: todayFR(),
    type: "Consultation",
    patientNom: patient.prenom + " " + patient.nom,
    dateNaissance: patient.dateNaissance || "",
    matricule: patient.matricule || "",
    estAssure: !!patient.estAssure,
    fonds: SOINS_FONDS_LABEL[Math.round(num(state.currentAssure.fonds))] || "Fonds Secteur Privé",
    ticketModerateur: state.currentTM,
    medecin: "Dr. " + medecin.prenom + " " + medecin.nom,
    medecinEtab: medecin.etablissement,
    medecinCode: medecin.code,
    medecinId: medecin.id,
    medecinType: medecin.type,
    quartier: document.getElementById("pec-quartier").value.trim(),
    telephone: document.getElementById("pec-telephone").value.trim(),
    service: document.getElementById("pec-service").value,
    accidentTiers: "",
    grossesse: "",
    statut: "En attente",
    prestations: [],
    ordonnance: [],
    prestaDate: "",
    prestaDomicile: "",
    prestaCode: "",
    examens: [],
    examNature: "",
    examSituation: "",
    examCodePraticien: "",
    examEtablissement: "",
    examCodeEtablissement: "",
    examDate: "",
    examMotif: "",
    examPubSignature: "",
    examSpecialisteSignature: "",
    totalMontant: "0",
    totalTm: "0",
    totalPart: "0"
  };
  const submitBtn = document.getElementById("enregistrerPecBtn");
  submitBtn.disabled = true;
  state.historique.unshift(entry);
  try {
    await persistFeuilles();
  } catch (err) {
    state.historique = state.historique.filter(h => h.id !== entry.id);
    feuilleSnapshot.delete(entry.id);
    updateActionButtons();
    showInfoModal("Enregistrement impossible", "<p>" + escapeHtml(err.message) + "</p>");
    return;
  }
  state.historiquePage = 1;
  refreshPendingBadge();
  audit("pec.creer", { nag: entry.matricule, ressourceType: "Feuille de soins", ressourceId: entry.id, ressourceLibelle: entry.numero, apres: { ticketModerateur: entry.ticketModerateur, medecin: entry.medecin, statut: entry.statut } });
  showInfoModal("Prise en charge enregistrée", "<p>La feuille a été envoyée en attente de validation par le médecin.</p>", () => resetSearch());
});

// « Nouvelle consultation » (visible uniquement si le patient a déjà plus
// d'une consultation dans son dossier, voir showAssureCard) : crée elle
// aussi directement une entrée "En attente" dans la file du médecin — même
// action qu'« Enregistrer » ci-dessus (voir ce commentaire pour le
// pourquoi : c'est le médecin qui décide du détail à la validation).
document.getElementById("nouvellePecConsultationBtn").addEventListener("click", async () => {
  const patient = state.currentPatient;
  const medecin = state.currentMedecin;
  if (!state.currentAssure || !patient || !state.currentTM || !medecin) return;
  if (isSuspended(state.currentAssure)) { refuseSuspendedPec(); return; }

  const entry = {
    id: newFeuilleId(),
    numero: nextFeuilleNum(),
    date: todayFR(),
    type: "Consultation",
    patientNom: patient.prenom + " " + patient.nom,
    dateNaissance: patient.dateNaissance || "",
    matricule: patient.matricule || "",
    estAssure: !!patient.estAssure,
    fonds: SOINS_FONDS_LABEL[Math.round(num(state.currentAssure.fonds))] || "Fonds Secteur Privé",
    ticketModerateur: state.currentTM,
    medecin: "Dr. " + medecin.prenom + " " + medecin.nom,
    medecinEtab: medecin.etablissement,
    medecinCode: medecin.code,
    medecinId: medecin.id,
    medecinType: medecin.type,
    quartier: document.getElementById("pec-quartier").value.trim(),
    telephone: document.getElementById("pec-telephone").value.trim(),
    service: document.getElementById("pec-service").value,
    accidentTiers: "",
    grossesse: "",
    statut: "En attente",
    prestations: [],
    ordonnance: [],
    prestaDate: "",
    prestaDomicile: "",
    prestaCode: "",
    examens: [],
    examNature: "",
    examSituation: "",
    examCodePraticien: "",
    examEtablissement: "",
    examCodeEtablissement: "",
    examDate: "",
    examMotif: "",
    examPubSignature: "",
    examSpecialisteSignature: "",
    totalMontant: "0",
    totalTm: "0",
    totalPart: "0"
  };
  const submitBtn2 = document.getElementById("nouvellePecConsultationBtn");
  submitBtn2.disabled = true;
  state.historique.unshift(entry);
  try {
    await persistFeuilles();
  } catch (err) {
    state.historique = state.historique.filter(h => h.id !== entry.id);
    feuilleSnapshot.delete(entry.id);
    updateActionButtons();
    showInfoModal("Enregistrement impossible", "<p>" + escapeHtml(err.message) + "</p>");
    return;
  }
  state.historiquePage = 1;
  refreshPendingBadge();
  showInfoModal("Nouvelle consultation enregistrée", "<p>La feuille a été envoyée en attente de validation par le médecin.</p>", () => resetSearch());
});

/* ---- Bascule animée Consultation ⇄ Examen (feuille d'examen liée) -------- */

let soinsFlipBusy = false; // évite deux bascules (ou deux feuilles d'examen) sur un double clic

function newEntryId() {
  let id = newFeuilleId();
  while (state.historique.some(h => h.id === id)) id++;
  return id;
}

// Met à jour les deux cartes de bascule : sur la consultation, le bouton bleu
// « Ajouter la feuille d'examen » (ou « Voir la feuille d'examen » si elle
// existe déjà) ; sur la feuille d'examen, le retour vers la consultation.
function updateExamSwitchUI(entry) {
  const isExam = entry.type === "Examen";
  const forwardBox = document.getElementById("recommandExamenSection");
  const backBox = document.getElementById("retourConsultationSection");

  const linked = isExam ? [] : (entry.linkedExamenIds || [])
    .map(id => state.historique.find(h => h.id === id))
    .filter(Boolean);
  const last = linked[linked.length - 1];
  // Ajouter n'a de sens que tant que la consultation n'est pas validée ; voir la feuille existante reste toujours possible.
  forwardBox.hidden = isExam || (!last && entry.statut === "Validée");
  if (!isExam) {
    const btn = document.getElementById("examSwitchBtn");
    if (last) {
      document.getElementById("examSwitchBtnLabel").textContent = "Voir la feuille d'examen " + last.numero;
      document.getElementById("examSwitchSub").textContent = "Une feuille d'examen a déjà été ajoutée pour cette consultation.";
      btn.dataset.mode = "goto";
      btn.dataset.targetId = String(last.id);
    } else {
      document.getElementById("examSwitchBtnLabel").textContent = "Ajouter la feuille d'examen";
      document.getElementById("examSwitchSub").textContent = "Ajoute une feuille d'examen liée, pré-remplie avec les informations du patient.";
      btn.dataset.mode = "create";
      btn.dataset.targetId = "";
    }
  }

  const src = isExam && entry.linkedConsultationId
    ? state.historique.find(h => h.id === entry.linkedConsultationId)
    : null;
  backBox.hidden = !src;
  if (src) {
    document.getElementById("retourConsultationSub").textContent = "Liée à la consultation " + src.numero;
    document.getElementById("retourConsultationBtn").dataset.targetId = String(src.id);
  }
}

// Anime la feuille (léger flip 3D) puis recharge la feuille demandée à la
// place, sans quitter la vue — donne l'impression de « retourner » le papier.
// La saisie en cours sur la feuille quittée est d'abord sauvegardée (brouillon,
// statut inchangé) pour ne rien perdre en allant-venant entre les deux feuilles.
function flipSoinsTo(entryId) {
  if (soinsFlipBusy || entryId === state.editingEntryId) return;
  if (!state.historique.some(h => h.id === entryId)) return;
  soinsFlipBusy = true;
  saveSoinsDraft();

  const wrap = document.getElementById("soinsWrap");
  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  wrap.classList.add("flip-leave");
  window.setTimeout(() => {
    try {
      openSoinsForValidation(entryId, { skipNav: true });
      // La nouvelle feuille entre par le côté opposé : on la place d'abord sans
      // transition, puis on rend la main à la transition vers l'état normal.
      wrap.style.transition = "none";
      wrap.classList.remove("flip-leave");
      wrap.classList.add("flip-enter");
      void wrap.offsetWidth; // force le reflow
      wrap.style.transition = "";
      wrap.classList.remove("flip-enter");
      window.scrollTo({ top: 0 });
    } finally {
      soinsFlipBusy = false;
    }
  }, reduced ? 0 : 260);
}

// « Ajouter la feuille d'examen » : crée la feuille d'examen liée à la
// consultation, pré-remplie avec les informations du patient et la signature
// déjà saisie, puis bascule dessus.
let creatingLinkedExam = false;
async function createLinkedExamAndFlip(consultId) {
  if (soinsFlipBusy || creatingLinkedExam) return;
  const consultEntry = state.historique.find(h => h.id === consultId);
  if (!consultEntry || consultEntry.statut === "Validée") return;
  const liveSignature = document.getElementById("pr-signature").value.trim();
  saveSoinsDraft();
  const examEntry = examEntryFromConsultation(consultEntry, liveSignature || consultEntry.signature || "");
  const previousLinks = consultEntry.linkedExamenIds;
  consultEntry.linkedExamenIds = (consultEntry.linkedExamenIds || []).concat([examEntry.id]);
  state.historique.unshift(examEntry);
  creatingLinkedExam = true;
  try {
    await persistFeuilles();
  } catch (err) {
    state.historique = state.historique.filter(h => h.id !== examEntry.id);
    feuilleSnapshot.delete(examEntry.id);
    consultEntry.linkedExamenIds = previousLinks;
    showInfoModal("Feuille d'examen non créée", "<p>" + escapeHtml(err.message) + "</p>");
    return;
  } finally { creatingLinkedExam = false; }
  refreshPendingBadge();
  audit("examen.recommander", { nag: consultEntry.matricule, ressourceType: "Feuille d'examen", ressourceId: examEntry.id, ressourceLibelle: examEntry.numero, apres: { consultation: consultEntry.numero } });
  flipSoinsTo(examEntry.id);
}

document.getElementById("examSwitchBtn").addEventListener("click", () => {
  const btn = document.getElementById("examSwitchBtn");
  if (btn.dataset.mode === "goto" && btn.dataset.targetId) {
    flipSoinsTo(parseInt(btn.dataset.targetId, 10));
  } else {
    const current = currentSoinsEntry();
    if (current && current.type === "Consultation") createLinkedExamAndFlip(current.id);
  }
});
document.getElementById("retourConsultationBtn").addEventListener("click", () => {
  const targetId = document.getElementById("retourConsultationBtn").dataset.targetId;
  if (targetId) flipSoinsTo(parseInt(targetId, 10));
});

function cell(key, value, kind, disabled) {
  const cls = kind === "num" ? "num" : "";
  const val = value ? String(value).replace(/"/g, "&quot;") : "";
  return '<td><input type="text" class="' + cls + '" data-key="' + key + '" value="' + val + '"' + (disabled ? " disabled" : "") + " /></td>";
}

/* ---- Examens (tableau du bon d'examen, rempli par le médecin) ---------- */

function emptyExamRow() { return { designation: "", cotation: "", tm: "", part: "" }; }

function renderExamRows() {
  const body = document.getElementById("examenBody");
  if (!body) return;
  body.innerHTML = "";
  const locked = !!state.prestaLocked;
  state.examRows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      cell("designation", row.designation, "text", locked) +
      cell("cotation", row.cotation, "num", locked) +
      cell("tm", row.tm, "num", locked) +
      cell("part", row.part, "num", locked);
    body.appendChild(tr);

    if (!locked) {
      ["designation", "cotation", "tm", "part"].forEach(key => {
        tr.querySelector('[data-key="' + key + '"]').addEventListener("input", e => {
          state.examRows[i][key] = e.target.value;
          updateExamTotals();
        });
      });
    }
  });
  updateExamTotals();
}

document.getElementById("addExamRowBtn").addEventListener("click", () => {
  if (state.prestaLocked) return;
  state.examRows.push(emptyExamRow());
  renderExamRows();
});
document.getElementById("removeExamRowBtn").addEventListener("click", () => {
  if (state.prestaLocked) return;
  if (state.examRows.length > 1) state.examRows.pop();
  renderExamRows();
});

/* ---- Ordonnance (médicaments prescrits par le médecin) ----------------- */

function emptyOrdoRow() {
  return { designation: "", quantite: "", posologie: "", statut: "Non servi", servicePar: "", dateService: "", prixUnitaire: "", partAssurance: "", partPatient: "" };
}

function renderOrdoRows() {
  const body = document.getElementById("ordoBody");
  if (!body) return;
  body.innerHTML = "";
  const locked = !!state.ordoLocked;
  state.ordoRows.forEach((row, i) => {
    const tr = document.createElement("tr");
    const options = '<option value=""></option>' + state.catalogue.map(m =>
      '<option value="' + m.designation.replace(/"/g, "&quot;") + '"' + (row.designation === m.designation ? " selected" : "") + ">" + m.designation + "</option>"
    ).join("");
    tr.innerHTML =
      '<td><select data-key="designation"' + (locked ? " disabled" : "") + ">" + options + "</select></td>" +
      '<td><input type="text" class="num" data-key="quantite" maxlength="9" value="' + (row.quantite ? String(row.quantite).replace(/"/g, "&quot;") : "") + '"' + (locked ? " disabled" : "") + " /></td>" +
      '<td><input type="text" data-key="posologie" maxlength="100" value="' + (row.posologie ? String(row.posologie).replace(/"/g, "&quot;") : "") + '"' + (locked ? " disabled" : "") + " /></td>";
    body.appendChild(tr);

    if (!locked) {
      tr.querySelector('[data-key="designation"]').addEventListener("change", e => { state.ordoRows[i].designation = e.target.value; });
      tr.querySelector('[data-key="quantite"]').addEventListener("input", e => { state.ordoRows[i].quantite = e.target.value; });
      tr.querySelector('[data-key="posologie"]').addEventListener("input", e => { state.ordoRows[i].posologie = e.target.value; });
    }
  });
}

document.getElementById("addOrdoRowBtn").addEventListener("click", () => {
  if (state.ordoLocked) return;
  state.ordoRows.push(emptyOrdoRow());
  renderOrdoRows();
});
document.getElementById("removeOrdoRowBtn").addEventListener("click", () => {
  if (state.ordoLocked) return;
  if (state.ordoRows.length > 1) state.ordoRows.pop();
  renderOrdoRows();
});

function num(v) {
  const n = parseFloat(String(v || "").replace(/[^0-9.,-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function fmt(n) {
  if (!n) return "0";
  return Math.round(n).toLocaleString("fr-FR");
}
function updateExamTotals() {
  const sum = key => state.examRows.reduce((a, r) => a + num(r[key]), 0);
  document.getElementById("examTotalCotation").value = fmt(sum("cotation"));
  document.getElementById("examTotalTm").value = fmt(sum("tm"));
  document.getElementById("examTotalPart").value = fmt(sum("part"));
}

// Bon d'examen créé par le médecin depuis la consultation (bouton
// « Recommander un examen ») — reprend les données partagées du patient et du
// praticien, prêt à être complété. `signature` : celle déjà saisie par le
// médecin, reprise pour lui éviter de la ressaisir (elle reste modifiable).
function examEntryFromConsultation(consultEntry, signature) {
  return {
    id: newEntryId(),
    numero: nextFeuilleNum(),
    date: todayFR(),
    type: "Examen",
    patientNom: consultEntry.patientNom,
    dateNaissance: consultEntry.dateNaissance,
    matricule: consultEntry.matricule,
    estAssure: consultEntry.estAssure,
    fonds: consultEntry.fonds,
    ticketModerateur: consultEntry.ticketModerateur,
    medecin: consultEntry.medecin,
    medecinEtab: consultEntry.medecinEtab,
    medecinId: consultEntry.medecinId,
    medecinCode: consultEntry.medecinCode,
    medecinType: consultEntry.medecinType,
    quartier: consultEntry.quartier,
    telephone: consultEntry.telephone,
    service: consultEntry.service,
    accidentTiers: consultEntry.accidentTiers,
    grossesse: consultEntry.grossesse,
    statut: "En attente",
    prestations: [],
    ordonnance: [],
    prestaDate: "",
    prestaDomicile: "",
    prestaCode: "",
    examens: [],
    examNature: "",
    examSituation: "",
    examCodePraticien: "",
    examEtablissement: "",
    examCodeEtablissement: "",
    examDate: "",
    examMotif: "",
    examPubSignature: "",
    examSpecialisteSignature: "",
    totalMontant: "0",
    totalTm: "0",
    totalPart: "0",
    signature: signature || "",
    linkedConsultationId: consultEntry.id
  };
}

// Recopie l'état actuel du formulaire (Prestation/Ordonnance ou bon d'examen)
// dans l'entrée d'historique correspondante — sans toucher à son statut.
// Utilisé en quittant la feuille, en changeant de feuille dans la visite et
// avant la validation, pour qu'aucune saisie en cours ne soit perdue.
function captureFormIntoEntry(entry) {
  entry.signature = document.getElementById("pr-signature").value;

  if (entry.type === "Examen") {
    entry.examens = state.examRows.filter(r => r.designation || r.cotation);
    entry.examNature = (document.querySelector('input[name=examNature]:checked') || {}).value || "";
    entry.examSituation = (document.querySelector('input[name=examSituation]:checked') || {}).value || "";
    entry.examCodePraticien = document.getElementById("exam-code-praticien").value;
    entry.examEtablissement = document.getElementById("exam-etablissement").value;
    entry.examCodeEtablissement = document.getElementById("exam-code-etablissement").value;
    entry.examDate = document.getElementById("exam-presta-date").value;
    entry.examMotif = document.getElementById("exam-motif").value;
    entry.examPubSignature = document.getElementById("exam-pub-signature").value;
    entry.examSpecialisteSignature = document.getElementById("exam-specialiste-signature").value;
    entry.totalMontant = document.getElementById("examTotalCotation").value;
    entry.totalTm = document.getElementById("examTotalTm").value;
    entry.totalPart = document.getElementById("examTotalPart").value;
  } else {
    // Une ligne partiellement remplie reste en brouillon (rien ne disparaît en
    // silence) ; c'est la validation qui exige des lignes complètes.
    entry.ordonnance = state.ordoRows
      .filter(r => !ordoRowIsBlank(r))
      .map(r => ({
        designation: r.designation, quantite: String(r.quantite || "").trim(), posologie: String(r.posologie || "").trim(),
        statut: "Non servi", servicePar: "", dateService: "", prixUnitaire: "", partAssurance: "", partPatient: ""
      }));
    entry.totalMontant = document.getElementById("totalMontant").value;
    entry.totalTm = document.getElementById("totalTm").value;
    entry.totalPart = document.getElementById("totalPart").value;
    entry.prestaDate = document.getElementById("presta-date").value;
    entry.prestaDomicile = (document.querySelector('input[name=domicile]:checked') || {}).value || "";
    entry.prestaCode = document.getElementById("presta-code").value;
  }
}

// AAAA-MM-JJ à partir d'une date française JJ/MM/AAAA (state.historique
// stocke les dates en français) — sans passer par Date/toISOString, qui
// décale la date selon le fuseau horaire local.
function frDateToISO(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || "");
  return m ? (m[3] + "-" + m[2] + "-" + m[1]) : new Date().toISOString().slice(0, 10);
}

// La validation d'une feuille crée côté serveur, dans la même transaction, la prestation, la prise en
// charge, l'examen ou l'ordonnance : le dossier patient (Consultations / Examens) se met donc à jour tout
// seul, sans appel supplémentaire de l'interface.

/* ---------------------------------------------------------------------- */
/* Tableau de bord : statistiques, courbes d'évolution, répartition,       */
/* dernières opérations médicales                                         */
/* ---------------------------------------------------------------------- */

// Feuilles « En attente » qui concernent l'utilisateur connecté : celles de ses
// patients s'il est médecin reconnu dans le catalogue (matchCurrentUserToMedecin),
// toutes sinon (agent, administrateur…).
function myPendingEntries() {
  const pending = state.historique.filter(h => h.statut === "En attente");
  const me = matchCurrentUserToMedecin();
  return me ? pending.filter(h => isMyPatient(h, me)) : pending;
}
function pendingCount() { return waitingVisits(myPendingEntries()).length; }

// Pastille de la sidebar : nombre de patients en attente pour l'utilisateur connecté.
function refreshPendingBadge() {
  const badge = document.getElementById("medecinNavBadge");
  if (!badge) return;
  const n = pendingCount();
  badge.textContent = n;
  badge.hidden = n === 0;
}

function renderDashboardStats() {
  renderPharmaDashboard();
  renderHopitalDashboard();
  refreshPendingBadge();
}

function renderRapports() {
  renderPharmaRapport();
  renderHopitalRapport();
}

/* ---- Utilitaires de dates -------------------------------------------- */

function parseFRDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || "");
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
}

// Première date JJ/MM/AAAA valide trouvée dans un texte libre ("12/09/2026",
// "12/09/2026 14h30"…) — la date de prestation est saisie à la main par le
// médecin. Renvoie "" si aucune date réelle (le 31/02 est refusé).
function extractFRDate(s) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || "");
  if (!m) return "";
  const y = parseInt(m[3], 10), mo = parseInt(m[2], 10), d = parseInt(m[1], 10);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? m[0] : "";
}
// Une même date s'affiche toujours en JJ/MM/AAAA : les dates de naissance
// viennent parfois de l'API en AAAA-MM-JJ, parfois des données de démo en JJ/MM/AAAA.
function displayDateFR(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? dossierDateFR(s) : (s || "");
}
// AAAA-MM-JJ d'une date française saisie librement, "" si elle est invalide
// (contrairement à frDateToISO, qui retombe sur aujourd'hui).
function frToISO(s) {
  const f = extractFRDate(s);
  if (!f) return "";
  const p = f.split("/");
  return p[2] + "-" + p[1] + "-" + p[0];
}

/* ---------------------------------------------------------------------- */
/* Espace Médecin : file d'attente des feuilles à valider                  */
/* ---------------------------------------------------------------------- */

// « Patients en attente » : une ligne par patient (visite en cours), avec ses
// feuilles rattachées — la consultation et, en retrait, la feuille d'examen
// qu'elle a fait ajouter. Une feuille d'examen dont la consultation est déjà
// validée reste avec elle tant qu'elle n'est pas validée à son tour ; une
// feuille d'examen isolée forme une visite à elle seule. Un médecin reconnu dans
// le catalogue ne voit par défaut que ses patients ; « Tous les médecins » lève ce
// filtre. Avoir déjà un dossier ne dispense jamais une nouvelle visite de passer
// par la validation.

// Visites en attente d'après des feuilles « En attente » : chaque visite regroupe
// la consultation (tête) et ses feuilles d'examen, ou une feuille d'examen seule.
// `open` est la première feuille encore à valider (la consultation d'abord).
function waitingVisits(pendingEntries) {
  const seen = new Set();
  const visits = [];
  pendingEntries.forEach(e => {
    const head = visitRootOf(e) || e;
    if (seen.has(head.id)) return;
    seen.add(head.id);
    const sheets = visitEntries(e);
    visits.push({ head: head, sheets: sheets, open: sheets.find(s => s.statut !== "Validée") || e });
  });
  return visits;
}

function queueScope() {
  return matchCurrentUserToMedecin() ? (state.queueScope || "mine") : "all";
}

function renderMedecinQueue() {
  const body = document.getElementById("medecinQueueBody");
  const empty = document.getElementById("medecinQueueEmpty");
  const toggle = document.getElementById("queueScopeToggle");
  const me = matchCurrentUserToMedecin();
  const scope = queueScope();
  toggle.hidden = !me;
  toggle.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.scope === scope));

  const all = waitingVisits(state.historique.filter(h => h.statut === "En attente"));
  const visits = me && scope === "mine" ? all.filter(v => isMyPatient(v.head, me)) : all;

  body.innerHTML = "";
  empty.hidden = visits.length > 0;
  empty.textContent = me && scope === "mine" && all.length
    ? "Aucun patient en attente pour vous — " + all.length + " chez d'autres médecins (« Tous les médecins »)."
    : "Aucun patient en attente.";
  const count = document.getElementById("medecinQueueCount");
  count.textContent = visits.length + " en attente";
  count.hidden = visits.length === 0;

  const info = pageSlice("queue", visits, 8);
  info.items.forEach(v => {
    const h = v.head;
    const isExam = h.type === "Examen";
    const sheets = v.sheets.map((s, i) =>
      '<div class="queue-sheet' + (i > 0 ? " child" : "") + '">' +
        '<span class="pill ' + (s.type === "Examen" ? "examen" : "consultation") + '">' + (s.type === "Examen" ? "Examen" : "Consultation") + "</span>" +
        '<span class="queue-sheet-num">' + escapeHtml(s.numero) + "</span>" +
        (s.statut === "Validée" ? ' <span class="pill validee">Validée</span>' : "") +
      "</div>"
    ).join("");
    const tr = document.createElement("tr");
    tr.className = isExam ? "queue-exam" : "queue-consult";
    tr.innerHTML =
      '<td class="queue-patient">' + escapeHtml(h.patientNom || "") + "</td>" +
      "<td>" + escapeHtml(formatNag(h.matricule)) + "</td>" +
      '<td><div class="queue-sheets">' + sheets + "</div></td>" +
      "<td>" + escapeHtml(h.medecin || "") + "</td>" +
      "<td>" + escapeHtml(h.date) + "</td>" +
      '<td class="row-actions"><button type="button" class="btn-secondary btn-sm" data-action="examine" data-id="' + v.open.id + '">Examiner</button></td>';
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-action="examine"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      const e = state.historique.find(h => h.id === id);
      guardSuspended(e && e.matricule, e && e.patientNom, "la feuille ne peut être ni examinée ni validée.", () => openSoinsForValidation(id), "feuille.ouvrir");
    });
  });
  renderPager("medecinQueuePager", "queue", info, renderMedecinQueue, "patients");
  refreshPendingBadge();
}

document.querySelectorAll("#queueScopeToggle .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    state.queueScope = chip.dataset.scope;
    resetPage("queue");
    renderMedecinQueue();
  });
});

/* ---------------------------------------------------------------------- */
/* Historique : filtres, pagination, aperçu, suppression                   */
/* ---------------------------------------------------------------------- */

const HIST_PAGE_SIZE = 8;

function getFilteredHistorique() {
  const f = state.historiqueFilters;
  return state.historique.filter(h => {
    if (f.type && h.type !== f.type) return false;
    if (f.statut && h.statut !== f.statut) return false;
    if (f.search) {
      const hay = ((h.patientNom || h.patient || "") + " " + (h.matricule || "") + " " + formatNag(h.matricule)).toLowerCase();
      if (!hay.includes(f.search.toLowerCase())) return false;
    }
    if (f.from || f.to) {
      const d = parseFRDate(h.date);
      if (!d) return false;
      if (f.from && d < new Date(f.from)) return false;
      if (f.to && d > new Date(f.to + "T23:59:59")) return false;
    }
    return true;
  });
}

function renderHistorique() {
  const all = getFilteredHistorique();
  const info = pageSlice("historique", all, HIST_PAGE_SIZE);
  const pageItems = info.items;

  const body = document.getElementById("historiqueBody");
  const empty = document.getElementById("historiqueEmpty");
  body.innerHTML = "";
  empty.hidden = pageItems.length > 0;

  pageItems.forEach(h => {
    const tr = document.createElement("tr");
    const pillClass = h.type === "Consultation" ? "consultation" : "examen";
    const statutClass = h.statut === "Validée" ? "validee" : "attente";
    tr.innerHTML =
      "<td>" + h.numero + "</td>" +
      "<td>" + h.date + "</td>" +
      "<td>" + (h.patientNom || h.patient || "") + "</td>" +
      "<td>" + formatNag(h.matricule) + "</td>" +
      '<td><span class="pill ' + pillClass + '">' + h.type + "</span></td>" +
      '<td><span class="pill ' + statutClass + '">' + (h.statut || "Validée") + "</span></td>" +
      "<td>" + h.totalMontant + "</td>" +
      '<td class="row-actions">' +
        '<button class="icon-btn" data-action="preview" data-id="' + h.id + '" title="Aperçu">' + iconEye() + "</button>" +
        '<button class="icon-btn danger" data-action="delete-hist" data-id="' + h.id + '" title="Supprimer">' + iconTrash() + "</button>" +
      "</td>";
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-action="preview"]').forEach(btn => {
    btn.addEventListener("click", () => previewEntry(parseInt(btn.dataset.id, 10)));
  });
  body.querySelectorAll('[data-action="delete-hist"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      askConfirm("Cette prise en charge sera définitivement supprimée de l'historique. Cette action est irréversible.", () => {
        state.historique = state.historique.filter(h => h.id !== id);
        persistFeuilles().then(() => {
          renderHistorique();
          renderDashboardStats();
          refreshPendingBadge();
        }).catch(err => {
          showInfoModal("Suppression impossible", "<p>" + escapeHtml(err.message) + "</p>");
          pullFeuilles(true).then(() => { renderHistorique(); renderDashboardStats(); refreshPendingBadge(); }).catch(() => {});
        });
      }, { title: "Supprimer cette prise en charge ?" });
    });
  });

  renderPager("historiquePagination", "historique", info, renderHistorique, "prises en charge");
}

["filterSearch", "filterType", "filterStatut", "filterFrom", "filterTo"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    state.historiqueFilters = {
      search: document.getElementById("filterSearch").value.trim(),
      type: document.getElementById("filterType").value,
      statut: document.getElementById("filterStatut").value,
      from: document.getElementById("filterFrom").value,
      to: document.getElementById("filterTo").value
    };
    state.historiquePage = 1;
    renderHistorique();
  });
});
document.getElementById("filterResetBtn").addEventListener("click", () => {
  document.getElementById("filterSearch").value = "";
  document.getElementById("filterType").value = "";
  document.getElementById("filterStatut").value = "";
  document.getElementById("filterFrom").value = "";
  document.getElementById("filterTo").value = "";
  state.historiqueFilters = { search: "", type: "", statut: "", from: "", to: "" };
  state.historiquePage = 1;
  renderHistorique();
});

function previewEntry(id) {
  const h = state.historique.find(e => e.id === id);
  if (!h) return;
  const pillClass = h.type === "Consultation" ? "consultation" : "examen";
  const statutClass = h.statut === "Validée" ? "validee" : "attente";
  const isExam = h.type === "Examen";
  const esc = escapeHtml;

  // Tableau principal : examens désignés (bon d'examen) ou prestations chiffrées
  // (feuilles de démonstration) — omis quand il n'y a rien à montrer.
  let tableHtml = "";
  if (isExam) {
    const rows = (h.examens || []).filter(r => r.designation || r.cotation);
    tableHtml = '<table class="data-table"><thead><tr><th>Désignation de l\'examen</th></tr></thead><tbody>' +
      (rows.length
        ? rows.map(r => "<tr><td>" + esc(r.designation || "") + "</td></tr>").join("")
        : '<tr><td style="text-align:center;color:var(--muted)">Aucun examen renseigné</td></tr>') +
      "</tbody></table>";
  } else {
    const rows = (h.prestations || []).filter(r => r.designation || r.montant);
    if (rows.length) {
      tableHtml = '<table class="data-table"><thead><tr><th>Désignation</th><th>Qté</th><th>Montant</th><th>TM</th><th>Part CNAMGS</th></tr></thead><tbody>' +
        rows.map(r =>
          "<tr><td>" + esc(r.designation || "") + "</td><td>" + esc(r.qte || "") + "</td><td>" + esc(r.montant || "") + "</td><td>" + esc(r.tm || "") + "</td><td>" + esc(r.part || "") + "</td></tr>"
        ).join("") + "</tbody></table>";
    }
  }

  // Ordonnance : exactement ce que le médecin a prescrit (médicament, quantité,
  // posologie / durée) et l'état de délivrance en pharmacie.
  let ordoHtml = "";
  if (!isExam) {
    const ord = h.ordonnance || [];
    ordoHtml = '<h4 class="preview-sub">Ordonnance</h4>' + (ord.length
      ? '<table class="data-table"><thead><tr><th>Désignation</th><th>Qté</th><th>Posologie / Durée</th><th>Délivrance</th></tr></thead><tbody>' +
        ord.map(r =>
          "<tr><td>" + esc(r.designation) + "</td><td>" + esc(r.quantite) + "</td><td>" + esc(r.posologie || "—") + "</td><td>" +
          esc(medDeliveryText(r)) + "</td></tr>"
        ).join("") + "</tbody></table>"
      : '<p class="hint" style="margin:0">Aucune ordonnance.</p>');
  }

  const extraGrid = isExam
    ? "<div><b>Date de la prestation</b><span>" + esc(h.examDate || "—") + "</span></div>" +
      "<div><b>Nature de la prestation</b><span>" + esc(h.examNature || "—") + "</span></div>" +
      "<div><b>Situation du patient</b><span>" + esc(h.examSituation || "—") + "</span></div>" +
      "<div><b>Établissement réalisant l'examen</b><span>" + esc(h.examEtablissement || "—") + "</span></div>" +
      "<div><b>Bilan / motif</b><span>" + esc(h.examMotif || "—") + "</span></div>"
    : "<div><b>Date de la prestation</b><span>" + esc(h.prestaDate || h.date || "—") + "</span></div>" +
      "<div><b>Code affection</b><span>" + esc(h.prestaCode || "—") + "</span></div>" +
      "<div><b>Visite à domicile</b><span>" + esc(h.prestaDomicile || "—") + "</span></div>";

  let linkHtml = "";
  if (isExam && h.linkedConsultationId) {
    const src = state.historique.find(e => e.id === h.linkedConsultationId);
    if (src) {
      linkHtml = '<div class="preview-link">Examen recommandé suite à la feuille <a href="#" data-preview-link="' + src.id + '">' + esc(src.numero) + "</a></div>";
    }
  } else if (!isExam && h.linkedExamenIds && h.linkedExamenIds.length) {
    const links = h.linkedExamenIds
      .map(examId => state.historique.find(e => e.id === examId))
      .filter(Boolean)
      .map(ex => '<a href="#" data-preview-link="' + ex.id + '">' + esc(ex.numero) + "</a>");
    if (links.length) linkHtml = '<div class="preview-link">Examen(s) recommandé(s) : ' + links.join(", ") + "</div>";
  }

  const hasTotals = [h.totalMontant, h.totalTm, h.totalPart].some(v => parseFloat(v) > 0);

  document.getElementById("previewBody").innerHTML =
    '<div class="preview-head"><img src="CNAMGS.png" alt="CNAMGS" /><div>' +
      '<span class="pill ' + pillClass + '">' + esc(h.type) + "</span> " +
      '<span class="pill ' + statutClass + '">' + esc(h.statut || "Validée") + "</span>" +
      '<div class="preview-num">' + esc(h.numero) + "</div>" +
    "</div></div>" +
    linkHtml +
    '<div class="preview-grid">' +
      "<div><b>Patient</b><span>" + esc(h.patientNom || h.patient || "—") + "</span></div>" +
      "<div><b>Matricule</b><span>" + esc(formatNag(h.matricule) || "—") + "</span></div>" +
      "<div><b>Date de réception</b><span>" + esc(h.date) + "</span></div>" +
      "<div><b>Fonds</b><span>" + esc(h.fonds || "—") + "</span></div>" +
      "<div><b>Ticket modérateur</b><span>" + esc(h.ticketModerateur || "—") + "</span></div>" +
      "<div><b>Médecin</b><span>" + esc(h.medecin || "—") + "</span></div>" +
      "<div><b>Quartier</b><span>" + esc(h.quartier || "—") + "</span></div>" +
      "<div><b>Téléphone</b><span>" + esc(h.telephone || "—") + "</span></div>" +
      "<div><b>Service</b><span>" + esc(h.service || "—") + "</span></div>" +
      "<div><b>Accident causé par un tiers</b><span>" + esc(h.accidentTiers || "—") + "</span></div>" +
      "<div><b>Soins liés à la grossesse</b><span>" + esc(h.grossesse || "—") + "</span></div>" +
      extraGrid +
      "<div><b>Signature du praticien</b><span>" + esc(h.signature || "—") + "</span></div>" +
    "</div>" +
    tableHtml +
    ordoHtml +
    (hasTotals
      ? '<div class="preview-totals">' +
          "<div>Total montant <b>" + esc(h.totalMontant) + "</b></div>" +
          "<div>Total TM <b>" + esc(h.totalTm) + "</b></div>" +
          "<div>Total CNAMGS <b>" + esc(h.totalPart) + "</b></div>" +
        "</div>"
      : "");

  document.getElementById("previewBody").querySelectorAll('[data-preview-link]').forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      previewEntry(parseInt(a.dataset.previewLink, 10));
    });
  });

  document.getElementById("previewModal").hidden = false;
}
document.getElementById("closePreviewModal").addEventListener("click", () => { document.getElementById("previewModal").hidden = true; });
document.getElementById("closePreviewBtn").addEventListener("click", () => { document.getElementById("previewModal").hidden = true; });

function iconEye() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
}
function iconToggle() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="8" width="20" height="8" rx="4"/><circle cx="16" cy="12" r="3"/></svg>';
}
function iconTrash() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>';
}
function iconEdit() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
}
function iconKey() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.9 12.1L19 4"/><path d="M15 9l3 3"/><path d="M18 6l3 3"/></svg>';
}
function iconProfils() {   // carte d'identité : « profils du compte »
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.7-2.2 3-2.2s2.5.7 3 2.2"/><path d="M15 10h3M15 13h3"/></svg>';
}
function iconStar() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
}

// Une pastille de profil : le MÊME composant dans la liste, la fiche de modification et la fenêtre « Profils ».
// Le profil principal est vert avec une étoile ; les autres sont gris.
function profilChipHtml(label, isMain) {
  return '<span class="profil-chip' + (isMain ? " is-main" : "") + '">' + escapeHtml(label) + (isMain ? '<i aria-hidden="true">★</i>' : "") + "</span>";
}
// Colonne « Profils » de la liste : le profil principal, puis « +N » pour les autres (l'infobulle les nomme). Les deux ouvrent la
// fenêtre « Profils ». Une seule pastille par ligne : la hauteur des lignes ne dépend plus du nombre de profils.
function profilChips(u) {
  const list = u.profils && u.profils.length ? u.profils : [{ api: u.apiRole, label: u.role }];
  const main = list.find(p => p.api === u.apiRole) || list[0];
  const others = list.filter(p => p !== main);
  let html = '<button type="button" class="profil-chip is-main" data-action="profils" data-id="' + u.id + '" title="' +
    attr(main.label + " (profil principal) — interfaces : " + profileInterfaces(main.api).join(", ")) + '">' + escapeHtml(main.label) + '<i aria-hidden="true">★</i></button>';
  if (others.length) {
    html += '<button type="button" class="profil-chip more" data-action="profils" data-id="' + u.id + '" title="' + attr("Autres profils : " + others.map(p => p.label).join(", ")) +
      '" aria-label="' + attr(others.length + (others.length > 1 ? " autres profils : " : " autre profil : ") + others.map(p => p.label).join(", ")) + '">+' + others.length + "</button>";
  }
  return '<div class="profil-chips">' + html + "</div>";
}

/* ---------------------------------------------------------------------- */
/* Gestion des utilisateurs                                               */
/* ---------------------------------------------------------------------- */

// « Gestion des utilisateurs » : les comptes viennent de la base (GET /api/utilisateurs, permission utilisateur.lire).
function renderUsers() {
  loadStructures().catch(() => { /* la liste déroulante des structures garde sa dernière valeur */ });
  const body = document.getElementById("usersBody");
  body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">Chargement…</td></tr>';
  apiListUtilisateurs().then(list => {
    state.apiUsers = list.map(mapBackendUser);
    renderUsersTable(state.apiUsers);
    renderUsersSourceBadge(true);
  }).catch(err => {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red)">' + escapeHtml(err.message) + "</td></tr>";
    document.getElementById("usersPager").innerHTML = "";
    renderUsersSourceBadge(false);
  });
}

function renderUsersSourceBadge(ok) {
  const el = document.getElementById("usersSourceBadge");
  if (!el) return;
  el.textContent = ok ? "Base de données CNAMGS" : "Serveur injoignable";
  el.className = "pill " + (ok ? "validee" : "attente");
}

function renderUsersTable(list) {
  const body = document.getElementById("usersBody");
  body.innerHTML = "";
  const isApi = true;
  const info = pageSlice("users", list, 10);
  info.items.forEach(u => {
    const tr = document.createElement("tr");
    const statutClass = u.statut === "Actif" ? "actif" : "inactif";
    const full = (u.prenom + " " + u.nom).trim();
    tr.innerHTML =
      '<td class="u-name"><div class="u-clamp" title="' + attr(full) + '">' + escapeHtml(full) + "</div></td>" +
      '<td class="u-mail" title="' + attr(u.email) + '">' + escapeHtml(u.email) + "</td>" +
      "<td>" + profilChips(u) + "</td>" +
      '<td class="u-struct"><div class="u-clamp" title="' + attr(u.structure || "") + '">' + escapeHtml(u.structure || "—") + "</div></td>" +
      '<td class="u-date">' + (u.dateCreation || "—") + "</td>" +
      '<td class="u-statut"><span class="pill ' + statutClass + '">' + u.statut + "</span>" +
        (u.doitChangerMdp ? '<span class="tag-mdp" title="Mot de passe temporaire : le titulaire doit en choisir un à sa prochaine connexion">' + iconKey() + '<span class="sr-only">Mot de passe à changer</span></span>' : "") + "</td>" +
      '<td class="row-actions">' +
        (isApi ? '<button class="icon-btn" data-action="edit" data-id="' + u.id + '" title="Modifier" aria-label="Modifier">' + iconEdit() + "</button>" : "") +
        (isApi ? '<button class="icon-btn" data-action="profils" data-id="' + u.id + '" title="Profils du compte" aria-label="Profils du compte">' + iconProfils() + "</button>" : "") +
        (isApi ? '<button class="icon-btn" data-action="reset-pass" data-id="' + u.id + '" title="Réinitialiser le mot de passe" aria-label="Réinitialiser le mot de passe">' + iconKey() + "</button>" : "") +
        '<button class="icon-btn" data-action="toggle" data-id="' + u.id + '" title="Activer / désactiver" aria-label="Activer ou désactiver">' + iconToggle() + "</button>" +
        '<button class="icon-btn danger" data-action="delete" data-id="' + u.id + '" title="Supprimer" aria-label="Supprimer">' + iconTrash() + "</button>" +
      "</td>";
    body.appendChild(tr);
  });

  renderPager("usersPager", "users", info, () => renderUsersTable(list), "utilisateurs");
  body.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      apiGetUtilisateur(id).then(u => openUserModalForEdit(u))
        .catch(err => showInfoModal("Erreur", "<p>" + escapeHtml(err.message) + "</p>"));
    });
  });
  body.querySelectorAll('[data-action="profils"]').forEach(btn => {
    btn.addEventListener("click", () => openProfilsModal(parseInt(btn.dataset.id, 10)));
  });
  body.querySelectorAll('[data-action="reset-pass"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      const u = state.apiUsers.find(x => x.id === id);
      openResetPasswordModal(id, u ? (u.prenom + " " + u.nom) : ("#" + id));
    });
  });
  body.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      const u = state.apiUsers.find(x => x.id === id);
      apiSetUtilisateurActif(id, u.statut !== "Actif").then(() => {
        audit(u.statut !== "Actif" ? "utilisateur.activer" : "utilisateur.desactiver", { ressourceType: "Utilisateur", ressourceId: id, ressourceLibelle: fullName(u), avant: { statut: u.statut } });
        renderUsers();
      }).catch(err => showInfoModal("Erreur", "<p>" + escapeHtml(err.message) + "</p>"));
    });
  });
  body.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      const u = state.apiUsers.find(x => x.id === id);
      askConfirm("Le compte de " + (u ? u.prenom + " " + u.nom : "cet utilisateur") + " sera définitivement supprimé et perdra tout accès à la plateforme.", () => {
        apiDeleteUtilisateur(id).then(() => {
          audit("utilisateur.supprimer", { ressourceType: "Utilisateur", ressourceId: id, ressourceLibelle: u ? fullName(u) : "#" + id });
          renderUsers();
        }).catch(err => showInfoModal("Erreur", "<p>" + escapeHtml(err.message) + "</p>"));
      }, { title: "Supprimer cet utilisateur ?" });
    });
  });
}

/* ---- Page « Structures » : hôpitaux, pharmacies, administration — GET / POST / PUT / DELETE /api/structures ----
   Sa propre interface (menu Administration › Structures) ; la page « Gestion des utilisateurs » n'en porte plus.     */

const STRUCTURE_TYPE_LABEL = { hopital: "Hôpital", pharmacie: "Pharmacie", administration: "Administration" };
const STRUCTURE_TYPE_PILL = { hopital: "examen", pharmacie: "consultation", administration: "attente" };
const structureModal = document.getElementById("structureModal");
let editingStructureId = null;
state.structFilters = { search: "", type: "" };

// Recharge la liste depuis la base : elle alimente aussi la liste déroulante des comptes et les filtres des rapports.
async function loadStructures() {
  state.structures = (await apiListStructures()) || [];
  return state.structures;
}
// Après tout changement : les écrans qui listent des structures se remettent à jour.
function afterStructuresChange() {
  populateMedecinSelect();
  populatePharmaFilterOptions();
  populateHospFilterOptions();
}
function canManageStructures() { return !state.permissions || state.permissions.has("structure.gerer"); }

const STRUCT_PAGE_SIZE = 10;
let structFocusId = null;   // structure à mettre en évidence : celle qu'on vient d'ajouter ou de modifier

// Liste filtrée (type + recherche), groupée par type puis par ordre alphabétique.
function structuresFiltered() {
  const f = state.structFilters, q = f.search.trim().toLowerCase();
  const rank = { hopital: 0, pharmacie: 1, administration: 2 };
  return (state.structures || [])
    .filter(s => (!f.type || s.type_structure === f.type) && (!q || (s.raison_sociale + " " + (s.addresse || "")).toLowerCase().indexOf(q) >= 0))
    .sort((a, b) => ((rank[a.type_structure] ?? 9) - (rank[b.type_structure] ?? 9)) || a.raison_sociale.localeCompare(b.raison_sociale, "fr", { sensitivity: "base" }));
}
// Amène la structure à l'écran : les filtres qui la cacheraient sont levés, la page qui la contient s'ouvre.
function revealStructure(id) {
  structFocusId = id;
  let list = structuresFiltered();
  if (!list.some(s => s.id_structure === id)) {
    state.structFilters.search = "";
    state.structFilters.type = "";
    document.getElementById("structSearch").value = "";
    document.querySelectorAll("#structTypeToggle .chip").forEach(c => c.classList.toggle("active", c.dataset.type === ""));
    list = structuresFiltered();
  }
  const idx = list.findIndex(s => s.id_structure === id);
  PAGER_STATE.structures = Math.floor(Math.max(idx, 0) / STRUCT_PAGE_SIZE) + 1;
}

function renderStructuresPage(focusId) {
  const body = document.getElementById("structuresBody");
  body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Chargement…</td></tr>';
  document.getElementById("addStructureBtn").hidden = !canManageStructures();
  Promise.all([
    loadStructures(),
    apiListUtilisateurs().then(list => { state.apiUsers = list.map(mapBackendUser); }).catch(() => { /* comptes illisibles : la colonne « Comptes » affichera « — » */ })
  ]).then(() => {
    if (focusId != null) revealStructure(focusId);
    paintStructures();
  }).catch(err => {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red)">' + escapeHtml(err.message) + "</td></tr>";
    document.getElementById("structuresPager").innerHTML = "";
  });
}

function paintStructures() {
  const all = state.structures || [];
  const f = state.structFilters;
  const count = t => all.filter(s => s.type_structure === t).length;
  document.getElementById("structStatHopital").textContent = count("hopital");
  document.getElementById("structStatPharmacie").textContent = count("pharmacie");
  document.getElementById("structStatAdmin").textContent = count("administration");

  const list = structuresFiltered();
  document.getElementById("structuresCount").textContent = list.length === all.length ? String(all.length) : list.length + " / " + all.length;

  const counts = {};
  const known = !!state.apiUsers;
  (state.apiUsers || []).forEach(u => { counts[u.idStructure] = (counts[u.idStructure] || 0) + 1; });
  const manage = canManageStructures();
  const body = document.getElementById("structuresBody");
  const info = pageSlice("structures", list, STRUCT_PAGE_SIZE);
  body.innerHTML = "";
  info.items.forEach(st => {
    const n = counts[st.id_structure] || 0;
    const tr = document.createElement("tr");
    tr.dataset.id = st.id_structure;
    if (st.id_structure === structFocusId) tr.classList.add("flash");
    tr.innerHTML =
      '<td><b class="st-name">' + escapeHtml(st.raison_sociale) + "</b></td>" +
      '<td><span class="pill ' + (STRUCTURE_TYPE_PILL[st.type_structure] || "attente") + '">' + escapeHtml(STRUCTURE_TYPE_LABEL[st.type_structure] || st.type_structure) + "</span></td>" +
      '<td class="st-addr"><div class="u-clamp" title="' + attr(st.addresse || "") + '">' + escapeHtml(st.addresse || "—") + "</div></td>" +
      '<td class="num">' + (known ? n : "—") + "</td>" +
      '<td class="row-actions">' + (manage
        ? '<button class="icon-btn" data-action="edit-structure" data-id="' + st.id_structure + '" title="Modifier" aria-label="Modifier ' + attr(st.raison_sociale) + '">' + iconEdit() + "</button>" +
          '<button class="icon-btn danger" data-action="delete-structure" data-id="' + st.id_structure + '"' +
            (n > 0 ? ' disabled title="' + attr(n + " compte" + (n > 1 ? "s" : "") + " rattaché" + (n > 1 ? "s" : "") + " : déplacez-les ou désactivez-les d'abord") + '"' : ' title="Supprimer"') +
            ' aria-label="Supprimer ' + attr(st.raison_sociale) + '">' + iconTrash() + "</button>"
        : "") + "</td>";
    body.appendChild(tr);
  });
  if (!info.items.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">' +
      (all.length ? "Aucune structure ne correspond à ces critères." : "Aucune structure : ajoutez un hôpital ou une pharmacie.") + "</td></tr>";
  }
  renderPager("structuresPager", "structures", info, paintStructures, "structures");
  const flash = body.querySelector("tr.flash");
  if (flash) flash.scrollIntoView({ block: "nearest" });
  structFocusId = null;
  body.querySelectorAll('[data-action="edit-structure"]').forEach(btn => btn.addEventListener("click", () => {
    const st = state.structures.find(x => x.id_structure === parseInt(btn.dataset.id, 10));
    if (st) openStructureModal(st);
  }));
  body.querySelectorAll('[data-action="delete-structure"]').forEach(btn => btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const id = parseInt(btn.dataset.id, 10);
    const st = state.structures.find(x => x.id_structure === id);
    askConfirm("La structure « " + (st ? st.raison_sociale : "#" + id) + " » sera définitivement supprimée (impossible si des données y sont rattachées).", () => {
      apiDeleteStructure(id).then(() => {
        renderStructuresPage();
        afterStructuresChange();
        toast({ kind: "success", title: "Structure supprimée", text: st ? st.raison_sociale : "", ms: 3200 });
      }).catch(err => showInfoModal("Suppression impossible", "<p>" + escapeHtml(err.message) + "</p>"));
    }, { title: "Supprimer cette structure ?" });
  }));
}

document.getElementById("structSearch").addEventListener("input", e => { state.structFilters.search = e.target.value; resetPage("structures"); paintStructures(); });
document.getElementById("structTypeToggle").addEventListener("click", e => {
  const b = e.target.closest(".chip");
  if (!b) return;
  state.structFilters.type = b.dataset.type;
  document.querySelectorAll("#structTypeToggle .chip").forEach(c => c.classList.toggle("active", c === b));
  resetPage("structures");
  paintStructures();
});

function openStructureModal(st) {
  editingStructureId = st ? st.id_structure : null;
  document.getElementById("structureModalTitle").textContent = st ? "Modifier la structure" : "Ajouter une structure";
  document.getElementById("s-nom").value = st ? st.raison_sociale : "";
  const type = st ? st.type_structure : (state.structFilters.type || "hopital");   // le filtre actif présélectionne le type
  (document.querySelector('input[name="s-type"][value="' + type + '"]') || document.querySelector('input[name="s-type"][value="hopital"]')).checked = true;
  document.getElementById("s-adresse").value = st ? (st.addresse || "") : "";
  structureModal.hidden = false;
  window.setTimeout(() => document.getElementById("s-nom").focus(), 60);
}
function closeStructureModal() { structureModal.hidden = true; editingStructureId = null; }
document.getElementById("addStructureBtn").addEventListener("click", () => openStructureModal(null));
document.getElementById("closeStructureModal").addEventListener("click", closeStructureModal);
document.getElementById("cancelStructureModal").addEventListener("click", closeStructureModal);
document.getElementById("structureForm").addEventListener("submit", e => {
  e.preventDefault();
  const checked = document.querySelector('input[name="s-type"]:checked');
  const payload = {
    raison_sociale: document.getElementById("s-nom").value.trim(),
    type_structure: checked ? checked.value : "hopital",
    addresse: document.getElementById("s-adresse").value.trim()
  };
  const creating = editingStructureId == null;
  const call = creating ? apiCreateStructure(payload) : apiUpdateStructure(editingStructureId, payload);
  call.then(res => {
    const id = creating ? (res && res.id_structure) : editingStructureId;
    closeStructureModal();
    renderStructuresPage(id);
    afterStructuresChange();
    toast({ kind: "success", title: creating ? "Structure ajoutée" : "Structure modifiée", text: payload.raison_sociale + " — " + STRUCTURE_TYPE_LABEL[payload.type_structure], ms: 3600 });
  }).catch(err => showInfoModal("Erreur", "<p>" + escapeHtml(err.message) + "</p>"));
});

const userModal = document.getElementById("userModal");
let editingUserId = null; // id_utilisateur en cours de modification (mode édition), null = création
let editingUserRole = "";  // rôle du compte avant modification (pour tracer un changement de rôle)

function setUserModalMode(editing) {
  document.getElementById("userModalTitle").textContent = editing ? "Modifier l'utilisateur" : "Ajouter un utilisateur";
  document.getElementById("u-pass-wrap").hidden = editing;
  document.getElementById("u-pass-hint").hidden = !editing;
  // Le nom d'utilisateur d'un compte existant ne change pas ; la structure, le rôle, le code et
  // le type de praticien se modifient (PUT /api/utilisateurs/{id}).
  document.getElementById("u-structure").disabled = false;
  document.getElementById("u-username").disabled = editing;
  document.getElementById("u-username-hint").hidden = !editing;
  // Profils : à la création, des cases pour les profils supplémentaires ; en modification, la fiche des profils du compte
  // (le principal ne se change plus ici : tout passe par la fenêtre « Profils », où les changements sont enregistrés tout de suite).
  document.getElementById("u-extra-wrap").hidden = editing;
  document.getElementById("u-profils-edit").hidden = !editing;
  document.getElementById("u-role").disabled = editing;
  document.getElementById("u-pass-temp-hint").hidden = editing;
}

function renderEditProfilChips(apiRoles, principalApi) {
  document.getElementById("u-profils-edit-chips").innerHTML = apiRoles.map(r => profilChipHtml(API_ROLE_TO_FRONT_ROLE[r] || r, r === principalApi)).join("");
}
// La fenêtre « Profils » vient de recharger le compte : la fiche de modification (si elle est ouverte sur ce compte) suit.
function syncEditFromProfils() {
  if (userModal.hidden || editingUserId == null || !profilsUser || profilsUser.id !== editingUserId) return;
  editingUserProfils = profilsUser.profils.map(p => p.api);
  document.getElementById("u-role").value = profilsUser.role;
  renderEditProfilChips(editingUserProfils, profilsUser.apiRole);
  syncPraticienFields();
}

let editingUserProfils = [];   // profils (rôles API) du compte en cours de modification

// Le code et le type de praticien n'existent que pour un médecin (ils figurent sur la feuille de soins) :
// profil principal « Médecin », ou profil « Médecin » supplémentaire.
function wantsPraticienFields() {
  if (document.getElementById("u-role").value === "Médecin") return true;
  if (editingUserId != null) return editingUserProfils.indexOf("medecin") >= 0;
  return !!document.querySelector('#u-extra-profils input[value="medecin"]:checked');
}
function syncPraticienFields() {
  const medecin = wantsPraticienFields();
  document.getElementById("u-code-field").hidden = !medecin;
  document.getElementById("u-type-field").hidden = !medecin;
}

// Cases des profils supplémentaires (création) : le profil principal choisi n'y figure pas.
function renderExtraProfilChecks() {
  const box = document.getElementById("u-extra-profils");
  const principal = FRONT_ROLE_TO_API_ROLE[document.getElementById("u-role").value];
  const checked = new Set(Array.from(box.querySelectorAll("input:checked")).map(i => i.value));
  box.innerHTML = ALL_API_ROLES.map(r =>
    "<label" + (r === principal ? " hidden" : "") + '><input type="checkbox" value="' + r + '"' + (checked.has(r) && r !== principal ? " checked" : "") + " /> " + escapeHtml(API_ROLE_TO_FRONT_ROLE[r]) + "</label>").join("");
}
document.getElementById("u-role").addEventListener("change", () => { renderExtraProfilChecks(); syncPraticienFields(); });
document.getElementById("u-extra-profils").addEventListener("change", syncPraticienFields);

function fillUserStructureSelect() {
  const sel = document.getElementById("u-structure");
  sel.innerHTML = '<option value="">— Choisir une structure —</option>' + (state.structures || []).map(st =>
    '<option value="' + st.id_structure + '">' + escapeHtml(st.raison_sociale) + " (" + escapeHtml(STRUCTURE_TYPE_LABEL[st.type_structure] || st.type_structure) + ")</option>").join("");
}
document.getElementById("addUserBtn").addEventListener("click", () => {
  fillUserStructureSelect();
  editingUserId = null;
  editingUserProfils = [];
  document.getElementById("userForm").reset();
  document.getElementById("u-id").value = "";
  document.getElementById("u-date-creation").value = todayFR();
  renderExtraProfilChecks();
  setUserModalMode(false);
  syncPraticienFields();
  userModal.hidden = false;
});

// GET /api/utilisateurs/{id} a déjà chargé l'utilisateur (voir data-action="edit"
// dans renderUsersTable) ; on ne fait ici que préremplir le formulaire.
function openUserModalForEdit(u) {
  editingUserId = u.id_utilisateur;
  editingUserProfils = Array.isArray(u.profils) ? u.profils.slice() : [u.role];
  document.getElementById("u-id").value = u.id_utilisateur;
  document.getElementById("u-nom").value = ((u.prenom || "") + " " + (u.nom || "")).trim();
  document.getElementById("u-email").value = u.email || "";
  document.getElementById("u-username").value = u.username || "";
  document.getElementById("u-role").value = API_ROLE_TO_FRONT_ROLE[u.role] || u.role;
  editingUserRole = API_ROLE_TO_FRONT_ROLE[u.role] || u.role;
  renderEditProfilChips(editingUserProfils, u.role);
  fillUserStructureSelect();
  document.getElementById("u-structure").value = u.id_structure != null ? String(u.id_structure) : "";
  document.getElementById("u-pass").value = "";
  document.getElementById("u-date-creation").value = apiFormatDate(u.date_creation);
  document.getElementById("u-code").value = u.code_praticien || "";
  document.getElementById("u-type").value = u.type_praticien || "Généraliste";
  setUserModalMode(true);
  syncPraticienFields();
  userModal.hidden = false;
}

function closeUserModal() {
  userModal.hidden = true;
  editingUserId = null;
}
document.getElementById("closeUserModal").addEventListener("click", closeUserModal);
document.getElementById("cancelUserModal").addEventListener("click", closeUserModal);
document.getElementById("u-profils-manage").addEventListener("click", () => { if (editingUserId != null) openProfilsModal(editingUserId); });
document.getElementById("u-goto-structures").addEventListener("click", () => { closeUserModal(); goToView("structures"); });

document.getElementById("userForm").addEventListener("submit", e => {
  e.preventDefault();
  const nomComplet = document.getElementById("u-nom").value.trim();
  const parts = nomComplet.split(" ");
  const prenom = parts.length > 1 ? parts.shift() : "";
  const nom = parts.join(" ") || nomComplet;
  const isMedecin = wantsPraticienFields();
  const codePraticien = isMedecin ? document.getElementById("u-code").value.trim() : "";
  const typePraticien = isMedecin ? document.getElementById("u-type").value : "";
  const email = document.getElementById("u-email").value.trim();
  const username = document.getElementById("u-username").value.trim().toLowerCase() || (email.split("@")[0] || "").toLowerCase();
  const role = document.getElementById("u-role").value;

  if (editingUserId != null) {
    // PUT /api/utilisateurs/{id} — pas de champ mot de passe ici (le backend
    // ne le modifie pas sur cette route) ; voir "Réinitialiser le mot de passe".
    apiUpdateUtilisateur(editingUserId, {
      prenom: prenom,
      nom: nom,
      email: email,
      role: FRONT_ROLE_TO_API_ROLE[role] || role,
      id_structure: parseInt(document.getElementById("u-structure").value, 10) || undefined,
      code_praticien: codePraticien,
      type_praticien: typePraticien
    }).then(() => {
      audit("utilisateur.modifier", { ressourceType: "Utilisateur", ressourceId: editingUserId, ressourceLibelle: nomComplet, avant: { role: editingUserRole }, apres: { role: role, roleModifie: role !== editingUserRole } });
      closeUserModal();
      renderUsers();
    }).catch(err => showInfoModal("Erreur", "<p>" + escapeHtml(err.message) + "</p>"));
    return;
  }

  // POST /api/auth/register : le compte est créé dans la base, rattaché à la structure choisie.
  const idStructure = parseInt(document.getElementById("u-structure").value, 10);
  if (!idStructure) { showInfoModal("Structure obligatoire", "<p>Choisissez la structure de rattachement du compte.</p>"); return; }
  apiRegister({
    username: username,
    mot_de_passe: document.getElementById("u-pass").value,
    prenom: prenom,
    nom: nom,
    email: email,
    code_praticien: codePraticien,
    type_praticien: typePraticien,
    telephone: "",
    role: FRONT_ROLE_TO_API_ROLE[role] || role,
    profils: Array.from(document.querySelectorAll("#u-extra-profils input:checked")).map(i => i.value),   // profils supplémentaires
    id_structure: idStructure
  }).then(() => {
    audit("utilisateur.creer", { ressourceType: "Utilisateur", ressourceLibelle: nomComplet, apres: { role: role, username: username } });
    document.getElementById("userForm").reset();
    userModal.hidden = true;
    renderUsers();
    showInfoModal("Compte créé", "<p>Le compte de <b>" + escapeHtml(nomComplet) + "</b> (identifiant <b>" + escapeHtml(username) + "</b>) est enregistré.</p>" +
      "<p>Le mot de passe saisi est <b>temporaire</b> : à sa première connexion, le titulaire devra en choisir un nouveau avant d'accéder à l'application.</p>");
  }).catch(err => showInfoModal("Erreur", "<p>" + escapeHtml(err.message) + "</p>"));
});

/* ---- Réinitialisation du mot de passe (admin) : POST /api/auth/reset-password ---- */
const resetPasswordModal = document.getElementById("resetPasswordModal");
let resetPasswordTargetId = null;
function openResetPasswordModal(id, label) {
  resetPasswordTargetId = id;
  document.getElementById("resetPasswordTarget").textContent = "Utilisateur : " + label;
  document.getElementById("resetPasswordForm").reset();
  resetPasswordModal.hidden = false;
}
function closeResetPasswordModal() {
  resetPasswordModal.hidden = true;
  resetPasswordTargetId = null;
}
document.getElementById("closeResetPasswordModal").addEventListener("click", closeResetPasswordModal);
document.getElementById("cancelResetPasswordModal").addEventListener("click", closeResetPasswordModal);
document.getElementById("resetPasswordForm").addEventListener("submit", e => {
  e.preventDefault();
  const nouveau = document.getElementById("rp-nouveau").value;
  if (resetPasswordTargetId == null) { closeResetPasswordModal(); return; }
  apiResetPassword(resetPasswordTargetId, nouveau).then(() => {
    audit("utilisateur.mdp.reinitialiser", { ressourceType: "Utilisateur", ressourceId: resetPasswordTargetId });
    closeResetPasswordModal();
    renderUsers();
    showInfoModal("Mot de passe réinitialisé", "<p>Le nouveau mot de passe a été enregistré. Il est <b>temporaire</b> : l'utilisateur devra en choisir un nouveau à sa prochaine connexion. Ses sessions ouvertes sont fermées.</p>");
  }).catch(err => showInfoModal("Erreur", "<p>" + escapeHtml(err.message) + "</p>"));
});

/* ---- Profils d'un utilisateur : ajouter / retirer / définir le principal (Gestion des utilisateurs) ----
   POST   /api/utilisateurs/{id}/profils            { profil }
   DELETE /api/utilisateurs/{id}/profils/{profil}
   PUT    /api/utilisateurs/{id}/profils/principal  { profil }                                          */
const profilsModal = document.getElementById("profilsModal");
let profilsTargetId = null;
let profilsUser = null;
let profilsStatusTimer = null;

function profilsError(msg) {
  const el = document.getElementById("profilsError");
  el.textContent = msg || "";
  el.hidden = !msg;
}
// Confirmation des changements (ils s'appliquent tout de suite) ; elle s'efface seule.
function profilsStatus(msg) {
  const el = document.getElementById("profilsStatus");
  el.textContent = msg || "";
  window.clearTimeout(profilsStatusTimer);
  if (msg) profilsStatusTimer = window.setTimeout(() => { el.textContent = ""; }, 5000);
}
function openProfilsModal(id) {
  profilsTargetId = id;
  profilsUser = null;
  profilsError("");
  profilsStatus("");
  document.getElementById("profilsTitle").textContent = "Profils";
  document.getElementById("profilsTarget").textContent = "Chargement…";
  document.getElementById("profilsList").innerHTML = "";
  profilsModal.hidden = false;
  reloadProfilsModal();
}
function closeProfilsModal() { profilsModal.hidden = true; profilsTargetId = null; profilsUser = null; profilsStatus(""); }
function reloadProfilsModal() {
  return apiGetUtilisateur(profilsTargetId).then(raw => {
    profilsUser = mapBackendUser(raw);
    renderProfilsModal();
    syncEditFromProfils();
  }).catch(err => profilsError(err.message));
}
function renderProfilsModal() {
  const u = profilsUser;
  if (!u) return;
  const full = (u.prenom + " " + u.nom).trim() || u.username;
  document.getElementById("profilsTitle").textContent = "Profils de " + full;
  document.getElementById("profilsTarget").innerHTML = "Identifiant : <b>" + escapeHtml(u.username) + "</b>" + (u.structure ? " · " + escapeHtml(u.structure) : "");
  const held = u.profils.map(p => p.api);
  document.getElementById("profilsList").innerHTML = u.profils.map(p => {
    const main = p.api === u.apiRole;
    return '<div class="profil-card' + (main ? " is-main" : "") + '">' +
      '<div class="profil-card-head">' + profilChipHtml(p.label, main) +
        '<span class="profil-card-kind">' + (main ? "Profil principal : ouvert par défaut à la connexion" : "Profil supplémentaire") + "</span>" +
        '<div class="profil-card-actions">' +
          (main ? "" : '<button type="button" class="icon-btn" data-pact="principal" data-p="' + p.api + '" title="Définir comme profil principal" aria-label="Définir « ' + attr(p.label) + ' » comme profil principal">' + iconStar() + "</button>") +
          '<button type="button" class="icon-btn danger" data-pact="retirer" data-p="' + p.api + '"' +
            (held.length <= 1 ? ' disabled title="Un compte garde au moins un profil"' : ' title="Retirer ce profil"') + ' aria-label="Retirer le profil « ' + attr(p.label) + ' »">' + iconTrash() + "</button>" +
        "</div></div>" +
      '<p class="profil-ifaces"><span>Interfaces :</span> ' + profileInterfaces(p.api).map(escapeHtml).join(" · ") + "</p></div>";
  }).join("");
  const options = ALL_API_ROLES.filter(r => held.indexOf(r) < 0);
  const sel = document.getElementById("profilsAddSelect");
  sel.innerHTML = options.map(r => '<option value="' + r + '">' + escapeHtml(API_ROLE_TO_FRONT_ROLE[r]) + "</option>").join("");
  sel.disabled = !options.length;
  document.getElementById("profilsAddBtn").disabled = !options.length;
  updateProfilsPreview();
}
function updateProfilsPreview() {
  const box = document.getElementById("profilsAddPreview");
  const v = document.getElementById("profilsAddSelect").value;
  if (!v || !profilsUser) { box.textContent = "Ce compte porte déjà tous les profils."; return; }
  const held = profilsUser.profils.map(p => p.api);
  let html = "Interfaces ouvertes par ce profil : <b>" + profileInterfaces(v).map(escapeHtml).join(", ") + "</b>.";
  if ((v === "medecin" && held.indexOf("pharmacien") >= 0) || (v === "pharmacien" && held.indexOf("medecin") >= 0)) {
    html += ' <span class="warn">Attention : ce compte pourrait prescrire ET servir une ordonnance ; ce cumul est signalé au journal (risque de fraude).</span>';
  }
  if (v === "administrateur") html += ' <span class="warn">Le profil administrateur donne tous les droits : à réserver aux responsables.</span>';
  box.innerHTML = html;
}
// Après un ajout / retrait : la liste derrière la fenêtre est rechargée ; si c'est MON compte, mes profils aussi.
function afterProfilChange(message) {
  if (message) profilsStatus(message);
  renderUsers();
  reloadProfilsModal();
  if (state.currentUser && profilsTargetId === state.currentUser.id) {
    apiMe().then(m => {
      const fresh = mapBackendUser(m.user);
      state.currentUser.profils = fresh.profils;
      state.currentUser.profilPrincipal = fresh.profilPrincipal;
      renderProfileSwitcher();
    }).catch(() => { /* un retrait ferme les sessions du compte : le 401 ramène à la connexion */ });
  }
}
document.getElementById("profilsAddSelect").addEventListener("change", updateProfilsPreview);
document.getElementById("profilsAddBtn").addEventListener("click", () => {
  const v = document.getElementById("profilsAddSelect").value;
  if (!v || profilsTargetId == null) return;
  profilsError("");
  apiAddProfil(profilsTargetId, v).then(() => afterProfilChange("Profil « " + (API_ROLE_TO_FRONT_ROLE[v] || v) + " » ajouté.")).catch(err => profilsError(err.message));
});
document.getElementById("profilsList").addEventListener("click", e => {
  const b = e.target.closest("[data-pact]");
  if (!b || !profilsUser || b.disabled) return;
  const p = b.dataset.p, label = API_ROLE_TO_FRONT_ROLE[p] || p, id = profilsTargetId;
  profilsError("");
  if (b.dataset.pact === "principal") {
    apiSetProfilPrincipal(id, p).then(() => afterProfilChange("« " + label + " » est maintenant le profil principal.")).catch(err => profilsError(err.message));
    return;
  }
  const isMe = !!state.currentUser && id === state.currentUser.id;
  askConfirm("Retirer le profil « " + label + " » à " + ((profilsUser.prenom + " " + profilsUser.nom).trim() || profilsUser.username) + " ? Ses sessions ouvertes seront fermées : " +
    (isMe ? "vous devrez vous reconnecter." : "il devra se reconnecter."), () => {
    apiRemoveProfil(id, p).then(() => {
      if (isMe) { closeProfilsModal(); performLogout({ expired: true }); return; }
      afterProfilChange("Profil « " + label + " » retiré ; ses sessions ouvertes sont fermées.");
    }).catch(err => profilsError(err.message));
  }, { title: "Retirer ce profil ?", confirmLabel: "Retirer" });
});
document.getElementById("closeProfilsModal").addEventListener("click", closeProfilsModal);
document.getElementById("doneProfilsModal").addEventListener("click", closeProfilsModal);

/* ---------------------------------------------------------------------- */
/* Pagination générique : une page mémorisée par liste (clé), pager masqué   */
/* quand la liste tient sur une page.                                       */
/* ---------------------------------------------------------------------- */

const PAGER_STATE = {};
function pageSlice(key, list, size) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  let p = PAGER_STATE[key] || 1;
  if (p > pages) p = pages;
  if (p < 1) p = 1;
  PAGER_STATE[key] = p;
  return {
    page: p, pages: pages, size: size, total: list.length,
    from: list.length ? (p - 1) * size + 1 : 0,
    to: Math.min(list.length, p * size),
    items: list.slice((p - 1) * size, p * size)
  };
}
function resetPage(key) { PAGER_STATE[key] = 1; }
// Les remises à 1 déjà présentes (state.historiquePage = 1) continuent de fonctionner : c'est le même compteur.
Object.defineProperty(state, "historiquePage", { get() { return PAGER_STATE.historique || 1; }, set(v) { PAGER_STATE.historique = v; }, enumerable: true, configurable: true });

// Numéros de page : première, dernière, page courante et ses voisines, « … » entre les trous.
function pagerNumbers(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); }
  const list = Array.from(set).filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  list.forEach((n, i) => { if (i && n - list[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}
function renderPager(hostId, key, info, rerender, unit) {
  const host = typeof hostId === "string" ? document.getElementById(hostId) : hostId;
  if (!host) return;
  if (info.pages <= 1) { host.innerHTML = ""; return; }
  const noun = unit || "résultats";
  host.innerHTML =
    '<div class="pager" role="navigation" aria-label="Pagination">' +
      '<div class="pg-info">Affichage de <b>' + info.from + "–" + info.to + "</b> sur <b>" + info.total + "</b> " + noun + "</div>" +
      '<div class="pg-btns">' +
        '<button type="button" class="pg-btn pg-nav" data-p="' + (info.page - 1) + '" aria-label="Page précédente"' + (info.page <= 1 ? " disabled" : "") + ">‹</button>" +
        pagerNumbers(info.page, info.pages).map(n => n === "…"
          ? '<span class="pg-gap">…</span>'
          : '<button type="button" class="pg-btn' + (n === info.page ? " active" : "") + '" data-p="' + n + '"' + (n === info.page ? ' aria-current="page"' : "") + ">" + n + "</button>").join("") +
        '<button type="button" class="pg-btn pg-nav" data-p="' + (info.page + 1) + '" aria-label="Page suivante"' + (info.page >= info.pages ? " disabled" : "") + ">›</button>" +
      "</div>" +
    "</div>";
  host.querySelectorAll(".pg-btn").forEach(b => b.addEventListener("click", () => {
    const p = parseInt(b.dataset.p, 10);
    if (!p || p === info.page) return;
    PAGER_STATE[key] = p;
    rerender();
    // La liste change sous les yeux : on remonte en haut de sa carte si celle-ci a défilé hors de l'écran.
    const card = host.closest(".card") || host.parentElement;
    if (card && card.getBoundingClientRect().top < 70) card.scrollIntoView({ block: "start" });
  }));
}

/* ---------------------------------------------------------------------- */
/* Journal d'audit : qui a fait quoi, quand, d'où — et ce qui sort de       */
/* l'ordinaire. Local pour l'instant (pec_audit) ; les champs sont ceux qu'un */
/* back-end devra porter (voir README §14).                                  */
/* ---------------------------------------------------------------------- */

/* ---------------------------------------------------------------------- */
/* Journalisation : tout est dans la base. Le serveur trace lui-même ce qui  */
/* passe par l'API (connexions, échecs, modifications…) avec l'adresse IP,    */
/* calcule le score de risque, chaîne les empreintes et notifie l'admin.      */
/* Ici, l'interface n'envoie que ses propres actions (pages ouvertes,         */
/* recherches, exports…) et affiche ce que le serveur lui renvoie.            */
/* ---------------------------------------------------------------------- */

const AUDIT_ACTIONS = {
  "auth.deconnexion": ["AUTH", "Déconnexion"],
  "vue.ouvrir": ["NAVIGATION", "Ouverture d'une page"],
  "ui.refuse": ["SECURITE", "Accès refusé"],
  "patient.rechercher": ["ASSURE", "Recherche d'un assuré"],
  "dossier.ouvrir": ["ASSURE", "Ouverture du dossier patient"],
  "pec.creer": ["PEC", "Prise en charge créée"],
  "feuille.ouvrir": ["CONSULTATION", "Ouverture d'une feuille de soins"],
  "feuille.valider": ["CONSULTATION", "Feuille validée"],
  "examen.recommander": ["EXAMEN", "Feuille d'examen ajoutée"],
  "pharma.rechercher": ["PHARMACIE", "Recherche d'ordonnance"],
  "pharma.servir": ["PHARMACIE", "Médicament servi"],
  "paiement.enregistrer": ["PAIEMENT", "Paiement enregistré"],
  "rapport.consulter": ["EXPORT", "Consultation d'un rapport"],
  "rapport.exporter": ["EXPORT", "Export d'un rapport"],
  "utilisateur.creer": ["ADMIN", "Compte créé"],
  "utilisateur.modifier": ["ADMIN", "Compte modifié"],
  "utilisateur.activer": ["ADMIN", "Compte activé"],
  "utilisateur.desactiver": ["ADMIN", "Compte désactivé"],
  "utilisateur.supprimer": ["ADMIN", "Compte supprimé"],
  "utilisateur.mdp.reinitialiser": ["ADMIN", "Mot de passe réinitialisé"],
  "permissions.modifier": ["ADMIN", "Permissions modifiées"],
  "notification.envoyer": ["NOTIFICATION", "Message envoyé"],
  "notification.lire": ["NOTIFICATION", "Message lu"],
  "notification.accuser": ["NOTIFICATION", "Accusé de lecture"],
  "journal.verifier": ["SECURITE", "Vérification d'intégrité du journal"],
  "journal.exporter": ["EXPORT", "Export du journal d'audit"],
  "journal.revue": ["SECURITE", "Revue d'une alerte"]
};
const AUDIT_CATEGORIES = ["AUTH", "NAVIGATION", "ASSURE", "PEC", "CONSULTATION", "EXAMEN", "PHARMACIE", "PAIEMENT", "ADMIN", "EXPORT", "NOTIFICATION", "SECURITE"];
const AUDIT_CATEGORY_LABEL = {
  AUTH: "Authentification", NAVIGATION: "Navigation", ASSURE: "Assurés", PEC: "Prises en charge", CONSULTATION: "Consultations",
  EXAMEN: "Examens", PHARMACIE: "Pharmacie", PAIEMENT: "Paiements", ADMIN: "Administration", EXPORT: "Exports", NOTIFICATION: "Notifications", SECURITE: "Sécurité"
};
const AUDIT_SEV_LABEL = { INFO: "Info", ATTENTION: "Attention", ALERTE: "Alerte", CRITIQUE: "Critique" };

state.auditFilters = { search: "", categorie: "", resultat: "", severite: "", from: "", to: "" };
state.journalTab = "connexions";

function maskNag(nag) {
  const d = nagDigits(nag);
  return d.length === 10 ? d.slice(0, 3) + " *** *** " + d.slice(9) : "";
}
function deviceLabel() {
  const ua = navigator.userAgent || "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Système inconnu";
  return browser + " · " + os;
}

// Envoi des actions de l'interface au serveur (par lots). Le serveur connaît l'utilisateur par son jeton et
// ajoute l'adresse IP ; ce que le navigateur envoie n'est que déclaratif.
const auditQueue = [];
let auditFlushTimer = null;
let journalUnavailable = false;
function audit(action, o) {
  if (!state.currentUser || journalUnavailable) return null;
  o = o || {};
  const reg = AUDIT_ACTIONS[action] || ["AUTRE", action];
  const ev = {
    horodatage: new Date().toISOString(),
    sessionId: sessionMeta ? sessionMeta.sessionId : "",
    correlationId: o.correlationId || "",
    categorie: reg[0], action: action, libelle: o.libelle || reg[1],
    resultat: o.resultat || "SUCCES", codeErreur: o.codeErreur || "", message: o.message || "",
    ressource: { type: o.ressourceType || "", id: o.ressourceId != null ? String(o.ressourceId) : "", libelle: o.ressourceLibelle || "", nag: o.nag ? maskNag(o.nag) : "" },
    avant: o.avant || null, apres: o.apres || null,
    contexte: { vue: o.vue || currentViewName || "", ecran: window.innerWidth + "×" + window.innerHeight, appareil: deviceLabel(), canal: "web", langue: navigator.language || "", fuseau: (Intl.DateTimeFormat().resolvedOptions().timeZone || "") }
  };
  auditQueue.push(ev);
  if (auditQueue.length >= 20) flushAudit();
  else if (!auditFlushTimer) auditFlushTimer = window.setTimeout(flushAudit, 1500);
  return ev;
}
function flushAudit() {
  window.clearTimeout(auditFlushTimer);
  auditFlushTimer = null;
  if (!auditQueue.length || !apiIsConnected()) return;
  const batch = auditQueue.splice(0, auditQueue.length);
  apiPostJournalEvenements(batch).catch(err => { if (err.unavailable) journalUnavailable = true; });
}

/* ---- Journalisation : onglets Connexions / Activité / Alertes / Messages ---- */

const JOURNAL_TABS = ["connexions", "activite", "alertes", "messages"];
function setJournalTab(tab) {
  state.journalTab = JOURNAL_TABS.indexOf(tab) >= 0 ? tab : "connexions";
  renderJournalisation();
}
document.querySelectorAll("#logTabToggle .chip").forEach(c => c.addEventListener("click", () => setJournalTab(c.dataset.tab)));

function journalErrorText(err, route) {
  return err && err.unavailable ? "Cette fonction n'est pas encore disponible côté serveur (" + route + " à créer)." : (err && err.message) || "Erreur";
}
function setEmptyState(id, show, text) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.dataset.def === undefined) el.dataset.def = el.textContent;
  el.hidden = !show;
  el.textContent = text || el.dataset.def;
}
// Pagination côté serveur : le tableau ne reçoit que la page demandée ; le pager s'appuie sur le total renvoyé.
function serverPageInfo(key, total, size, count) {
  const pages = Math.max(1, Math.ceil(total / size));
  let p = PAGER_STATE[key] || 1;
  if (p > pages) p = pages;
  PAGER_STATE[key] = p;
  return { page: p, pages: pages, size: size, total: total, from: total ? (p - 1) * size + 1 : 0, to: total ? (p - 1) * size + count : 0 };
}
function pageOf(key) { return PAGER_STATE[key] || 1; }

let journalRenderToken = 0;
function renderJournalisation() {
  document.querySelectorAll("#logTabToggle .chip").forEach(c => c.classList.toggle("active", c.dataset.tab === state.journalTab));
  JOURNAL_TABS.forEach(t => { document.getElementById("log-tab-" + t).hidden = t !== state.journalTab; });
  const token = ++journalRenderToken;
  apiListAlertes({ statut: "Nouveau", taille: 1 }).then(r => {
    if (token !== journalRenderToken) return;
    const n = r && r.total ? r.total : 0;
    const badge = document.getElementById("logAlertCount");
    badge.hidden = n === 0;
    badge.textContent = n;
  }).catch(() => { document.getElementById("logAlertCount").hidden = true; });
  if (state.journalTab === "activite") renderAuditActivity();
  else if (state.journalTab === "alertes") renderAuditAlerts();
  else if (state.journalTab === "messages") renderMessagesOutbox();
  else renderJournalConnexions();
}

function sevPill(e) { return '<span class="pill sev-' + String(e.severite || "INFO").toLowerCase() + '">' + (AUDIT_SEV_LABEL[e.severite] || e.severite) + (e.score ? " · " + e.score : "") + "</span>"; }
function resultPill(r) { return '<span class="pill ' + (r === "SUCCES" ? "validee" : (r === "ECHEC" ? "inactif" : "attente")) + '">' + (r === "SUCCES" ? "Succès" : (r === "ECHEC" ? "Échec" : (r === "REFUSE" ? "Refusé" : r))) + "</span>"; }
function evDate(e) { return new Date(e.horodatage || e.ts); }

function auditParams(size) {
  const f = state.auditFilters;
  return { page: pageOf("audit"), taille: size, recherche: f.search, categorie: f.categorie, resultat: f.resultat, severite: f.severite, du: f.from, au: f.to };
}

async function renderAuditActivity() {
  const token = journalRenderToken;
  const cat = document.getElementById("auditFilterCat");
  if (cat.options.length <= 1) cat.innerHTML = '<option value="">Toutes les catégories</option>' + AUDIT_CATEGORIES.map(c => '<option value="' + c + '">' + AUDIT_CATEGORY_LABEL[c] + "</option>").join("");
  cat.value = state.auditFilters.categorie;
  apiJournalResume().then(r => {
    document.getElementById("auditKpiToday").textContent = r.evenements_aujourdhui != null ? r.evenements_aujourdhui : "—";
    document.getElementById("auditKpiUsers").textContent = r.utilisateurs_actifs_24h != null ? r.utilisateurs_actifs_24h : "—";
    document.getElementById("auditKpiAlerts").textContent = r.alertes_a_examiner != null ? r.alertes_a_examiner : "—";
  }).catch(() => { ["auditKpiToday", "auditKpiUsers", "auditKpiAlerts"].forEach(id => { document.getElementById(id).textContent = "—"; }); });
  try {
    const res = await apiListJournalEvenements(auditParams(12));
    if (token !== journalRenderToken || state.journalTab !== "activite") return;
    const items = (res && res.items) || [];
    const total = (res && res.total) || 0;
    document.getElementById("auditCount").textContent = total;
    setEmptyState("auditEmpty", items.length === 0);
    const info = serverPageInfo("audit", total, 12, items.length);
    document.getElementById("auditBody").innerHTML = items.map(e => {
      const d = evDate(e);
      return '<tr class="audit-row" data-id="' + escapeHtml(String(e.id)) + '" tabindex="0">' +
        "<td>" + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + '<div class="hint" style="margin:2px 0 0">' + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "</div></td>" +
        '<td><span class="rapport-name">' + escapeHtml(e.acteur.nom) + '</span><div class="hint" style="margin:2px 0 0">' + escapeHtml(e.acteur.role) + "</div></td>" +
        "<td>" + escapeHtml(e.libelle) + '<div class="hint" style="margin:2px 0 0">' + escapeHtml(e.action) + "</div></td>" +
        "<td>" + (e.ressource && (e.ressource.libelle || e.ressource.type) ? escapeHtml(e.ressource.libelle || e.ressource.type) : "—") + (e.ressource && e.ressource.nag ? '<div class="hint" style="margin:2px 0 0">' + escapeHtml(e.ressource.nag) + "</div>" : "") + "</td>" +
        "<td>" + resultPill(e.resultat) + "</td>" +
        "<td>" + sevPill(e) + "</td>" +
      "</tr>";
    }).join("");
    state.auditPageItems = items;
    renderPager("auditPager", "audit", info, renderAuditActivity, "événements");
  } catch (err) {
    document.getElementById("auditBody").innerHTML = "";
    document.getElementById("auditPager").innerHTML = "";
    document.getElementById("auditCount").textContent = "0";
    setEmptyState("auditEmpty", true, journalErrorText(err, "GET /api/journal/evenements"));
  }
}

const AUDIT_FILTER_IDS = { auditFilterSearch: "search", auditFilterCat: "categorie", auditFilterResult: "resultat", auditFilterSev: "severite", auditFilterFrom: "from", auditFilterTo: "to" };
Object.keys(AUDIT_FILTER_IDS).forEach(id => {
  document.getElementById(id).addEventListener("input", e => {
    state.auditFilters[AUDIT_FILTER_IDS[id]] = e.target.value.trim();
    resetPage("audit");
    renderAuditActivity();
  });
});
document.getElementById("auditFilterResetBtn").addEventListener("click", () => {
  Object.keys(AUDIT_FILTER_IDS).forEach(id => { document.getElementById(id).value = ""; });
  state.auditFilters = { search: "", categorie: "", resultat: "", severite: "", from: "", to: "" };
  resetPage("audit");
  renderAuditActivity();
});

function auditDetailHtml(e) {
  const row = (k, v) => v === "" || v == null ? "" : "<div><dt>" + k + "</dt><dd>" + v + "</dd></div>";
  const json = v => v ? "<pre>" + escapeHtml(JSON.stringify(v, null, 2)) + "</pre>" : "";
  const ctx = e.contexte || {}, res = e.ressource || {}, act = e.acteur || {};
  return '<dl class="audit-dl">' +
    row("Événement", escapeHtml(String(e.id)) + (e.seq ? " · n° " + e.seq : "")) +
    row("Date et heure", fullDateTime(e.horodatage || e.ts) + " (" + escapeHtml(ctx.fuseau || "fuseau inconnu") + ")") +
    row("Action", escapeHtml(e.libelle) + ' <span class="hint">(' + escapeHtml(e.action) + ")</span>") +
    row("Catégorie", AUDIT_CATEGORY_LABEL[e.categorie] || e.categorie) +
    row("Utilisateur", escapeHtml(act.nom || "—") + " — " + escapeHtml(act.role || "") + (act.login ? " (" + escapeHtml(act.login) + ")" : "") + (act.etab ? " · " + escapeHtml(act.etab) : "")) +
    row("Résultat", resultPill(e.resultat) + (e.message ? " " + escapeHtml(e.message) : "")) +
    row("Ressource", res.type || res.libelle ? escapeHtml((res.type ? res.type + " " : "") + (res.libelle || "")) + (res.id ? ' <span class="hint">#' + escapeHtml(res.id) + "</span>" : "") : "") +
    row("Assuré (NAG masqué)", escapeHtml(res.nag)) +
    row("Avant", json(e.avant)) + row("Après", json(e.apres)) +
    row("Session", escapeHtml(e.sessionId)) + row("Corrélation", escapeHtml(e.correlationId)) +
    row("Page", escapeHtml(ctx.vue)) +
    row("Appareil", escapeHtml(ctx.appareil) + " · écran " + escapeHtml(ctx.ecran) + " · " + escapeHtml(ctx.langue)) +
    row("Adresse IP", ctx.ip ? escapeHtml(ctx.ip) : '<span class="hint">non renseignée</span>') +
    row("Risque", sevPill(e) + (e.regles && e.regles.length ? "<ul class=\"audit-rules\">" + e.regles.map(r => "<li><b>+" + r.points + "</b> " + escapeHtml(r.label) + "</li>").join("") + "</ul>" : "")) +
    (e.statutRevue ? row("Revue", escapeHtml(e.statutRevue) + (e.revuePar ? " par " + escapeHtml(e.revuePar) + " le " + fullDateTime(e.revueLe) : "")) : "") +
    row("Empreinte", e.hash ? '<code>' + escapeHtml(e.hash) + '</code> <span class="hint">précédente : ' + escapeHtml(e.hashPrec || "") + "</span>" : "") +
  "</dl>";
}
function openAuditDetail(id) {
  const pool = (state.auditPageItems || []).concat(state.alertPageItems || []);
  const e = pool.find(x => String(x.id) === String(id));
  if (e) showInfoModal("Détail de l'événement", auditDetailHtml(e));
}
document.getElementById("auditBody").addEventListener("click", e => { const tr = e.target.closest(".audit-row"); if (tr) openAuditDetail(tr.dataset.id); });
document.getElementById("auditBody").addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest(".audit-row"); if (tr) openAuditDetail(tr.dataset.id); } });

document.getElementById("auditVerifyBtn").addEventListener("click", () => {
  apiJournalIntegrite().then(r => {
    audit("journal.verifier", { resultat: r.ok ? "SUCCES" : "ECHEC", message: r.ok ? (r.verifies || 0) + " événements vérifiés" : "Rupture détectée" });
    const el = document.getElementById("auditKpiIntegrity");
    el.textContent = r.ok ? "Intact" : "Rompu";
    el.classList.toggle("bad", !r.ok);
    toast(r.ok
      ? { kind: "success", title: "Journal intact", text: (r.verifies || 0) + " événements vérifiés : aucune modification, aucun trou dans la chaîne.", ms: 5200 }
      : { kind: "urgent", title: "Intégrité compromise", text: "Événement n° " + (r.rupture && r.rupture.seq) + " : " + (r.rupture && r.rupture.why || "chaîne rompue") + ".", sticky: true });
  }).catch(err => toast({ kind: "warn", title: "Vérification impossible", text: journalErrorText(err, "GET /api/journal/integrite"), ms: 6000 }));
});

function csvCell(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
function auditToCsv(list) {
  const head = ["id", "horodatage", "n°", "session", "correlation", "utilisateur", "login", "role", "etablissement", "categorie", "action", "resultat", "message",
    "ressource_type", "ressource_id", "ressource_libelle", "nag_masque", "page", "appareil", "ecran", "ip", "severite", "score", "regles", "statut_revue", "hash", "hash_precedent"];
  const rows = list.map(e => [e.id, e.horodatage || e.ts, e.seq, e.sessionId, e.correlationId, e.acteur.nom, e.acteur.login, e.acteur.role, e.acteur.etab, e.categorie, e.action, e.resultat, e.message,
    (e.ressource || {}).type, (e.ressource || {}).id, (e.ressource || {}).libelle, (e.ressource || {}).nag, (e.contexte || {}).vue, (e.contexte || {}).appareil, (e.contexte || {}).ecran, (e.contexte || {}).ip, e.severite, e.score,
    (e.regles || []).map(r => r.code).join("|"), e.statutRevue, e.hash, e.hashPrec]);
  return "﻿" + [head].concat(rows).map(r => r.map(csvCell).join(";")).join("\r\n");
}
document.getElementById("auditExportBtn").addEventListener("click", async () => {
  try {
    const p = auditParams(5000);
    p.page = 1;
    const res = await apiListJournalEvenements(p);
    const list = (res && res.items) || [];
    audit("journal.exporter", { message: list.length + " événements exportés (CSV)", apres: { lignes: list.length } });
    const blob = new Blob([auditToCsv(list)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "journal-audit-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast({ kind: "success", title: "Export prêt", text: list.length + " événements dans le fichier CSV.", ms: 3800 });
  } catch (err) { toast({ kind: "warn", title: "Export impossible", text: journalErrorText(err, "GET /api/journal/evenements"), ms: 6000 }); }
});

/* ---- Alertes : activités inhabituelles à examiner (calculées par le serveur) ---- */

async function renderAuditAlerts() {
  const token = journalRenderToken;
  const sel = document.getElementById("alertFilterStatut").value;
  try {
    const res = await apiListAlertes({ statut: sel, page: pageOf("alertes"), taille: 6 });
    if (token !== journalRenderToken || state.journalTab !== "alertes") return;
    const items = (res && res.items) || [];
    const total = (res && res.total) || 0;
    state.alertPageItems = items;
    document.getElementById("alertCount").textContent = (res && res.a_examiner != null ? res.a_examiner : items.filter(e => e.statutRevue === "Nouveau").length) + " à examiner";
    setEmptyState("alertEmpty", items.length === 0);
    const info = serverPageInfo("alertes", total, 6, items.length);
    document.getElementById("alertList").innerHTML = items.map(e =>
      '<div class="alert-card sev-' + String(e.severite || "attention").toLowerCase() + (e.statutRevue !== "Nouveau" ? " reviewed" : "") + '" data-id="' + escapeHtml(String(e.id)) + '">' +
        '<div class="alert-main">' +
          '<div class="alert-title">' + sevPill(e) + " <b>" + escapeHtml((e.regles || []).slice().sort((a, b) => b.points - a.points).map(r => r.label)[0] || e.libelle) + "</b></div>" +
          '<div class="alert-meta">' + escapeHtml(e.acteur.nom) + " (" + escapeHtml(e.acteur.role) + ") · " + escapeHtml(e.libelle) + " · " + fullDateTime(e.horodatage || e.ts) + "</div>" +
          ((e.regles || []).length > 1 ? '<ul class="audit-rules">' + e.regles.map(r => "<li><b>+" + r.points + "</b> " + escapeHtml(r.label) + "</li>").join("") + "</ul>" : "") +
          (e.revuePar ? '<div class="alert-meta">Revue : ' + escapeHtml(e.statutRevue) + " par " + escapeHtml(e.revuePar) + (e.revueNote ? " — " + escapeHtml(e.revueNote) : "") + "</div>" : "") +
        "</div>" +
        '<div class="alert-actions">' +
          '<span class="pill ' + (e.statutRevue === "Nouveau" ? "attente" : (e.statutRevue === "Confirmé" ? "inactif" : "validee")) + '">' + escapeHtml(e.statutRevue || "") + "</span>" +
          '<button type="button" class="btn-secondary btn-sm" data-review="Vu">Vu</button>' +
          '<button type="button" class="btn-secondary btn-sm" data-review="Faux positif">Faux positif</button>' +
          '<button type="button" class="btn-danger-outline btn-sm" data-review="Confirmé">Confirmer</button>' +
          '<button type="button" class="link-btn" data-detail="1">Détail</button>' +
        "</div>" +
      "</div>"
    ).join("");
    renderPager("alertPager", "alertes", info, renderAuditAlerts, "alertes");
  } catch (err) {
    document.getElementById("alertList").innerHTML = "";
    document.getElementById("alertPager").innerHTML = "";
    document.getElementById("alertCount").textContent = "0 à examiner";
    setEmptyState("alertEmpty", true, journalErrorText(err, "GET /api/journal/alertes"));
  }
}
document.getElementById("alertFilterStatut").addEventListener("change", () => { resetPage("alertes"); renderAuditAlerts(); });
document.getElementById("alertList").addEventListener("click", e => {
  const card = e.target.closest(".alert-card");
  if (!card) return;
  const id = card.dataset.id;
  if (e.target.closest("[data-detail]")) { openAuditDetail(id); return; }
  const btn = e.target.closest("[data-review]");
  if (!btn) return;
  apiReviewAlerte(id, { statut: btn.dataset.review, note: "" }).then(() => {
    audit("journal.revue", { ressourceType: "Événement", ressourceId: id, message: "Alerte marquée « " + btn.dataset.review + " »" });
    renderJournalisation();
  }).catch(err => toast({ kind: "urgent", title: "Revue non enregistrée", text: err.message, ms: 6000 }));
});

/* ---- Messages : messages envoyés (avec suivi de lecture) ---- */

async function renderMessagesOutbox() {
  const token = journalRenderToken;
  document.getElementById("msgComposeBtn").hidden = !canSendNotifications();
  try {
    const res = await apiListNotificationsEnvoyees({ page: pageOf("messages"), taille: 8 });
    if (token !== journalRenderToken || state.journalTab !== "messages") return;
    const items = (res && res.items) || [];
    const total = (res && res.total) || 0;
    document.getElementById("msgCount").textContent = total;
    setEmptyState("msgEmpty", items.length === 0);
    const info = serverPageInfo("messages", total, 8, items.length);
    document.getElementById("msgBody").innerHTML = items.map(n => {
      const dest = Number(n.destinataires) || 0, lu = Number(n.lus) || 0, ack = Number(n.accuses) || 0;
      const pct = dest ? Math.round(lu / dest * 100) : 0;
      const sec = n.categorie === "securite";
      return "<tr>" +
        "<td>" + fullDateTime(n.date_envoi) + "</td>" +
        "<td>" + escapeHtml(n.expediteur_nom || "—") + '<div class="hint" style="margin:2px 0 0">' + escapeHtml(n.expediteur_role || "") + "</div></td>" +
        "<td>" + escapeHtml(n.cible_libelle || n.cible_type || "") + '<div class="hint" style="margin:2px 0 0">' + dest + " destinataire" + (dest > 1 ? "s" : "") + "</div></td>" +
        '<td><span class="pill ' + (sec ? "examen" : (n.priorite === "urgente" ? "inactif" : (n.priorite === "importante" ? "attente" : "consultation"))) + '">' + (sec ? "Sécurité" : NOTIF_PRIO_LABEL[n.priorite] || "Information") + "</span></td>" +
        '<td class="msg-cell"><b>' + escapeHtml(n.titre) + '</b><div class="hint" style="margin:2px 0 0">' + escapeHtml((n.message || "").length > 90 ? n.message.slice(0, 87) + "…" : (n.message || "")) + "</div></td>" +
        '<td class="num"><div class="mini-bar"><i style="width:' + pct + '%"></i></div>' + lu + " / " + dest + "</td>" +
        '<td class="num">' + (n.accuse_requis ? ack + " / " + dest : "—") + "</td>" +
      "</tr>";
    }).join("");
    renderPager("msgPager", "messages", info, renderMessagesOutbox, "messages");
  } catch (err) {
    document.getElementById("msgBody").innerHTML = "";
    document.getElementById("msgPager").innerHTML = "";
    document.getElementById("msgCount").textContent = "0";
    setEmptyState("msgEmpty", true, journalErrorText(err, "GET /api/notifications/envoyees"));
  }
}
document.getElementById("msgComposeBtn").addEventListener("click", openComposeModal);

/* ---- Onglet Connexions (qui s'est connecté, quand, avec quel résultat) ---- */

function fillJournalRoleFilter() {
  const sel = document.getElementById("logFilterRole");
  if (sel.options.length > 1) return;
  sel.innerHTML = '<option value="">Tous les profils</option>' + Object.keys(FRONT_ROLE_TO_API_ROLE).map(r => '<option value="' + escapeHtml(FRONT_ROLE_TO_API_ROLE[r]) + '">' + escapeHtml(r) + "</option>").join("");
}
function connexionParams() {
  const f = state.journalFilters;
  return { page: pageOf("connexions"), taille: 12, recherche: f.search, role: f.role, resultat: f.statut === "Succès" ? "succes" : (f.statut === "Échec" ? "echec" : ""), du: f.from, au: f.to };
}
async function renderJournalConnexions() {
  const token = journalRenderToken;
  fillJournalRoleFilter();
  try {
    const res = await apiListJournalConnexions(connexionParams());
    if (token !== journalRenderToken || state.journalTab !== "connexions") return;
    const items = (res && res.items) || [];
    const total = (res && res.total) || 0;
    const r = (res && res.resume) || {};
    document.getElementById("logKpiToday").textContent = r.connexions_aujourdhui != null ? r.connexions_aujourdhui : "—";
    document.getElementById("logKpiUniques").textContent = r.utilisateurs_uniques_30j != null ? r.utilisateurs_uniques_30j : "—";
    document.getElementById("logKpiEchecs").textContent = r.echecs_30j != null ? r.echecs_30j : "—";
    document.getElementById("logKpiDerniere").textContent = r.derniere_connexion ? fullDateTime(r.derniere_connexion).replace(" à ", " ") : "—";
    setEmptyState("journalEmpty", items.length === 0);
    const info = serverPageInfo("connexions", total, 12, items.length);
    document.getElementById("journalBody").innerHTML = items.map(l => {
      const d = new Date(l.date_heure);
      const ok = l.resultat === "succes";
      return "<tr>" +
        "<td>" + escapeHtml(l.nom || "—") + ' <span style="color:var(--muted)">(' + escapeHtml(l.username || "—") + ")</span></td>" +
        "<td>" + escapeHtml(API_ROLE_TO_FRONT_ROLE[l.role] || l.role || "—") + "</td>" +
        "<td>" + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + "</td>" +
        "<td>" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + "</td>" +
        '<td><span class="pill ' + (ok ? "actif" : "inactif") + '">' + (ok ? "Succès" : "Échec") + "</span></td>" +
      "</tr>";
    }).join("");
    renderPager("journalPager", "connexions", info, renderJournalConnexions, "connexions");
  } catch (err) {
    document.getElementById("journalBody").innerHTML = "";
    document.getElementById("journalPager").innerHTML = "";
    setEmptyState("journalEmpty", true, journalErrorText(err, "GET /api/journal/connexions"));
  }
}

["logFilterSearch", "logFilterRole", "logFilterStatut", "logFilterFrom", "logFilterTo"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    state.journalFilters = {
      search: document.getElementById("logFilterSearch").value.trim(),
      role: document.getElementById("logFilterRole").value,
      statut: document.getElementById("logFilterStatut").value,
      from: document.getElementById("logFilterFrom").value,
      to: document.getElementById("logFilterTo").value
    };
    resetPage("connexions");
    renderJournalConnexions();
  });
});
document.getElementById("logFilterResetBtn").addEventListener("click", () => {
  document.getElementById("logFilterSearch").value = "";
  document.getElementById("logFilterRole").value = "";
  document.getElementById("logFilterStatut").value = "";
  document.getElementById("logFilterFrom").value = "";
  document.getElementById("logFilterTo").value = "";
  state.journalFilters = { search: "", role: "", statut: "", from: "", to: "" };
  resetPage("connexions");
  renderJournalConnexions();
});

/* ---------------------------------------------------------------------- */
/* Espace Pharmacien : NAG → date de la prestation → ordonnance précise       */
/* → délivrance. Trois étapes, une seule ordonnance affichée à la fois : le    */
/* pharmacien ne peut pas servir celle d'un autre jour par erreur.            */
/* ---------------------------------------------------------------------- */

// Taux de remboursement CNAMGS appliqué au tarif de base du médicament, selon
// le ticket modérateur déjà enregistré sur la feuille de soins (même logique
// que pour les prestations : la donnée vient de l'étape agent, verrouillée ici).
const TM_RATE = { "Plein": 0.8, "Plein (ALD)": 1, "Exonéré": 1 };

function medicamentPrix(designation) {
  const m = state.catalogue.find(x => x.designation === designation);
  return m ? m.prix : 0;
}

// « Date de la prestation » d'une feuille : celle saisie par le médecin (« Date
// et heure » de la section Prestation), à défaut la date de réception de la
// feuille. C'est la même date qui est proposée et filtrée en pharmacie.
function prestationDateFR(entry) {
  return extractFRDate(entry.prestaDate) || extractFRDate(entry.date) || "";
}
function prestationDateISO(entry) {
  return frToISO(prestationDateFR(entry));
}

function pharmaLines(entry) { return entry.ordonnance || []; }

// Une consultation n'arrive à la pharmacie que si elle est validée ET porte au moins
// un médicament prescrit. Validée sans médicaments, elle reste au dossier du patient
// mais n'est jamais transmise (le médecin l'a confirmé au moment de valider).
function isSentToPharmacy(h) {
  return h.type === "Consultation" && h.statut === "Validée" && pharmaLines(h).some(m => m.designation);
}
function pharmaQty(med) { return Math.max(1, parseInt(med.quantite, 10) || 1); }

// LIVRAISON PARTIELLE : une ligne d'ordonnance peut être servie en plusieurs fois, par plusieurs pharmacies (rupture de
// stock : le patient va chercher le reste ailleurs). La base fait foi : pour chaque ligne le serveur renvoie la quantité
// déjà servie (quantiteServie) et la liste des livraisons (quantité, prix unitaire, montants, pharmacie, pharmacien, date).
function medServed(med) {
  if (typeof med.quantiteServie === "number") return Math.min(med.quantiteServie, pharmaQty(med));
  return med.statut === "Servi" ? pharmaQty(med) : 0;             // ligne servie en une fois avant les livraisons partielles
}
function medRemaining(med) { return Math.max(0, pharmaQty(med) - medServed(med)); }
function medDone(med) { return medRemaining(med) === 0; }
function medLivraisons(med) {
  if (Array.isArray(med.livraisons) && med.livraisons.length) return med.livraisons;
  if (med.statut === "Servi" && med.servicePar) {
    return [{ quantite: pharmaQty(med), prixUnitaire: med.prixUnitaire, montantTotal: String(num(med.prixUnitaire) * pharmaQty(med)),
      partAssurance: med.partAssurance, partPatient: med.partPatient, servicePar: med.servicePar, pharmacien: "", dateService: med.dateService, heureService: "" }];
  }
  return [];
}
function entryHasRemaining(entry) { return pharmaLines(entry).some(m => !medDone(m)); }
// « Servi », « Servi en 2 fois », « Partiel : 2 / 5 », « Non servi » — pour les tableaux et l'aperçu d'une feuille.
function medDeliveryText(med) {
  const list = medLivraisons(med), qty = pharmaQty(med), served = medServed(med);
  if (!list.length) return "Non servi";
  const parts = list.map(l => l.quantite + " le " + (l.dateService || "—") + (l.servicePar ? " — " + l.servicePar : ""));
  if (served >= qty) return list.length === 1 ? "Servi le " + (list[0].dateService || "—") + (list[0].servicePar ? " — " + list[0].servicePar : "") : "Servi en " + list.length + " fois : " + parts.join(" ; ");
  return "Partiel : " + served + " / " + qty + " — " + parts.join(" ; ");
}
function pharmaRate(entry) { return TM_RATE[entry.ticketModerateur] != null ? TM_RATE[entry.ticketModerateur] : 0.8; }

// Efface tout ce qui dépend du NAG (identité, dates, ordonnance), sans toucher
// au champ NAG lui-même. `prices` garde le prix unitaire saisi à la main pour chaque
// ligne (clé « id de la feuille : rang de la ligne ») tant que le patient reste le même.
function pharmaPrices() { return state.pharma.prices || (state.pharma.prices = {}); }
function clearPharmaResults() {
  state.pharma = { nag: "", entries: [], selectedId: null, prices: {}, qtys: {} };
  resetPage("pharmaDates");
  document.getElementById("pharmaDateInput").value = "";
  document.getElementById("pharmaNotFound").hidden = true;
  document.getElementById("pharmaAssureCard").hidden = true;
  document.getElementById("pharmaDatesCard").hidden = true;
  document.getElementById("pharmaDateMsg").hidden = true;
  document.getElementById("pharmaDatesList").innerHTML = "";
  document.getElementById("pharmaDatesPager").innerHTML = "";
  document.getElementById("pharmaResults").innerHTML = "";
  renderPharmaStepper();
  renderPharmaSuspension();
}

// Nombres qui « comptent » jusqu'à leur valeur (désactivé pour qui préfère moins de mouvement).
const NUM_ANIM = new WeakMap();
function prefersReducedMotion() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
function animateNumber(el, to, ms) {
  if (!el) return;
  const from = parseInt(el.dataset.v || "0", 10) || 0;
  el.dataset.v = String(to);
  if (prefersReducedMotion() || !ms || from === to) { NUM_ANIM.delete(el); el.textContent = fmt(to); return; }
  const token = {}, t0 = performance.now();
  NUM_ANIM.set(el, token);
  (function step(t) {
    if (NUM_ANIM.get(el) !== token) return;
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) window.requestAnimationFrame(step);
  })(t0);
}

// Bandeau du haut : ordonnances à servir, délivrances et prise en charge du jour (de cette pharmacie).
function refreshPharmaHero(animate) {
  const today = todayFR();
  const todayRows = pharmaHistoryRows().filter(r => r.med.dateService === today);
  animateNumber(document.getElementById("phKpiRx"), pharmaPendingCount(), animate ? 900 : 0);
  animateNumber(document.getElementById("phKpiToday"), todayRows.length, animate ? 900 : 0);
  animateNumber(document.getElementById("phKpiAss"), todayRows.reduce((a, r) => a + num(r.med.partAssurance), 0), animate ? 1100 : 0);
}

// Progression Patient → Prestation → Délivrance : la ligne se remplit au fil des étapes franchies.
function renderPharmaStepper() {
  const stepper = document.getElementById("phStepper");
  if (!stepper) return;
  const p = state.pharma;
  const entry = p.entries.find(e => e.id === p.selectedId);
  const done = [
    !!p.nag && p.entries.length > 0,
    !!entry,
    !!entry && pharmaLines(entry).length > 0 && pharmaLines(entry).every(medDone)
  ];
  const current = done[2] ? 3 : (done[1] ? 3 : (done[0] ? 2 : 1));
  stepper.querySelectorAll(".ph-step").forEach((el, i) => {
    el.classList.toggle("done", done[i]);
    el.classList.toggle("active", i + 1 === current && !done[i]);
  });
  const lines = stepper.querySelectorAll(".ph-step-line i");
  lines[0].style.width = done[0] ? "100%" : "0%";
  lines[1].style.width = done[1] ? "100%" : "0%";
}

function resetPharmaSearch() {
  document.getElementById("pharmaNagInput").value = "";
  clearPharmaResults();
  setPharmaTab("delivrer");
  refreshPharmaHero(true);
  document.getElementById("pharmaTestHint").hidden = true;
  // Prêt à saisir : le curseur est déjà dans le champ NAG (sauf sur écran tactile, où le clavier surgirait sans prévenir).
  if (!window.matchMedia("(pointer: coarse)").matches) window.setTimeout(() => document.getElementById("pharmaNagInput").focus({ preventScroll: true }), 150);
}

// L'identité s'affiche dès que le NAG correspond à une feuille connue, même
// sans ordonnance : le pharmacien voit alors que le patient existe bien, seule
// l'ordonnance recherchée manque.
const pharmaPatientCache = {};
function findPharmaIdentity(nag) {
  return state.historique.find(h => String(h.matricule) === nag && h.patientNom) || pharmaPatientCache[nag] || null;
}
let pharmaSearchToken = 0;
async function refreshFeuillesByNag(nag) {
  mergeFeuilles(await apiListFeuilles({ nag: nag }), false, true);
}

function renderPharmaAssureCard(identity) {
  const card = document.getElementById("pharmaAssureCard");
  if (!identity) { card.hidden = true; return; }
  card.hidden = false;
  document.getElementById("pa-nom").textContent = identity.patientNom || "—";
  document.getElementById("pa-matricule").textContent = formatNag(identity.matricule) || "—";
  document.getElementById("pa-naissance").textContent = displayDateFR(identity.dateNaissance) || "—";
  document.getElementById("pa-fonds").textContent = identity.fonds || "—";
  const parts = (identity.patientNom || "").split(" ");
  setAvatar(document.getElementById("pa-avatar"), parts[0], parts.slice(1).join(" "));
}

// Feuilles qu'une pharmacie peut servir : consultations validées qui portent
// une ordonnance, de la prestation la plus récente à la plus ancienne.
function pharmaEligibleEntries(nag) {
  return state.historique
    .filter(h => isSentToPharmacy(h) && String(h.matricule) === nag)
    .sort((a, b) => prestationDateISO(b).localeCompare(prestationDateISO(a)));
}

// Étape 1 : recherche du patient par NAG. keepSelection : rafraîchit l'affichage
// (après une délivrance) sans perdre la date déjà choisie ni les prix déjà saisis.
async function runPharmaSearch(nag, keepSelection) {
  nag = nagDigits(nag);
  if (!keepSelection) clearPharmaResults();
  if (!nag) return;
  if (!keepSelection) {
    // les ordonnances de ce patient sont demandées au serveur (validées, avec au moins un médicament)
    const token = ++pharmaSearchToken;
    const notFoundEl = document.getElementById("pharmaNotFound");
    try {
      const list = await apiListFeuilles({ nag: nag, statut: "Validée", avec_ordonnance: 1 });
      if (token !== pharmaSearchToken) return;
      mergeFeuilles(list, false, false);
      if (!pharmaEligibleEntries(nag).length && !pharmaPatientCache[nag]) {
        const p = await findPatientByMatricule(nag).catch(() => null);
        if (token !== pharmaSearchToken) return;
        if (p) pharmaPatientCache[nag] = { patientNom: (p.prenom + " " + p.nom).trim(), matricule: nag, dateNaissance: p.dateNaissance, fonds: fondsLabel(p.fonds) };
      }
    } catch (err) {
      if (token !== pharmaSearchToken) return;
      notFoundEl.hidden = false;
      notFoundEl.textContent = err.unavailable ? "La recherche d'ordonnances n'est pas encore disponible côté serveur (GET /api/feuilles à créer)." : err.message;
      return;
    }
  }

  const identity = findPharmaIdentity(nag);
  const entries = pharmaEligibleEntries(nag);
  const previous = state.pharma.selectedId;
  const prices = keepSelection ? pharmaPrices() : {};
  const qtys = keepSelection ? pharmaQtys() : {};
  const carried = keepSelection ? (state.pharma.justServed || []) : [];
  const wasSuspended = keepSelection && !!state.pharma.suspended;
  state.pharma = { nag: nag, entries: entries, selectedId: keepSelection && entries.some(e => e.id === previous) ? previous : null, prices: prices, qtys: qtys, justServed: carried, suspended: wasSuspended };
  if (!keepSelection) {
    audit("pharma.rechercher", {
      nag: nag, ressourceType: "Assuré", ressourceLibelle: identity ? identity.patientNom : "",
      message: entries.length ? entries.length + " ordonnance(s) à servir" : (identity ? "Aucune ordonnance à servir" : "Aucun patient pour ce NAG"),
      apres: { trouve: entries.length > 0, ordonnances: entries.length }
    });
  }

  const notFound = document.getElementById("pharmaNotFound");
  const pending = entries.filter(entryHasRemaining);
  notFound.hidden = entries.length > 0 && pending.length > 0;
  notFound.style.color = "var(--red)";
  if (!entries.length) {
    notFound.textContent = identity
      ? "Aucune ordonnance à servir : ce patient n'a aucune ordonnance validée."
      : "Aucun patient trouvé pour ce NAG.";
  } else if (!pending.length) {
    // toutes les ordonnances ont été entièrement servies : rien à saisir, on l'écrit clairement
    notFound.style.color = "var(--muted)";
    notFound.textContent = "Aucune ordonnance à servir : toutes les ordonnances de ce patient ont été entièrement servies.";
  }
  renderPharmaAssureCard(identity);
  renderPharmaSuspension();
  if (!keepSelection && (identity || entries.length)) checkPharmaSuspension(nag);
  document.getElementById("pharmaDatesCard").hidden = !entries.length;
  revealPharmaCards();

  // Une seule prestation possible (ou une seule qui reste à servir) : sa date est proposée d'office.
  if (!keepSelection && entries.length === 1) selectPharmaEntry(entries[0].id);
  else if (!keepSelection && pending.length === 1) selectPharmaEntry(pending[0].id);
  else { renderPharmaDates(); renderPharmaOrdonnance(); }
}

// Assuré suspendu : bandeau rouge, et plus aucune délivrance possible (les prix restent visibles mais figés).
function renderPharmaSuspension() {
  const s = !!state.pharma.suspended;
  const el = document.getElementById("pharmaSuspendedAlert");
  const was = !el.hidden;
  el.hidden = !s;
  if (s && !was) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; }
  document.getElementById("pharmaAssureCard").classList.toggle("is-suspended", s);
}
function checkPharmaSuspension(nag) {
  checkNagSuspended(nag).then(p => {
    if (state.pharma.nag !== nag) return;                 // le NAG a changé entre-temps
    const s = !!p;
    if (!!state.pharma.suspended === s) return;
    state.pharma.suspended = s;
    renderPharmaSuspension();
    renderPharmaOrdonnance();
    if (s) audit("pharma.rechercher", { resultat: "REFUSE", nag: nag, ressourceType: "Assuré", ressourceLibelle: fullName(p), message: "Assuré suspendu : délivrance bloquée" });
  });
}

// Les cartes qui apparaissent après une recherche arrivent l'une après l'autre.
function revealPharmaCards() {
  ["pharmaAssureCard", "pharmaDatesCard"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el.hidden) return;
    el.classList.remove("ph-reveal");
    void el.offsetWidth;
    el.style.setProperty("--d", (i * 90) + "ms");
    el.classList.add("ph-reveal");
  });
}

// Étape 2 : liste des dates de prestation du patient (cliquables, 5 par page). Toutes les
// dates restent accessibles pour pouvoir en changer d'un clic ; celle choisie est
// surlignée, et une date saisie à la main met en évidence les prestations de ce jour.
function renderPharmaDates() {
  const list = document.getElementById("pharmaDatesList");
  const iso = document.getElementById("pharmaDateInput").value;
  const info = pageSlice("pharmaDates", state.pharma.entries, 5);
  list.innerHTML = info.items.map((e, i) => {
    const lines = pharmaLines(e);
    const left = lines.filter(m => !medDone(m)).length;
    const started = lines.some(m => medServed(m) > 0);
    const active = e.id === state.pharma.selectedId;
    const match = !active && !!iso && prestationDateISO(e) === iso;
    return '<button type="button" class="pharma-date-item' + (active ? " active" : "") + (match ? " match" : "") + '" data-id="' + e.id + '" style="--i:' + i + '">' +
      '<span class="pd-date">' + escapeHtml(prestationDateFR(e)) + "</span>" +
      '<span class="pd-info"><b>' + escapeHtml(e.medecin || "—") + "</b>" + (e.medecinEtab ? " — " + escapeHtml(e.medecinEtab) : "") + " · feuille " + escapeHtml(e.numero) + "</span>" +
      '<span class="pill ' + (!left ? "validee" : (started ? "partiel" : "attente")) + '">' + (!left ? "Tout servi" : (started ? "Partiellement servi · " + left + " à finir" : left + " sur " + lines.length + " à servir")) + "</span>" +
    "</button>";
  }).join("");
  renderPager("pharmaDatesPager", "pharmaDates", info, renderPharmaDates, "prestations");
}

function selectPharmaEntry(id, opts) {
  const entry = state.pharma.entries.find(e => e.id === id);
  if (!entry) return;
  state.pharma.selectedId = id;
  const at = state.pharma.entries.indexOf(entry);
  PAGER_STATE.pharmaDates = Math.floor(at / 5) + 1;   // la page de la liste suit la date choisie
  document.getElementById("pharmaDateInput").value = prestationDateISO(entry);
  document.getElementById("pharmaDateMsg").hidden = true;
  renderPharmaDates();
  renderPharmaOrdonnance();
  // Automatisme : on amène l'ordonnance à l'écran et le curseur sur le premier prix à saisir.
  if (!(opts && opts.quiet)) window.setTimeout(() => focusNextPrice(true), 60);
}

// Date saisie à la main : une prestation ce jour-là → son ordonnance ; plusieurs →
// on demande de choisir la feuille ; aucune → on indique les dates disponibles.
function applyPharmaDate() {
  const iso = document.getElementById("pharmaDateInput").value;
  const msg = document.getElementById("pharmaDateMsg");
  msg.hidden = true;
  state.pharma.selectedId = null;
  if (iso) {
    const matches = state.pharma.entries.filter(e => prestationDateISO(e) === iso);
    if (matches.length === 1) { selectPharmaEntry(matches[0].id); return; }
    if (matches.length > 1) PAGER_STATE.pharmaDates = Math.floor(state.pharma.entries.indexOf(matches[0]) / 5) + 1;
    msg.style.color = matches.length ? "var(--muted)" : "var(--red)";
    msg.textContent = matches.length
      ? "Plusieurs prestations ce jour-là : choisissez la feuille ci-dessus."
      : "Aucune ordonnance pour le " + dossierDateFR(iso) + ". Dates disponibles : " +
        state.pharma.entries.map(prestationDateFR).filter((d, i, a) => a.indexOf(d) === i).join(", ") + ".";
    msg.hidden = false;
  }
  renderPharmaDates();
  renderPharmaOrdonnance();
}

/* ---- Étape 3 : l'ordonnance, ligne par ligne — prix unitaire ET quantité saisis à la main ---- */

function pharmaQtys() { return state.pharma.qtys || (state.pharma.qtys = {}); }

// Quantité de CETTE délivrance : entre 1 et le reste à servir (par défaut, tout le reste). Le pharmacien la réduit quand
// le stock ne suffit pas : c'est une livraison partielle, le patient ira chercher le reste dans une autre pharmacie.
function pharmaChosenQty(entry, med, idx) {
  const rest = medRemaining(med);
  if (rest <= 0) return 0;
  const raw = pharmaQtys()[entry.id + ":" + idx];
  if (raw === undefined) return rest;
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : Math.max(0, Math.min(rest, n));
}

// Montants d'une délivrance : total = prix unitaire × quantité servie, part assurance = taux de prise en charge du ticket
// modérateur (80 % en plein tarif), part patient = le reste. Tant que le prix ou la quantité manque, rien n'est calculé.
// Le serveur refait ce calcul : c'est lui qui enregistre les montants (table Ordonnance_delivrance).
function pharmaAmounts(entry, med, idx) {
  const prix = Math.min(99999999, Math.max(0, Math.floor(num(pharmaPrices()[entry.id + ":" + idx]))));
  const rest = medRemaining(med);
  const qte = pharmaChosenQty(entry, med, idx);
  if (!prix || qte < 1) return { prix: prix, qte: qte, rest: rest, valid: false, total: 0, ass: 0, pat: 0 };
  const total = prix * qte;
  const ass = Math.round(total * pharmaRate(entry));
  return { prix: prix, qte: qte, rest: rest, valid: true, total: total, ass: ass, pat: total - ass };
}

const RX_CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="rx-check-path" d="M20 6L9 17l-5-5"/></svg>';

function rxAmountsHtml(a, pct, locked) {
  return '<div class="rx-amounts' + (locked ? " is-locked" : "") + '">' +
    '<div class="rx-amt total"><span>Prix total</span><b><em data-amt="total">' + (locked ? "—" : fmt(a.total)) + "</em><small> FCFA</small></b></div>" +
    '<div class="rx-amt ass"><span>Part assurance (' + pct + ' %)</span><b><em data-amt="ass">' + (locked ? "—" : fmt(a.ass)) + "</em><small> FCFA</small></b></div>" +
    '<div class="rx-amt pat"><span>Part patient</span><b><em data-amt="pat">' + (locked ? "—" : fmt(a.pat)) + "</em><small> FCFA</small></b></div>" +
  "</div>";
}

// Barre d'avancement d'une ligne : ce qui est déjà servi (plein), puis ce qui va l'être maintenant (rayé), sur la quantité prescrite.
// « servi / prescrit » est dans l'en-tête de la ligne : sous la barre, seulement ce qui va être servi et ce qui restera.
function rxBarHtml(qty, served, now) {
  return '<div class="rx-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + qty + '" aria-valuenow="' + served + '" aria-label="Quantité servie">' +
      '<span class="rx-bar-done"></span><span class="rx-bar-now"></span></div>' +
    '<div class="rx-bar-txt" hidden><span class="rb-now"></span><span class="rb-left"></span></div>';
}
function updateRxBar(lineEl, qty, served, now) {
  const box = lineEl.querySelector("[data-bar]");
  if (!box) return;
  if (!box.firstChild) box.innerHTML = rxBarHtml(qty, served, now);
  const pDone = qty ? Math.round(served / qty * 100) : 0;
  const pNow = qty ? Math.min(100 - pDone, Math.round(now / qty * 100)) : 0;
  box.querySelector(".rx-bar").setAttribute("aria-valuenow", String(served));
  box.querySelector(".rx-bar-done").style.width = pDone + "%";
  const nowEl = box.querySelector(".rx-bar-now");
  nowEl.style.left = pDone + "%";
  nowEl.style.width = pNow + "%";
  const left = Math.max(0, qty - served - now);
  const rbNow = box.querySelector(".rb-now");
  rbNow.hidden = !now;
  rbNow.innerHTML = now ? "+ <b>" + now + "</b> maintenant" : "";
  box.querySelector(".rb-left").innerHTML = left ? "reste <b>" + left + "</b>" : "";
  box.querySelector(".rx-bar-txt").hidden = !now;   // hors saisie, « servi / prescrit » de l'en-tête suffit : pas de ligne en plus
}

// Livraisons déjà faites sur une ligne (une ou plusieurs pharmacies), en tableau aligné : date, pharmacie et pharmacien,
// quantité × prix, total, part assurance, part patient ; une ligne de total quand il y en a plusieurs.
function rxDeliveriesHtml(med, title) {
  const list = medLivraisons(med);
  if (!list.length) return "";
  const rows = list.map(l =>
    "<tr>" +
      '<td data-l="Livraison"><b>' + escapeHtml(l.dateService || "—") + "</b>" + (l.heureService ? "<small>" + escapeHtml(l.heureService) + "</small>" : "") + "</td>" +
      '<td data-l="Pharmacie"><b>' + escapeHtml(l.servicePar || "Pharmacie") + "</b>" + (l.pharmacien ? "<small>" + escapeHtml(l.pharmacien) + "</small>" : "") + "</td>" +
      '<td class="num" data-l="Quantité × prix">' + escapeHtml(String(l.quantite)) + " × " + fmtFCFA(num(l.prixUnitaire)) + "</td>" +
      '<td class="num tot" data-l="Total">' + fmtFCFA(num(l.montantTotal)) + "</td>" +
      '<td class="num ass" data-l="CNAMGS">' + fmtFCFA(num(l.partAssurance)) + "</td>" +
      '<td class="num pat" data-l="Patient">' + fmtFCFA(num(l.partPatient)) + "</td>" +
    "</tr>").join("");
  const sum = list.reduce((t, l) => ({ q: t.q + (parseInt(l.quantite, 10) || 0), total: t.total + num(l.montantTotal), ass: t.ass + num(l.partAssurance), pat: t.pat + num(l.partPatient) }), { q: 0, total: 0, ass: 0, pat: 0 });
  const foot = list.length > 1
    ? '<tfoot><tr><td colspan="2" data-l="">Total servi</td><td class="num" data-l="Quantité">' + sum.q + " unités</td>" +
      '<td class="num tot" data-l="Total">' + fmtFCFA(sum.total) + '</td><td class="num ass" data-l="CNAMGS">' + fmtFCFA(sum.ass) + '</td><td class="num pat" data-l="Patient">' + fmtFCFA(sum.pat) + "</td></tr></tfoot>"
    : "";
  return '<div class="rx-deliv-wrap">' + (title ? '<div class="rx-sub">' + title + "</div>" : "") +
    '<table class="rx-deliv-table"><thead><tr><th>Livraison</th><th>Pharmacie · pharmacien</th><th class="num">Quantité × prix</th><th class="num">Total</th><th class="num">CNAMGS</th><th class="num">Patient</th></tr></thead>' +
    "<tbody>" + rows + "</tbody>" + foot + "</table></div>";
}

function rxPartialNote(a) {
  return "Livraison partielle : il restera " + (a.rest - a.qte) + " à servir dans une autre pharmacie.";
}

// Une ligne d'ordonnance. À servir : prix, quantité, montants et « Servir » sur UNE rangée alignée (deux rangées si la carte est
// étroite), les aides (tarif de référence, reste à servir, livraison partielle) juste dessous, chacune sous son champ.
// Servie : en-tête, barre pleine et tableau des livraisons — plus aucun champ de saisie.
function rxLineHtml(entry, med, i, pct) {
  const qty = pharmaQty(med), served = medServed(med), done = medRemaining(med) === 0;
  const ref = medicamentPrix(med.designation);
  const a = pharmaAmounts(entry, med, i);
  const head =
    '<div class="rx-line-head">' +
      '<span class="rx-line-num">' + (done ? RX_CHECK_SVG : (i + 1)) + "</span>" +
      '<div class="rx-line-title"><b>' + escapeHtml(med.designation) + "</b><small>" + escapeHtml(med.posologie || "Posologie non précisée") + "</small></div>" +
      '<span class="rx-qty" title="Quantité servie sur quantité prescrite">' + served + " / " + qty + "</span>" +
      '<span class="pill ' + (done ? "validee" : (served > 0 ? "partiel" : "attente")) + '">' + (done ? "Servi" : (served > 0 ? "Partiel" : "À servir")) + "</span>" +
    "</div>";
  if (done) {
    return '<article class="rx-line served" data-idx="' + i + '">' + head +
      '<div class="rx-progress" data-bar>' + rxBarHtml(qty, served, 0) + "</div>" +
      '<div class="rx-line-body">' + rxDeliveriesHtml(med, "") + "</div></article>";
  }
  const stored = pharmaPrices()[entry.id + ":" + i] || "";
  const qStored = pharmaQtys()[entry.id + ":" + i];
  const blocked = !!state.pharma.suspended;
  const priced = a.prix > 0;
  return '<article class="rx-line' + (a.valid && !blocked ? " ready" : "") + (blocked ? " blocked" : "") + (served ? " has-served" : "") + '" data-idx="' + i + '">' + head +
    '<div class="rx-progress" data-bar>' + rxBarHtml(qty, served, a.valid ? a.qte : 0) + "</div>" +
    '<div class="rx-line-body">' +
      (served ? rxDeliveriesHtml(med, "Déjà servi") : "") +
      '<div class="rx-form">' +
        '<div class="rx-price-field">' +
          '<label for="rxPrice' + i + '">Prix unitaire</label>' +
          '<span class="rx-price-input"><input type="text" id="rxPrice' + i + '" class="rx-price" data-idx="' + i + '" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Saisir le prix" value="' + escapeHtml(stored ? fmt(num(stored)) : "") + '"' + (blocked ? " disabled" : "") + ' /><em>FCFA</em></span>' +
        "</div>" +
        '<div class="rx-qty-field' + (priced ? "" : " is-locked") + '">' +
          '<label for="rxQty' + i + '">Quantité à servir</label>' +
          '<span class="rx-qty-input"><input type="text" id="rxQty' + i + '" class="rx-qty-in" data-idx="' + i + '" inputmode="numeric" autocomplete="off" maxlength="4" value="' + escapeHtml(qStored !== undefined ? qStored : String(a.rest)) + '"' + (priced && !blocked ? "" : " disabled") + ' /><em>/ ' + a.rest + "</em></span>" +
        "</div>" +
        rxAmountsHtml(a, pct, !a.valid) +
        '<div class="rx-line-actions"><button type="button" class="btn-serve" data-action="servir" data-idx="' + i + '"' + (a.valid && !blocked ? "" : " disabled") + ' title="' + (blocked ? "Assuré suspendu : délivrance impossible" : (a.valid ? "" : (priced ? "Indiquez la quantité à servir" : "Saisissez d'abord le prix unitaire"))) + '">Servir</button></div>' +
        '<div class="rx-hint-price">' + (ref && !blocked ? '<button type="button" class="rx-ref" data-action="ref" data-idx="' + i + '" data-ref="' + ref + '" title="Utiliser le tarif de référence du catalogue">Tarif de référence : ' + fmt(ref) + " FCFA — utiliser</button>" : "") + "</div>" +
        '<div class="rx-hint-qty">Reste : <b>' + a.rest + "</b> sur " + qty + " prescrit" + (qty > 1 ? "s" : "") +
          (a.rest > 1 && !blocked ? ' · <button type="button" class="rx-ref" data-action="qty-max" data-idx="' + i + '"' + (priced ? "" : " disabled") + ">Tout le reste</button>" : "") + "</div>" +
        '<p class="rx-partial-note"' + (a.valid && a.qte < a.rest ? "" : " hidden") + ">" + (a.valid && a.qte < a.rest ? escapeHtml(rxPartialNote(a)) : "") + "</p>" +
      "</div>" +
    "</div></article>";
}

function renderPharmaOrdonnance() {
  const wrap = document.getElementById("pharmaResults");
  wrap.innerHTML = "";
  renderPharmaStepper();
  const entry = state.pharma.entries.find(e => e.id === state.pharma.selectedId);
  if (!entry) return;
  const rate = pharmaRate(entry), pct = Math.round(rate * 100);
  const lines = pharmaLines(entry);
  const fresh = state.pharma.justServed || [];
  state.pharma.justServed = [];

  const card = document.createElement("div");
  card.className = "card ph-card ph-rx ph-reveal";
  card.dataset.entry = entry.id;
  card.innerHTML =
    '<div class="card-head"><h3><span class="step-num">3</span> Ordonnance du ' + escapeHtml(prestationDateFR(entry)) + "</h3>" +
      '<span class="pill consultation">Feuille ' + escapeHtml(entry.numero) + "</span>" +
    "</div>" +
    '<div class="rx-meta">' +
      "<div>Patient<b>" + escapeHtml(entry.patientNom || "—") + "</b></div>" +
      "<div>Prescrit par<b>" + escapeHtml(entry.medecin || "—") + (entry.medecinType ? " (" + escapeHtml(entry.medecinType) + ")" : "") + "</b></div>" +
      "<div>Établissement<b>" + escapeHtml(entry.medecinEtab || "—") + "</b></div>" +
      "<div>Date de la prestation<b>" + escapeHtml(prestationDateFR(entry)) + "</b></div>" +
      "<div>Ticket modérateur<b>" + escapeHtml(entry.ticketModerateur || "—") + " — prise en charge " + pct + " %</b></div>" +
    "</div>" +
    '<div class="rx-lines">' + lines.map((med, i) => rxLineHtml(entry, med, i, pct)).join("") + "</div>" +
    '<div class="rx-summary">' +
      '<div class="rx-ring" aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26"/></svg><b class="rx-ring-txt">0/0</b></div>' +
      '<div class="rx-sum-stats">' +
        '<div class="rx-sum total"><span>Total</span><b><em id="rxSumTotal">0</em> <small>FCFA</small></b></div>' +
        '<div class="rx-sum ass"><span>Part assurance</span><b><em id="rxSumAss">0</em> <small>FCFA</small></b></div>' +
        '<div class="rx-sum pat"><span>Part patient</span><b><em id="rxSumPat">0</em> <small>FCFA</small></b></div>' +
      "</div>" +
      '<div class="rx-sum-actions"><p class="rx-hint" id="rxHint"></p><button type="button" class="btn-serve big" id="rxServeAll" data-action="servir-tout" hidden></button></div>' +
    "</div>";
  wrap.appendChild(card);
  refreshRxSummary(card, entry, false);
  card.querySelectorAll(".rx-line").forEach(el => {
    const i = parseInt(el.dataset.idx, 10), med = lines[i];
    const a = pharmaAmounts(entry, med, i);
    updateRxBar(el, pharmaQty(med), medServed(med), !medDone(med) && a.valid ? a.qte : 0);
    if (fresh.indexOf(i) >= 0) el.classList.add("just-served");
  });

  if (lines.length && lines.every(medDone)) {
    // Plus rien à servir : les champs de saisie ont disparu, on le dit.
    const p = rxProgress(entry);
    const done = document.createElement("div");
    done.className = "rx-done";
    done.innerHTML =
      '<span class="rx-done-check"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="rx-check-path" d="M20 6L9 17l-5-5"/></svg></span>' +
      "<div><b>Aucune ordonnance à servir</b><span>Cette ordonnance a été entièrement servie — total " + fmtFCFA(p.total) + " · CNAMGS " + fmtFCFA(p.ass) + " · patient " + fmtFCFA(p.pat) + "</span></div>" +
      '<button type="button" class="btn-primary" id="phNextPatientBtn">Servir un autre patient</button>';
    card.appendChild(done);
    done.querySelector("#phNextPatientBtn").addEventListener("click", () => {
      resetPharmaSearch();
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }
}

// Recalcule une ligne (montants, quantité, barre, état du bouton « Servir ») sans redessiner la carte : le curseur reste dans le champ.
function refreshRxLine(lineEl, entry, idx, animate) {
  const med = pharmaLines(entry)[idx];
  const a = pharmaAmounts(entry, med, idx);
  const blocked = !!state.pharma.suspended;
  const priced = a.prix > 0;
  const amounts = lineEl.querySelector(".rx-amounts");
  const wasLocked = amounts.classList.contains("is-locked");
  amounts.classList.toggle("is-locked", !a.valid);
  lineEl.classList.toggle("ready", a.valid && !blocked);
  const set = (key, v) => {
    const el = amounts.querySelector('[data-amt="' + key + '"]');
    if (!a.valid) { el.textContent = "—"; el.dataset.v = "0"; return; }
    animateNumber(el, v, animate ? 480 : 0);
  };
  set("total", a.total); set("ass", a.ass); set("pat", a.pat);
  if (a.valid && wasLocked && animate) { amounts.classList.remove("pop"); void amounts.offsetWidth; amounts.classList.add("pop"); }
  // la quantité se saisit une fois le prix connu
  const qf = lineEl.querySelector(".rx-qty-field");
  if (qf) {
    qf.classList.toggle("is-locked", !priced);
    qf.querySelector(".rx-qty-in").disabled = !priced || blocked;
    const mx = lineEl.querySelector('[data-action="qty-max"]');
    if (mx) mx.disabled = !priced || blocked;
  }
  updateRxBar(lineEl, pharmaQty(med), medServed(med), a.valid ? a.qte : 0);
  const note = lineEl.querySelector(".rx-partial-note");
  if (note) {
    const partial = a.valid && a.qte < a.rest;
    note.hidden = !partial;
    note.textContent = partial ? rxPartialNote(a) : "";
  }
  const btn = lineEl.querySelector('[data-action="servir"]');
  btn.disabled = !a.valid || blocked;
  btn.title = blocked ? "Assuré suspendu : délivrance impossible" : (a.valid ? "" : (priced ? "Indiquez la quantité à servir" : "Saisissez d'abord le prix unitaire"));
}

// Avancement de toute l'ordonnance : lignes à servir, prix saisis, unités servies / prescrites, montants (déjà servis + à servir maintenant).
function rxProgress(entry) {
  const lines = pharmaLines(entry);
  let total = 0, ass = 0, pat = 0, units = 0, servedUnits = 0, nowUnits = 0, ready = 0, missing = 0, badQty = 0, left = 0;
  lines.forEach((med, i) => {
    units += pharmaQty(med);
    servedUnits += medServed(med);
    medLivraisons(med).forEach(l => {
      ass += num(l.partAssurance);
      pat += num(l.partPatient);
      total += num(l.montantTotal) || (num(l.partAssurance) + num(l.partPatient));
    });
    if (medDone(med)) return;
    left++;
    const a = pharmaAmounts(entry, med, i);
    if (a.valid) { ready++; nowUnits += a.qte; total += a.total; ass += a.ass; pat += a.pat; }
    else if (a.prix > 0) badQty++;
    else missing++;
  });
  return { lines: lines.length, left: left, ready: ready, missing: missing, badQty: badQty, total: total, ass: ass, pat: pat, units: units, servedUnits: servedUnits, nowUnits: nowUnits };
}

function refreshRxSummary(card, entry, animate) {
  const p = rxProgress(entry);
  animateNumber(card.querySelector("#rxSumTotal"), p.total, animate ? 480 : 0);
  animateNumber(card.querySelector("#rxSumAss"), p.ass, animate ? 480 : 0);
  animateNumber(card.querySelector("#rxSumPat"), p.pat, animate ? 480 : 0);
  card.querySelector(".rx-ring-txt").textContent = p.servedUnits + "/" + p.units;
  const C = 2 * Math.PI * 26;
  const fg = card.querySelector(".rx-ring .fg");
  fg.style.strokeDasharray = C.toFixed(2);
  fg.style.strokeDashoffset = (C * (1 - (p.units ? p.servedUnits / p.units : 0))).toFixed(2);
  const all = card.querySelector("#rxServeAll");
  all.hidden = p.left <= 1;
  all.textContent = "Tout servir (" + p.left + " médicaments)";
  all.disabled = p.missing > 0 || p.badQty > 0 || p.left === 0 || !!state.pharma.suspended;
  const hint = card.querySelector("#rxHint");
  hint.textContent = p.left === 0 ? "" : (state.pharma.suspended ? "Assuré suspendu : aucune délivrance possible." : p.missing > 0
    ? "Saisissez le prix unitaire " + (p.missing === 1 ? "du médicament restant" : "des " + p.missing + " médicaments restants") + " pour débloquer la délivrance."
    : (p.badQty > 0 ? "Indiquez la quantité à servir pour chaque médicament."
      : (p.left > 1 ? "Prix et quantités saisis : vous pouvez servir l'ordonnance." : "Prix saisi : vous pouvez servir.")));
  hint.classList.toggle("ok", p.left > 0 && p.missing === 0 && p.badQty === 0 && !state.pharma.suspended);
  hint.classList.toggle("bad", !!state.pharma.suspended && p.left > 0);
}

// Curseur sur le premier prix encore à saisir ; l'ordonnance est amenée à l'écran si elle est trop bas.
function focusNextPrice(scroll) {
  const card = document.querySelector("#pharmaResults .ph-rx");
  if (!card) return;
  const empty = Array.from(card.querySelectorAll(".rx-price")).find(el => !num(el.value));
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (scroll && card.getBoundingClientRect().top > window.innerHeight * 0.5) card.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  if (empty && !coarse) empty.focus({ preventScroll: true });
}

// Feux d'artifice de fin d'ordonnance.
function burstConfetti(originEl) {
  if (prefersReducedMotion()) return;
  const r = originEl.getBoundingClientRect();
  const box = document.createElement("div");
  box.className = "confetti";
  box.style.left = (r.left + r.width / 2) + "px";
  box.style.top = Math.max(120, Math.min(window.innerHeight * 0.55, r.top + 60)) + "px";
  const colors = ["#0fb5a6", "#2f6bff", "#7b4dff", "#f6c445", "#43e08e", "#ff6b6b"];
  for (let i = 0; i < 34; i++) {
    const p = document.createElement("i");
    const ang = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 190;
    p.style.setProperty("--dx", Math.round(Math.cos(ang) * dist) + "px");
    p.style.setProperty("--dy", Math.round(Math.sin(ang) * dist - 60) + "px");
    p.style.setProperty("--r", Math.round(Math.random() * 720 - 360) + "deg");
    p.style.setProperty("--c", colors[i % colors.length]);
    p.style.animationDelay = Math.round(Math.random() * 120) + "ms";
    box.appendChild(p);
  }
  document.body.appendChild(box);
  window.setTimeout(() => box.remove(), 1800);
}

// La délivrance part au serveur (PUT /api/feuilles/{id}, champ « aServir ») : c'est LUI qui vérifie que la quantité ne dépasse
// pas ce qui reste à servir (toutes pharmacies confondues), recalcule les montants et enregistre la livraison (table
// Ordonnance_delivrance : quantité, prix unitaire, montants, pharmacie, pharmacien, date). L'écran se met à jour avec sa réponse.
// items : [{ idx, a }] où a = pharmaAmounts() de la ligne.
async function serveLines(entry, items) {
  if (!items.length || state.pharma.suspended) return;
  let saved;
  try {
    saved = await apiServirLignes(entry.serverId, pharmaLines(entry).length, items.map(x => ({ idx: x.idx, quantite: x.a.qte, prixUnitaire: x.a.prix })));
  } catch (err) {
    showInfoModal("Délivrance non enregistrée", "<p>" + escapeHtml(err.message) + "</p><p class=\"hint\">Rien n'a été servi pour ces lignes : l'écran est rechargé depuis la base.</p>");
    try { await refreshFeuillesByNag(entry.matricule); } catch (e) { /* on garde l'affichage */ }
    runPharmaSearch(state.pharma.nag, true);
    return;
  }
  mergeFeuilles([saved], false, true);
  items.forEach(x => { delete pharmaPrices()[entry.id + ":" + x.idx]; delete pharmaQtys()[entry.id + ":" + x.idx]; });   // le reste se ressaisit
  state.pharma.justServed = items.map(x => x.idx);
  const updated = state.historique.find(h => h.id === entry.id) || saved;
  const complete = pharmaLines(updated).every(medDone);
  runPharmaSearch(state.pharma.nag, true);
  refreshPharmaHero(true);
  pullCompteurs().then(() => { refreshNavLive(); refreshPharmaHero(true); });   // le compteur du serveur arrive après : on remet les pastilles à jour
  const card = document.querySelector("#pharmaResults .ph-rx");
  if (complete && card) {
    burstConfetti(card);
    const p = rxProgress(updated);
    toast({ kind: "success", title: "Ordonnance entièrement servie", text: "Total " + fmtFCFA(p.total) + " — les montants alimentent le suivi financier de la pharmacie.", ms: 5200 });
    const next = document.getElementById("phNextPatientBtn");
    if (next && !window.matchMedia("(pointer: coarse)").matches) next.focus({ preventScroll: true });
  } else {
    const partial = items.some(x => x.a.qte < x.a.rest);
    toast({ kind: "success", title: partial ? "Livraison partielle enregistrée" : (items.length > 1 ? items.length + " médicaments servis" : "Médicament servi"),
      text: partial ? "Le reste pourra être servi par une autre pharmacie." : "Montants enregistrés.", ms: 3600 });
    focusNextPrice(false);
  }
}

// Une seule délégation d'événements pour toute l'ordonnance affichée.
const pharmaResultsEl = document.getElementById("pharmaResults");
pharmaResultsEl.addEventListener("input", e => {
  const priceIn = e.target.closest(".rx-price"), qtyIn = e.target.closest(".rx-qty-in");
  const input = priceIn || qtyIn;
  if (!input) return;
  const card = input.closest(".ph-rx");
  const entry = state.pharma.entries.find(x => x.id === parseInt(card.dataset.entry, 10));
  if (!entry) return;
  const idx = parseInt(input.dataset.idx, 10);
  if (priceIn) {
    const digits = input.value.replace(/\D/g, "").slice(0, 8);
    pharmaPrices()[entry.id + ":" + idx] = digits;
    if (input.value !== digits) input.value = digits;       // seuls les chiffres passent
  } else {
    const rest = medRemaining(pharmaLines(entry)[idx]);
    let digits = input.value.replace(/\D/g, "").slice(0, 4);
    if (digits !== "") digits = String(Math.min(rest, parseInt(digits, 10)));   // jamais plus que le reste à servir
    pharmaQtys()[entry.id + ":" + idx] = digits;
    if (input.value !== digits) input.value = digits;
  }
  refreshRxLine(input.closest(".rx-line"), entry, idx, true);
  refreshRxSummary(card, entry, true);
});
pharmaResultsEl.addEventListener("focusin", e => {
  const price = e.target.closest(".rx-price");
  if (price) { price.value = price.value.replace(/\D/g, ""); return; }   // édition sans espaces
  const q = e.target.closest(".rx-qty-in");
  if (q) q.select();
});
pharmaResultsEl.addEventListener("focusout", e => {
  const price = e.target.closest(".rx-price");
  if (price && price.value) { price.value = fmt(num(price.value)); return; }   // affichage 12 500
  const q = e.target.closest(".rx-qty-in");
  if (!q) return;
  const n = parseInt(q.value, 10);
  if (!n) {                                                 // vide ou 0 : retour à « tout le reste »
    const card = q.closest(".ph-rx");
    const entry = card && state.pharma.entries.find(x => x.id === parseInt(card.dataset.entry, 10));
    if (!entry) return;
    const idx = parseInt(q.dataset.idx, 10);
    delete pharmaQtys()[entry.id + ":" + idx];
    q.value = String(medRemaining(pharmaLines(entry)[idx]));
    refreshRxLine(q.closest(".rx-line"), entry, idx, false);
    refreshRxSummary(card, entry, false);
  }
});
pharmaResultsEl.addEventListener("keydown", e => {
  const input = e.target.closest(".rx-price, .rx-qty-in");
  if (!input || e.key !== "Enter") return;
  e.preventDefault();
  const card = input.closest(".ph-rx");
  const fields = Array.from(card.querySelectorAll(".rx-price, .rx-qty-in")).filter(el => !el.disabled);
  const next = fields[fields.indexOf(input) + 1];
  if (next) { next.focus(); return; }
  const target = card.querySelector("#rxServeAll:not([hidden]):not(:disabled)") || input.closest(".rx-line").querySelector('[data-action="servir"]:not(:disabled)');
  if (target) target.focus();
});
pharmaResultsEl.addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const card = btn.closest(".ph-rx");
  if (!card) return;
  const entry = state.pharma.entries.find(x => x.id === parseInt(card.dataset.entry, 10));
  if (!entry) return;
  const lines = pharmaLines(entry);
  if (state.pharma.suspended && (btn.dataset.action === "servir" || btn.dataset.action === "servir-tout")) {
    audit("pharma.servir", { resultat: "REFUSE", nag: entry.matricule, ressourceType: "Ordonnance", ressourceId: entry.id, ressourceLibelle: entry.numero, message: "Délivrance refusée : assuré suspendu" });
    showSuspendedModal(entry.patientNom, entry.matricule, "aucun médicament ne peut être servi.");
    return;
  }

  if (btn.dataset.action === "ref") {
    const idx = parseInt(btn.dataset.idx, 10);
    const input = card.querySelector('.rx-price[data-idx="' + idx + '"]');
    pharmaPrices()[entry.id + ":" + idx] = btn.dataset.ref;
    input.value = fmt(num(btn.dataset.ref));
    refreshRxLine(input.closest(".rx-line"), entry, idx, true);
    refreshRxSummary(card, entry, true);
    const q = card.querySelector('.rx-qty-in[data-idx="' + idx + '"]');
    if (q && !window.matchMedia("(pointer: coarse)").matches) q.focus();     // le prix est posé : on passe à la quantité
    return;
  }
  if (btn.dataset.action === "qty-max") {
    const idx = parseInt(btn.dataset.idx, 10);
    const q = card.querySelector('.rx-qty-in[data-idx="' + idx + '"]');
    delete pharmaQtys()[entry.id + ":" + idx];
    q.value = String(medRemaining(lines[idx]));
    refreshRxLine(q.closest(".rx-line"), entry, idx, true);
    refreshRxSummary(card, entry, true);
    return;
  }
  if (btn.dataset.action === "servir") {
    const idx = parseInt(btn.dataset.idx, 10);
    const med = lines[idx], a = med ? pharmaAmounts(entry, med, idx) : null;
    if (!med || medDone(med) || !a.valid) return;
    const partial = a.qte < a.rest;
    askConfirm(
      "Confirmer la délivrance de « " + med.designation + " » — " + a.qte + " sur " + pharmaQty(med) + " prescrit" + (pharmaQty(med) > 1 ? "s" : "") +
      (partial ? " (livraison partielle : il restera " + (a.rest - a.qte) + " à servir ailleurs)" : "") +
      ", prix unitaire " + fmtFCFA(a.prix) + ", total " + fmtFCFA(a.total) + " (CNAMGS " + fmtFCFA(a.ass) + ", patient " + fmtFCFA(a.pat) + ") ?",
      () => serveLines(entry, [{ idx: idx, a: a }]),
      { title: partial ? "Confirmer la livraison partielle" : "Confirmer la délivrance", confirmLabel: "Servir", neutral: true }
    );
    return;
  }
  if (btn.dataset.action === "servir-tout") {
    const todo = lines.map((med, i) => ({ med: med, idx: i, a: pharmaAmounts(entry, med, i) })).filter(x => !medDone(x.med));
    if (!todo.length || todo.some(x => !x.a.valid)) return;
    const pat = todo.reduce((s, x) => s + x.a.pat, 0), ass = todo.reduce((s, x) => s + x.a.ass, 0);
    const partial = todo.filter(x => x.a.qte < x.a.rest).length;
    askConfirm(
      "Confirmer la délivrance des " + todo.length + " médicaments restants de cette ordonnance ? CNAMGS " + fmtFCFA(ass) + ", patient " + fmtFCFA(pat) + "." +
      (partial ? " " + partial + " ligne" + (partial > 1 ? "s sont" : " est") + " servie" + (partial > 1 ? "s" : "") + " partiellement." : ""),
      () => serveLines(entry, todo.map(x => ({ idx: x.idx, a: x.a }))),
      { title: "Confirmer la délivrance", confirmLabel: "Tout servir", neutral: true }
    );
  }
});

document.getElementById("pharmaSearchBtn").addEventListener("click", () => runPharmaSearch(document.getElementById("pharmaNagInput").value));
document.getElementById("pharmaNagInput").addEventListener("keydown", e => { if (e.key === "Enter") runPharmaSearch(e.target.value); });
// Le NAG est numérique (10 chiffres, affiché 3-3-3-1 par le masque de saisie) :
// la recherche part d'elle-même à la 10e saisie, et modifier le NAG efface
// l'ordonnance affichée.
document.getElementById("pharmaNagInput").addEventListener("input", e => {
  const digits = nagDigits(e.target.value);
  if (digits.length === 10) runPharmaSearch(digits);
  else if (state.pharma.nag) clearPharmaResults();
});
document.getElementById("pharmaDateInput").addEventListener("change", applyPharmaDate);
document.getElementById("pharmaDatesList").addEventListener("click", e => {
  const btn = e.target.closest(".pharma-date-item");
  if (btn) selectPharmaEntry(parseInt(btn.dataset.id, 10));
});

/* ---- Historique des délivrances (Espace Pharmacien) ---------------------- */

// Une pharmacie ne voit que ses propres délivrances ; sans établissement
// (administrateur), on voit toutes les pharmacies.
function pharmaHistoryScope() {
  const u = state.currentUser;
  return u && u.role === "Pharmacien" && u.etablissement ? u.etablissement : null;
}

// Toutes les LIVRAISONS de la pharmacie (une ligne d'ordonnance servie en plusieurs fois donne plusieurs lignes ici),
// de la plus récente à la plus ancienne. Tout vient de la base (table Ordonnance_delivrance) : quantité, prix unitaire,
// montant total, parts assurance / patient, pharmacie, pharmacien, date. « med » est une copie de la ligne d'ordonnance
// dont les champs de délivrance sont ceux de CETTE livraison (les écrans et rapports existants la lisent tels quels).
function pharmaHistoryRows() {
  const scope = pharmaHistoryScope();
  const rows = [];
  state.historique.forEach((h, order) => {
    (h.ordonnance || []).forEach((line, idx) => {
      medLivraisons(line).forEach((liv, k) => {
        if (!liv.servicePar) return;
        if (scope && liv.servicePar !== scope) return;
        const med = Object.assign({}, line, { quantite: String(liv.quantite), statut: "Servi", prixUnitaire: liv.prixUnitaire, partAssurance: liv.partAssurance,
          partPatient: liv.partPatient, servicePar: liv.servicePar, dateService: liv.dateService });
        rows.push({ h: h, med: med, liv: liv, line: line, order: order, idx: idx, k: k, iso: frToISO(liv.dateService), time: liv.heureService || "" });
      });
    });
  });
  rows.sort((a, b) => b.iso.localeCompare(a.iso) || b.time.localeCompare(a.time) || a.order - b.order || a.idx - b.idx || a.k - b.k);
  return rows;
}

function filteredPharmaHistory() {
  const q = document.getElementById("pharmaHistSearch").value.trim().toLowerCase();
  const from = document.getElementById("pharmaHistFrom").value;
  const to = document.getElementById("pharmaHistTo").value;
  return pharmaHistoryRows().filter(r => {
    if (from && (!r.iso || r.iso < from)) return false;
    if (to && (!r.iso || r.iso > to)) return false;
    if (q) {
      const hay = [r.h.patientNom, r.h.matricule, formatNag(r.h.matricule), r.med.designation, r.h.numero, r.h.medecin, r.liv.servicePar, r.liv.pharmacien].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function idTag(id) { return id != null && id !== "" ? '<div class="hint" style="margin:2px 0 0">n° ' + escapeHtml(String(id)) + "</div>" : ""; }

function renderPharmaHistory() {
  const scope = pharmaHistoryScope();
  const rows = filteredPharmaHistory();
  document.getElementById("pharmaHistScope").textContent = scope ? "Délivrances de " + scope : "Toutes les pharmacies";
  document.getElementById("pharmaHistCount").textContent = rows.length;
  document.getElementById("pharmaHistEmpty").hidden = rows.length > 0;
  document.getElementById("pharmaHistHead").innerHTML =
    '<tr><th>Date de délivrance</th><th>Patient</th><th>Médicament</th><th class="num">Qté servie</th><th class="num">Prix unitaire</th><th class="num">Montant total</th>' +
    '<th class="num">Part assurance</th><th class="num">Part patient</th><th>Pharmacie</th><th>Pharmacien</th><th>Feuille · prestation</th><th>Prescripteur</th></tr>';
  const histInfo = pageSlice("pharmaHist", rows, 10);
  renderPager("pharmaHistPager", "pharmaHist", histInfo, renderPharmaHistory, "délivrances");
  document.getElementById("pharmaHistBody").innerHTML = histInfo.items.map(r => {
    const prescrit = pharmaQty(r.line), partielle = !medDone(r.line);
    return "<tr>" +
      "<td>" + escapeHtml(r.liv.dateService || "—") + (r.liv.heureService ? '<div class="hint" style="margin:2px 0 0">' + escapeHtml(r.liv.heureService) + "</div>" : "") + "</td>" +
      '<td><span class="rapport-name">' + escapeHtml(r.h.patientNom || "—") + '</span><div class="hint" style="margin:2px 0 0">' + escapeHtml(formatNag(r.h.matricule)) + "</div></td>" +
      "<td>" + escapeHtml(r.med.designation) + "</td>" +
      '<td class="num"><b>' + escapeHtml(String(r.liv.quantite)) + "</b> / " + prescrit + (partielle ? '<div><span class="pill partiel">Partiel</span></div>' : "") + "</td>" +
      '<td class="num">' + fmtFCFA(num(r.liv.prixUnitaire)) + "</td>" +
      '<td class="num">' + fmtFCFA(num(r.liv.montantTotal)) + "</td>" +
      '<td class="num sum-paid">' + fmtFCFA(num(r.liv.partAssurance)) + "</td>" +
      '<td class="num">' + fmtFCFA(num(r.liv.partPatient)) + "</td>" +
      "<td>" + escapeHtml(r.liv.servicePar || "—") + idTag(r.liv.idPharmacie) + "</td>" +
      "<td>" + escapeHtml(r.liv.pharmacien || "—") + idTag(r.liv.idPharmacien) + "</td>" +
      "<td>" + escapeHtml(r.h.numero) + '<div class="hint" style="margin:2px 0 0">' + escapeHtml(prestationDateFR(r.h)) + "</div></td>" +
      "<td>" + escapeHtml(r.h.medecin || "—") + "</td>" +
    "</tr>";
  }).join("");

  const lead = document.getElementById("pharmaHistLead");
  const dl = document.getElementById("pharmaHistSummary");
  if (!rows.length) {
    lead.textContent = "Aucune délivrance pour ces filtres.";
    dl.innerHTML = "";
    return;
  }
  const patients = new Set(rows.map(r => String(r.h.matricule))).size;
  const ass = rows.reduce((a, r) => a + num(r.liv.partAssurance), 0);
  const pat = rows.reduce((a, r) => a + num(r.liv.partPatient), 0);
  const units = rows.reduce((a, r) => a + (parseInt(r.liv.quantite, 10) || 0), 0);
  lead.textContent = plural(rows.length, "livraison a été enregistrée", "livraisons ont été enregistrées") + " (" + plural(units, "unité", "unités") + ") pour " + plural(patients, "patient", "patients") +
    ". La CNAMGS prend en charge " + fmtFCFA(ass) + " et les patients règlent " + fmtFCFA(pat) + ".";
  dl.innerHTML =
    "<div><dt>Livraisons</dt><dd>" + rows.length + "</dd></div>" +
    "<div><dt>Unités délivrées</dt><dd>" + units + "</dd></div>" +
    "<div><dt>Patients servis</dt><dd>" + patients + "</dd></div>" +
    '<div class="sum-paid"><dt>Part assurance (CNAMGS)</dt><dd>' + fmtFCFA(ass) + "</dd></div>" +
    "<div><dt>Part des patients</dt><dd>" + fmtFCFA(pat) + "</dd></div>" +
    "<div><dt>Total délivré</dt><dd>" + fmtFCFA(ass + pat) + "</dd></div>";
}

function setPharmaTab(tab) {
  document.getElementById("pharmaTabToggle").dataset.active = tab;
  document.querySelectorAll("#pharmaTabToggle .chip").forEach(c => { c.classList.toggle("active", c.dataset.tab === tab); c.setAttribute("aria-selected", String(c.dataset.tab === tab)); });
  document.getElementById("pharma-tab-delivrer").hidden = tab !== "delivrer";
  document.getElementById("pharma-tab-historique").hidden = tab !== "historique";
  if (tab === "historique") {
    renderPharmaHistory();
    pullFeuilles(false).then(renderPharmaHistory).catch(() => {});
  }
}
document.querySelectorAll("#pharmaTabToggle .chip").forEach(c => c.addEventListener("click", () => setPharmaTab(c.dataset.tab)));
["pharmaHistSearch", "pharmaHistFrom", "pharmaHistTo"].forEach(id => document.getElementById(id).addEventListener("input", () => { resetPage("pharmaHist"); renderPharmaHistory(); }));
document.getElementById("pharmaHistReset").addEventListener("click", () => {
  document.getElementById("pharmaHistSearch").value = "";
  document.getElementById("pharmaHistFrom").value = "";
  document.getElementById("pharmaHistTo").value = "";
  resetPage("pharmaHist");
  renderPharmaHistory();
});

/* ---------------------------------------------------------------------- */
/* Paiements : règlement du reste dû ou avance, avancement en barre        */
/* ---------------------------------------------------------------------- */

// Avancement d'un compte partenaire (hôpital ou pharmacie) : montant dû et
// déjà payé. Ce qui est payé au-delà du dû est une avance ; elle se déduit
// d'elle-même des prochaines prestations puisque le reste est toujours
// « dû − payé ».
function payProgress(montantTotal, paye) {
  const reste = Math.max(0, montantTotal - paye);
  const avance = Math.max(0, paye - montantTotal);
  const pct = montantTotal > 0 ? Math.min(100, Math.round(paye / montantTotal * 100)) : (paye > 0 ? 100 : 0);
  const statut = paye <= 0 ? "Impayé" : (reste <= 0 ? "Payé" : "Partiellement payé");
  return { reste: reste, avance: avance, pct: pct, statut: statut };
}

function payStatutClass(statut) {
  return statut === "Payé" ? "validee" : (statut === "Impayé" ? "inactif" : "attente");
}
function payResteClass(p) {
  return p.reste <= 0 ? "" : (p.statut === "Impayé" ? "reste-unpaid" : "reste-partial");
}
// Couleur d'un avancement : rouge (0 %) → ambre → vert (100 %).
function payHealthColor(pct) {
  return "hsl(" + Math.round(pct * 1.15) + ", 62%, 40%)";
}
function attr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// Barre d'avancement d'une ligne de tableau : % du montant dû déjà payé, et l'avance éventuelle.
function payProgressCell(p) {
  const color = payHealthColor(p.pct);
  return '<div class="pay-cell"><div class="pay-bar"><span class="pay-seg" style="width:' + p.pct + "%;background:" + color + '"></span></div>' +
    '<div class="pay-pct" style="color:' + color + '">' + p.pct + " %" +
    (p.avance > 0 ? '<span class="pay-adv-tag">+ avance ' + fmtFCFA(p.avance) + "</span>" : "") + "</div></div>";
}

function plural(n, one, many) { return n + " " + (n > 1 ? many : one); }

// Résumé écrit sous le détail : une phrase, puis quelques lignes « libellé — valeur ».
function renderRapportSummary(kind, list) {
  const isHop = kind === "hopital";
  const lead = document.getElementById(isHop ? "hospLead" : "pharmaLead");
  const dl = document.getElementById(isHop ? "hospSummary" : "pharmaSummary");
  if (!list.length) {
    lead.textContent = "Aucune prestation validée pour ces filtres.";
    dl.innerHTML = "";
    return;
  }
  const sum = key => list.reduce((a, p) => a + (p[key] || 0), 0);
  const n = list.length, count = sum("count"), du = sum("montantTotal"), paye = sum("paye"), reste = sum("reste"), avance = sum("avance");
  const payeSurDu = list.reduce((a, p) => a + Math.min(p.paye, p.montantTotal), 0);
  const pct = du > 0 ? Math.round(payeSurDu / du * 100) : 0;

  const who = isHop
    ? plural(n, "hôpital a", "hôpitaux ont") + " réalisé " + plural(count, "prestation", "prestations") +
      " (" + plural(sum("consult"), "consultation", "consultations") + " et " + plural(sum("exam"), "examen", "examens") + ")"
    : plural(n, "pharmacie a", "pharmacies ont") + " servi " + plural(count, "médicament", "médicaments");
  lead.textContent = who.charAt(0).toUpperCase() + who.slice(1) + ". La CNAMGS " + (n > 1 ? "leur" : "lui") + " doit " + fmtFCFA(du) +
    " au total : " + fmtFCFA(paye) + " ont déjà été versés (" + pct + " % du montant dû)" +
    (avance > 0 ? ", dont " + fmtFCFA(avance) + " d'avance" : "") + ", il reste " + fmtFCFA(reste) + " à payer.";

  const rows = [
    [isHop ? "Hôpitaux concernés" : "Pharmacies concernées", n, "", ""],
    isHop
      ? ["Prestations réalisées", count, "", plural(sum("consult"), "consultation", "consultations") + " · " + plural(sum("exam"), "examen", "examens")]
      : ["Médicaments servis", count, "", ""],
    ["Montant total dû", fmtFCFA(du), "", ""],
    ["Déjà payé", fmtFCFA(paye), "sum-paid", pct + " % du montant dû"],
    ["Reste à payer", fmtFCFA(reste), "sum-reste", ""],
    ["Avances versées", fmtFCFA(avance), "sum-avance", avance > 0 ? "déduites des prochaines prestations" : ""]
  ];
  dl.innerHTML = rows.map(r =>
    '<div class="' + r[2] + '"><dt>' + r[0] + "</dt><dd>" + r[1] + (r[3] ? "<small>" + r[3] + "</small>" : "") + "</dd></div>"
  ).join("");
}

/* ---- Modale « Enregistrer un paiement » : règlement ou avance ------------ */

const PAY_KINDS = {
  hopital: { nom: "Hôpital", champ: "hopital", list: () => state.reglementsHopitaux, refresh: () => renderHopitalRapport() },
  pharmacie: { nom: "Pharmacie", champ: "pharmacie", list: () => state.reglements, refresh: () => renderPharmaRapport() }
};
let payCtx = null;          // { kind, name, total, paye, reste } du compte affiché dans la modale
let payType = "reglement";  // "reglement" (plafonné au reste dû) | "avance" (peut dépasser)
let payBusy = false;        // paiement enregistré, animation de fin en cours
let payTimer = null;
let payView = { newPct: 0, advPct: 0, advBeforePct: 0 };

function payEl(id) { return document.getElementById(id); }
function payAmount() {
  const n = Math.round(num(payEl("pay-montant").value));
  return n > 0 ? n : 0;
}

function openPaymentModal(kind, row) {
  if (!row) return;
  const cfg = PAY_KINDS[kind];
  const name = row[cfg.champ];
  payCtx = { kind: kind, name: name, total: row.montantTotal, paye: row.paye, reste: row.reste };
  payBusy = false;
  window.clearTimeout(payTimer);
  payEl("payNameLabel").textContent = cfg.nom;
  payEl("pay-name").value = name;
  payEl("pay-total").textContent = fmtFCFA(row.montantTotal);
  payEl("pay-paye").textContent = fmtFCFA(row.paye);
  payEl("pay-reste").textContent = fmtFCFA(row.reste);
  payEl("pay-montant").value = "";
  payEl("pay-montant").disabled = false;
  payEl("pay-note").value = "";
  payEl("payBar").classList.remove("saved");
  payEl("payFillBtn").disabled = row.reste <= 0;
  // La barre part de zéro et « avance » jusqu'à ce qui est déjà payé.
  ["payBarPaid", "payBarNew", "payBarAdv"].forEach(id => { const el = payEl(id); el.style.transition = "none"; el.style.width = "0%"; });
  document.getElementById("paymentModal").hidden = false;
  void payEl("payBar").offsetWidth;
  ["payBarPaid", "payBarNew", "payBarAdv"].forEach(id => { payEl(id).style.transition = ""; });
  setPayType(row.reste > 0 ? "reglement" : "avance");
  payEl("pay-montant").focus();
}

function closePaymentModal() {
  window.clearTimeout(payTimer);
  document.getElementById("paymentModal").hidden = true;
  // Fermée pendant l'animation de fin : le paiement est déjà enregistré, on rafraîchit quand même l'écran.
  if (payBusy && payCtx) PAY_KINDS[payCtx.kind].refresh();
  payBusy = false;
}

function setPayType(type) {
  payType = type;
  document.querySelectorAll("#payTypeChoices .chip").forEach(ch => {
    ch.classList.toggle("active", ch.dataset.type === type);
    if (ch.dataset.type === "reglement") ch.disabled = !payCtx || payCtx.reste <= 0;
  });
  payEl("payTypeHint").textContent = type === "avance"
    ? "Avance : peut dépasser le reste à payer ; l'excédent est crédité sur les prochaines prestations."
    : "Règlement : solde tout ou partie du reste à payer (au maximum " + fmtFCFA(payCtx ? payCtx.reste : 0) + ").";
  updatePayGauge();
}

// Barre du paiement : déjà payé (vert) + ce paiement (bleu) + avance (sarcelle),
// sur une échelle qui s'allonge au-delà du montant dû (repère noir) quand il y a une avance.
function updatePayGauge() {
  const c = payCtx;
  if (!c) return;
  const amt = payAmount();
  const applied = Math.min(amt, c.reste);            // part qui solde le reste dû
  const extra = amt - applied;                        // au-delà du reste : avance
  const over = payType === "reglement" && extra > 0;  // un règlement ne dépasse pas le reste
  const counted = over ? applied : amt;               // ce que la barre montre
  const extraShown = counted - applied;
  const prevAdvance = Math.max(0, c.paye - c.total);
  const paidDue = Math.min(c.paye, c.total);
  const scale = Math.max(c.total, c.paye + counted, 1);
  const pctW = v => v / scale * 100;

  payView = { newPct: pctW(applied), advPct: pctW(prevAdvance + extraShown), advBeforePct: pctW(prevAdvance) };
  payEl("payBarPaid").style.width = pctW(paidDue) + "%";
  payEl("payBarNew").style.width = payView.newPct + "%";
  payEl("payBarAdv").style.width = payView.advPct + "%";
  const tick = payEl("payBarTick");
  tick.hidden = scale <= c.total;
  tick.style.left = "calc(" + pctW(c.total) + "% - 1px)";

  const pct = paid => c.total > 0 ? Math.min(100, Math.round(Math.min(paid, c.total) / c.total * 100)) : (paid > 0 ? 100 : 0);
  payEl("pay-pct-before").textContent = pct(c.paye) + " %";
  payEl("pay-pct-after").textContent = pct(c.paye + counted) + " %";

  let msg, cls;
  if (!amt) { msg = "Saisissez le montant du paiement."; cls = ""; }
  else if (over) { msg = "Un règlement ne peut pas dépasser le reste à payer (" + fmtFCFA(c.reste) + "). Choisissez « Avance » pour verser davantage."; cls = "err"; }
  else if (extra > 0) { msg = fmtFCFA(extra) + " d'avance seront crédités sur les prochaines prestations" + (applied > 0 ? " ; " + fmtFCFA(applied) + " soldent le reste dû." : "."); cls = "adv"; }
  else if (c.reste > 0 && applied >= c.reste) { msg = "Ce paiement solde le reste dû."; cls = "ok"; }
  else { msg = "Après ce paiement, il restera " + fmtFCFA(c.reste - applied) + " à payer."; cls = "info"; }
  if (!payBusy) {
    payEl("payMsg").textContent = msg;
    payEl("payMsg").className = "pay-msg" + (cls ? " " + cls : "");
  }
  payEl("paySubmitBtn").disabled = payBusy || !amt || over;
}

payEl("pay-montant").addEventListener("input", updatePayGauge);
payEl("payFillBtn").addEventListener("click", () => {
  if (!payCtx || payCtx.reste <= 0) return;
  payEl("pay-montant").value = payCtx.reste;
  setPayType("reglement");
});
document.querySelectorAll("#payTypeChoices .chip").forEach(ch => {
  ch.addEventListener("click", () => { if (!ch.disabled && !payBusy) setPayType(ch.dataset.type); });
});
payEl("closePaymentModal").addEventListener("click", closePaymentModal);
payEl("cancelPaymentModal").addEventListener("click", closePaymentModal);

payEl("paymentForm").addEventListener("submit", async e => {
  e.preventDefault();
  const c = payCtx;
  if (!c || payBusy) return;
  const amt = payAmount();
  if (!amt || (payType === "reglement" && amt > c.reste)) return;

  const cfg = PAY_KINDS[c.kind];
  // Le paiement est d'abord enregistré dans la base ; l'animation ne joue que si le serveur l'a accepté.
  payBusy = true;
  payEl("paySubmitBtn").disabled = true;
  payEl("payMsg").textContent = "Enregistrement du paiement…";
  payEl("payMsg").className = "pay-msg info";
  const noteText = payEl("pay-note").value.trim();
  let saved = null;
  try {
    saved = await apiCreateReglement({ kind: c.kind, structure: c.name, montant: amt, type: payType, note: noteText });
  } catch (err) {
    payBusy = false;
    payEl("paySubmitBtn").disabled = false;
    payEl("payMsg").textContent = err.unavailable ? "Le serveur ne propose pas encore l'enregistrement des paiements (POST /api/reglements à créer)." : err.message;
    payEl("payMsg").className = "pay-msg err";
    return;
  }
  const rec = mapReglement(Object.assign({ id_reglement: Date.now(), kind: c.kind, structure: c.name, montant: amt, type: payType, note: noteText, date: new Date().toISOString().slice(0, 10) }, saved || {}));
  cfg.list().push(rec);
  audit("paiement.enregistrer", { ressourceType: c.kind === "hopital" ? "Hôpital" : "Pharmacie", ressourceLibelle: c.name, apres: { montant: amt, type: payType, note: rec.note } });

  // « Chargement » : la barre avance jusqu'au nouveau total, puis passe au vert.
  payBusy = true;
  payEl("pay-montant").disabled = true;
  payEl("payFillBtn").disabled = true;
  payEl("paySubmitBtn").disabled = true;
  document.querySelectorAll("#payTypeChoices .chip").forEach(ch => { ch.disabled = true; });
  payEl("payMsg").textContent = "Enregistrement du paiement…";
  payEl("payMsg").className = "pay-msg info";
  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const bar = payEl("payBar");
  const seg = payEl("payBarNew");
  const adv = payEl("payBarAdv");
  if (!reduced) {
    seg.style.transition = "none"; adv.style.transition = "none";
    seg.style.width = "0%"; adv.style.width = payView.advBeforePct + "%";
    void bar.offsetWidth;
    seg.style.transition = "width .8s cubic-bezier(.4, 0, .2, 1), background-color .4s ease";
    adv.style.transition = "width .8s cubic-bezier(.4, 0, .2, 1)";
    seg.style.width = payView.newPct + "%";
    adv.style.width = payView.advPct + "%";
  }
  payTimer = window.setTimeout(() => {
    bar.classList.add("saved");
    payEl("payMsg").textContent = "Paiement enregistré.";
    payEl("payMsg").className = "pay-msg ok";
    payEl("pay-pct-before").textContent = payEl("pay-pct-after").textContent;
    payTimer = window.setTimeout(() => { closePaymentModal(); }, reduced ? 0 : 650);
  }, reduced ? 0 : 850);
});

/* ---------------------------------------------------------------------- */
/* Tableau de bord : suivi des prestations des pharmacies partenaires      */
/* ---------------------------------------------------------------------- */

function fmtFCFA(n) { return fmt(n) + " FCFA"; }

// Toutes les lignes de médicaments effectivement servies (données réelles,
// issues de state.historique[].ordonnance — voir l'espace Pharmacien).
function getServedMedicaments() {
  // une entrée par LIVRAISON : une ligne servie en deux fois par deux pharmacies compte pour chacune (sa part)
  const meds = [];
  state.historique.forEach(h => {
    (h.ordonnance || []).forEach(line => {
      medLivraisons(line).forEach(l => {
        if (!l.servicePar) return;
        meds.push(Object.assign({}, line, { quantite: String(l.quantite), statut: "Servi", prixUnitaire: l.prixUnitaire, partAssurance: l.partAssurance,
          partPatient: l.partPatient, servicePar: l.servicePar, dateService: l.dateService }));
      });
    });
  });
  return meds;
}

const EMPTY_PHARMA_FILTERS = { from: "", to: "", pharmacie: "", statut: "" };

function getPharmaSuiviPeriodFiltered(filters) {
  const f = filters || EMPTY_PHARMA_FILTERS;
  return getServedMedicaments().filter(med => {
    if (f.pharmacie && med.servicePar !== f.pharmacie) return false;
    if (f.from || f.to) {
      const d = parseFRDate(med.dateService);
      if (!d) return false;
      if (f.from && d < new Date(f.from)) return false;
      if (f.to && d > new Date(f.to + "T23:59:59")) return false;
    }
    return true;
  });
}

// Agrège les prestations servies par pharmacie et applique les règlements
// réels enregistrés (state.reglements) : reste à payer = montant total - montant payé.
// Sans filtres (dashboard) : vue globale, toutes pharmacies, toute la période.
function getPharmacieAggregates(filters) {
  const f = filters || EMPTY_PHARMA_FILTERS;
  const meds = getPharmaSuiviPeriodFiltered(f);
  const byPharma = {};
  meds.forEach(med => {
    const key = med.servicePar;
    if (!byPharma[key]) byPharma[key] = { pharmacie: key, count: 0, montantTotal: 0 };
    byPharma[key].count++;
    byPharma[key].montantTotal += num(med.partAssurance);
  });

  const paidByPharma = {};
  state.reglements.forEach(r => { paidByPharma[r.pharmacie] = (paidByPharma[r.pharmacie] || 0) + num(r.montant); });

  let list = Object.keys(byPharma).map(key => {
    const p = byPharma[key];
    const paye = paidByPharma[key] || 0;
    const pr = payProgress(p.montantTotal, paye);
    return { pharmacie: p.pharmacie, count: p.count, montantTotal: p.montantTotal, paye: paye, reste: pr.reste, avance: pr.avance, pct: pr.pct, statut: pr.statut };
  });

  if (f.statut) list = list.filter(p => p.statut === f.statut);
  list.sort((a, b) => b.reste - a.reste);
  return list;
}

// Noms des structures partenaires de la base (Structure.type_structure : « hopital » ou « pharmacie »).
function partnerNames(type) {
  return Array.from(new Set((state.structures || []).filter(st => st.type_structure === type).map(st => st.raison_sociale).filter(Boolean))).sort();
}

// Nombre de pharmacies partenaires enregistrées (table Structure, type pharmacie) —
// un décompte du réseau, indépendant de la période/du statut de règlement.
function getPartnerPharmacyCount(filters) {
  const f = filters || EMPTY_PHARMA_FILTERS;
  const names = new Set(partnerNames("pharmacie"));
  if (f.pharmacie) return names.has(f.pharmacie) ? 1 : 0;
  return names.size;
}

function monthLabel(b) {
  const name = MOIS[b.month];
  return name.charAt(0).toUpperCase() + name.slice(1) + " " + b.year;
}

// Diagramme en barres générique (HTML/CSS, comme les marqueurs du graphique
// d'évolution PEC) : items = [{ label, value, ... }], opts = { color, tooltip(it) }.
function renderBarChart(containerId, tooltipId, items, opts) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  if (!items.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:30px 0">Aucune donnée pour ces filtres.</div>';
    return;
  }

  const maxVal = Math.max(1, ...items.map(it => it.value));
  wrap.innerHTML = '<div class="pharma-bar-wrap">' + items.map((it, i) => {
    const pct = Math.max(2, Math.round((it.value / maxVal) * 100));
    return '<div class="pharma-bar-col">' +
      '<div class="pharma-bar" style="height:' + pct + '%;background:' + (opts.color || "var(--blue)") + '" data-idx="' + i + '"></div>' +
      '<div class="pharma-bar-label">' + it.label + "</div>" +
    "</div>";
  }).join("") + "</div>";

  const tooltip = document.getElementById(tooltipId);
  if (!tooltip) return;
  const outer = wrap.parentElement;
  wrap.querySelectorAll(".pharma-bar").forEach(bar => {
    const it = items[parseInt(bar.dataset.idx, 10)];
    const show = evt => {
      const outerRect = outer.getBoundingClientRect();
      tooltip.style.left = (evt.clientX - outerRect.left) + "px";
      tooltip.style.top = (bar.getBoundingClientRect().top - outerRect.top) + "px";
      tooltip.innerHTML = opts.tooltip(it);
      tooltip.hidden = false;
    };
    bar.addEventListener("mouseenter", show);
    bar.addEventListener("mousemove", show);
    bar.addEventListener("mouseleave", () => { tooltip.hidden = true; });
  });
}

function renderPharmaSuiviTable(list) {
  const body = document.getElementById("pharmaSuiviBody");
  const empty = document.getElementById("pharmaSuiviEmpty");
  body.innerHTML = "";
  empty.hidden = list.length > 0;

  const info = pageSlice("pharmaSuivi", list, 8);
  renderPager("pharmaSuiviPager", "pharmaSuivi", info, () => renderPharmaSuiviTable(list), "pharmacies");
  info.items.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="rapport-name">' + escapeHtml(p.pharmacie) + "</td>" +
      '<td class="num">' + p.count + "</td>" +
      '<td class="num">' + fmtFCFA(p.montantTotal) + "</td>" +
      '<td class="num sum-paid">' + fmtFCFA(p.paye) + "</td>" +
      '<td class="num ' + payResteClass(p) + '">' + fmtFCFA(p.reste) + "</td>" +
      "<td>" + payProgressCell(p) + "</td>" +
      '<td><span class="pill ' + payStatutClass(p.statut) + '">' + p.statut + "</span></td>" +
      '<td class="row-actions"><button type="button" class="btn-secondary btn-sm" data-action="regler" data-name="' + attr(p.pharmacie) + '">Enregistrer un paiement</button></td>';
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-action="regler"]').forEach(btn => {
    btn.addEventListener("click", () => openPaymentModal("pharmacie", list.find(x => x.pharmacie === btn.dataset.name)));
  });
}

// Dashboard : vue synthétique, toujours globale (aucun filtre) — cartes + graphiques.
// Dashboard : uniquement les chiffres-clés, aucun graphique (page d'accueil minimale).
function renderPharmaDashboard() {
  const aggregates = getPharmacieAggregates(null);
  const totalPrestations = aggregates.reduce((a, p) => a + p.count, 0);
  const totalMontant = aggregates.reduce((a, p) => a + p.montantTotal, 0);
  const totalReste = aggregates.reduce((a, p) => a + p.reste, 0);

  document.getElementById("pharmaStatCount").textContent = getPartnerPharmacyCount(null);
  document.getElementById("pharmaStatPrestations").textContent = totalPrestations;
  document.getElementById("pharmaStatMontant").textContent = fmtFCFA(totalMontant);
  document.getElementById("pharmaStatReste").textContent = fmtFCFA(totalReste);

  renderPharmaOverview();
}

// Page Rapports (onglet Pharmacies) : le détail par pharmacie d'abord, puis un
// résumé écrit — plus de graphiques.
function renderPharmaRapport() {
  const aggregates = getPharmacieAggregates(state.pharmaSuiviFilters);
  renderPharmaSuiviTable(aggregates);
  renderRapportSummary("pharmacie", aggregates);
}

function populatePharmaFilterOptions() {
  const sel = document.getElementById("pharmaFilterPharmacie");
  const current = sel.value;
  const names = partnerNames("pharmacie");
  sel.innerHTML = '<option value="">Toutes les pharmacies</option>' + names.map(n => '<option value="' + n.replace(/"/g, "&quot;") + '">' + n + "</option>").join("");
  sel.value = current;
}

["pharmaFilterFrom", "pharmaFilterTo", "pharmaFilterPharmacie", "pharmaFilterStatut"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    state.pharmaSuiviFilters = {
      from: document.getElementById("pharmaFilterFrom").value,
      to: document.getElementById("pharmaFilterTo").value,
      pharmacie: document.getElementById("pharmaFilterPharmacie").value,
      statut: document.getElementById("pharmaFilterStatut").value
    };
    renderPharmaRapport();
  });
});
document.getElementById("pharmaFilterResetBtn").addEventListener("click", () => {
  document.getElementById("pharmaFilterFrom").value = "";
  document.getElementById("pharmaFilterTo").value = "";
  document.getElementById("pharmaFilterPharmacie").value = "";
  document.getElementById("pharmaFilterStatut").value = "";
  state.pharmaSuiviFilters = { from: "", to: "", pharmacie: "", statut: "" };
  renderPharmaRapport();
});

/* ---------------------------------------------------------------------- */
/* Tableau de bord : suivi des prestations des hôpitaux partenaires        */
/* ---------------------------------------------------------------------- */

// Une feuille de soins validée = une prestation réellement réalisée par
// l'hôpital (medecinEtab). Montant dû à l'hôpital = totalPart, c'est-à-dire
// le champ déjà existant "Total à payer par la CNAMGS" (pas le montant total
// facturé, qui inclut la part du patient).
const EMPTY_HOPITAL_FILTERS = { from: "", to: "", hopital: "", type: "", statut: "", fonds: "", medecin: "" };

function getHopitalSuiviFiltered(filters) {
  const f = filters || EMPTY_HOPITAL_FILTERS;
  return state.historique.filter(h => {
    if (h.statut !== "Validée" || !h.medecinEtab) return false;
    if (f.hopital && h.medecinEtab !== f.hopital) return false;
    if (f.type && h.type !== f.type) return false;
    if (f.fonds && h.fonds !== f.fonds) return false;
    if (f.medecin && h.medecin !== f.medecin) return false;
    if (f.from || f.to) {
      const d = parseFRDate(h.date);
      if (!d) return false;
      if (f.from && d < new Date(f.from)) return false;
      if (f.to && d > new Date(f.to + "T23:59:59")) return false;
    }
    return true;
  });
}

// Sans filtres (dashboard) : vue globale, tous hôpitaux, toute la période.
function getHopitalAggregates(filters) {
  const f = filters || EMPTY_HOPITAL_FILTERS;
  const entries = getHopitalSuiviFiltered(f);
  const byHopital = {};
  entries.forEach(h => {
    const key = h.medecinEtab;
    if (!byHopital[key]) byHopital[key] = { hopital: key, consult: 0, exam: 0, montantTotal: 0 };
    if (h.type === "Consultation") byHopital[key].consult++;
    else if (h.type === "Examen") byHopital[key].exam++;
    byHopital[key].montantTotal += num(h.totalPart);
  });

  const paidByHopital = {};
  state.reglementsHopitaux.forEach(r => { paidByHopital[r.hopital] = (paidByHopital[r.hopital] || 0) + num(r.montant); });

  let list = Object.keys(byHopital).map(key => {
    const h = byHopital[key];
    const paye = paidByHopital[key] || 0;
    const pr = payProgress(h.montantTotal, paye);
    return { hopital: h.hopital, consult: h.consult, exam: h.exam, count: h.consult + h.exam, montantTotal: h.montantTotal, paye: paye, reste: pr.reste, avance: pr.avance, pct: pr.pct, statut: pr.statut };
  });

  if (f.statut) list = list.filter(p => p.statut === f.statut);
  list.sort((a, b) => b.reste - a.reste);
  return list;
}

// Nombre d'hôpitaux partenaires enregistrés (table Structure, type hôpital) —
// un décompte du réseau, indépendant de la période/du statut de règlement.
function getPartnerHospitalCount(filters) {
  const f = filters || EMPTY_HOPITAL_FILTERS;
  const names = new Set(partnerNames("hopital"));
  if (f.hopital) return names.has(f.hopital) ? 1 : 0;
  return names.size;
}

function getHopitalEvolutionByMonth(entries) {
  const buckets = {};
  entries.forEach(h => {
    const d = parseFRDate(h.date);
    if (!d) return;
    const key = d.getFullYear() + "-" + pad(d.getMonth() + 1);
    if (!buckets[key]) buckets[key] = { key: key, year: d.getFullYear(), month: d.getMonth(), consult: 0, exam: 0, montant: 0 };
    if (h.type === "Consultation") buckets[key].consult++;
    else if (h.type === "Examen") buckets[key].exam++;
    buckets[key].montant += num(h.totalPart);
  });
  return Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));
}

// Diagramme en barres groupées (2 séries par catégorie, ex. Consultations /
// Examens) : items = [{ label, a, b, montant }], opts = { tooltip(it) }.
function renderGroupedBarChart(containerId, tooltipId, items, opts) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  if (!items.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:30px 0">Aucune donnée pour ces filtres.</div>';
    return;
  }

  const maxVal = Math.max(1, ...items.map(it => Math.max(it.a, it.b)));
  wrap.innerHTML = '<div class="pharma-bar-wrap">' + items.map((it, i) => {
    const pctA = Math.max(2, Math.round((it.a / maxVal) * 100));
    const pctB = Math.max(2, Math.round((it.b / maxVal) * 100));
    return '<div class="pharma-bar-col">' +
      '<div class="pharma-bar-pair" data-idx="' + i + '">' +
        '<div class="pharma-bar" style="height:' + pctA + '%;background:var(--green)"></div>' +
        '<div class="pharma-bar" style="height:' + pctB + '%;background:var(--blue)"></div>' +
      "</div>" +
      '<div class="pharma-bar-label">' + it.label + "</div>" +
    "</div>";
  }).join("") + "</div>";

  const tooltip = document.getElementById(tooltipId);
  if (!tooltip) return;
  const outer = wrap.parentElement;
  wrap.querySelectorAll(".pharma-bar-pair").forEach(pair => {
    const it = items[parseInt(pair.dataset.idx, 10)];
    const show = evt => {
      const outerRect = outer.getBoundingClientRect();
      tooltip.style.left = (evt.clientX - outerRect.left) + "px";
      tooltip.style.top = (pair.getBoundingClientRect().top - outerRect.top) + "px";
      tooltip.innerHTML = opts.tooltip(it);
      tooltip.hidden = false;
    };
    pair.addEventListener("mouseenter", show);
    pair.addEventListener("mousemove", show);
    pair.addEventListener("mouseleave", () => { tooltip.hidden = true; });
  });
}

function renderHopitalSuiviTable(list) {
  const body = document.getElementById("hospSuiviBody");
  const empty = document.getElementById("hospSuiviEmpty");
  body.innerHTML = "";
  empty.hidden = list.length > 0;

  const info = pageSlice("hospSuivi", list, 8);
  renderPager("hospSuiviPager", "hospSuivi", info, () => renderHopitalSuiviTable(list), "hôpitaux");
  info.items.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="rapport-name">' + escapeHtml(p.hopital) + "</td>" +
      '<td class="num">' + p.consult + "</td>" +
      '<td class="num">' + p.exam + "</td>" +
      '<td class="num"><b>' + p.count + "</b></td>" +
      '<td class="num">' + fmtFCFA(p.montantTotal) + "</td>" +
      '<td class="num sum-paid">' + fmtFCFA(p.paye) + "</td>" +
      '<td class="num ' + payResteClass(p) + '">' + fmtFCFA(p.reste) + "</td>" +
      "<td>" + payProgressCell(p) + "</td>" +
      '<td><span class="pill ' + payStatutClass(p.statut) + '">' + p.statut + "</span></td>" +
      '<td class="row-actions"><button type="button" class="btn-secondary btn-sm" data-action="regler-hopital" data-name="' + attr(p.hopital) + '">Enregistrer un paiement</button></td>';
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-action="regler-hopital"]').forEach(btn => {
    btn.addEventListener("click", () => openPaymentModal("hopital", list.find(x => x.hopital === btn.dataset.name)));
  });
}

// Dashboard : vue synthétique, toujours globale (aucun filtre) — cartes + graphiques.
// Dashboard : uniquement les chiffres-clés, aucun graphique (page d'accueil minimale).
// L'évolution mensuelle consultations/examens est désormais uniquement dans
// Rapports > Vue d'ensemble (renderStatistiques), pour éviter le doublon.
function renderHopitalDashboard() {
  const aggregates = getHopitalAggregates(null);
  const totalConsult = aggregates.reduce((a, p) => a + p.consult, 0);
  const totalExam = aggregates.reduce((a, p) => a + p.exam, 0);
  const totalMontant = aggregates.reduce((a, p) => a + p.montantTotal, 0);
  const totalReste = aggregates.reduce((a, p) => a + p.reste, 0);

  document.getElementById("hospStatCount").textContent = getPartnerHospitalCount(null);
  document.getElementById("hospStatPrestations").textContent = totalConsult + totalExam;
  document.getElementById("hospStatMontant").textContent = fmtFCFA(totalMontant);
  document.getElementById("hospStatReste").textContent = fmtFCFA(totalReste);

  renderHopitalOverview();
}

// Page Rapports (onglet Hôpitaux) : le détail par hôpital d'abord, puis un
// résumé écrit — plus de graphiques.
function renderHopitalRapport() {
  const aggregates = getHopitalAggregates(state.hopitalSuiviFilters);
  renderHopitalSuiviTable(aggregates);
  renderRapportSummary("hopital", aggregates);
}

function populateHospFilterOptions() {
  const sel = document.getElementById("hospFilterHopital");
  const current = sel.value;
  const names = partnerNames("hopital");
  sel.innerHTML = '<option value="">Tous les hôpitaux</option>' + names.map(n => '<option value="' + n.replace(/"/g, "&quot;") + '">' + n + "</option>").join("");
  sel.value = current;

  const medSel = document.getElementById("hospFilterMedecin");
  const currentMed = medSel.value;
  const medNames = Array.from(new Set(state.historique.map(h => h.medecin).filter(Boolean))).sort();
  medSel.innerHTML = '<option value="">Tous les médecins</option>' + medNames.map(n => '<option value="' + n.replace(/"/g, "&quot;") + '">' + n + "</option>").join("");
  medSel.value = currentMed;
}

["hospFilterFrom", "hospFilterTo", "hospFilterHopital", "hospFilterType", "hospFilterStatut", "hospFilterFonds", "hospFilterMedecin"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    state.hopitalSuiviFilters = {
      from: document.getElementById("hospFilterFrom").value,
      to: document.getElementById("hospFilterTo").value,
      hopital: document.getElementById("hospFilterHopital").value,
      type: document.getElementById("hospFilterType").value,
      statut: document.getElementById("hospFilterStatut").value,
      fonds: document.getElementById("hospFilterFonds").value,
      medecin: document.getElementById("hospFilterMedecin").value
    };
    renderHopitalRapport();
  });
});
document.getElementById("hospFilterResetBtn").addEventListener("click", () => {
  document.getElementById("hospFilterFrom").value = "";
  document.getElementById("hospFilterTo").value = "";
  document.getElementById("hospFilterHopital").value = "";
  document.getElementById("hospFilterType").value = "";
  document.getElementById("hospFilterStatut").value = "";
  document.getElementById("hospFilterFonds").value = "";
  document.getElementById("hospFilterMedecin").value = "";
  state.hopitalSuiviFilters = { from: "", to: "", hopital: "", type: "", statut: "", fonds: "", medecin: "" };
  renderHopitalRapport();
});

/* ---------------------------------------------------------------------- */
/* Dashboard : aperçu Direction (hôpitaux) — agrégats globaux, non filtrés */
/* ---------------------------------------------------------------------- */

// Barre de répartition en pourcentage (segments = [{ label, value, color }]).
function renderSplitBar(barId, legendId, segments) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const bar = document.getElementById(barId);
  const legend = document.getElementById(legendId);
  if (!total) {
    bar.innerHTML = '<div class="split-bar-empty"></div>';
    legend.innerHTML = '<div class="empty-state" style="padding:6px 0">Aucune donnée disponible.</div>';
    return;
  }
  bar.innerHTML = segments.filter(s => s.value > 0).map(s => {
    const pct = (s.value / total) * 100;
    return '<div class="split-seg" style="width:' + pct + '%;background:' + s.color + '" title="' + s.label + " — " + Math.round(pct) + '%"></div>';
  }).join("");
  legend.innerHTML = segments.map(s => {
    const pct = total ? Math.round((s.value / total) * 100) : 0;
    return '<div class="split-legend-item"><span class="split-dot" style="background:' + s.color + '"></span>' + s.label + " <b>" + s.value + "</b> <span class=\"split-pct\">(" + pct + "%)</span></div>";
  }).join("");
}

// Compléments de la section hôpitaux du dashboard : répartitions type/fonds,
// évolution des prises en charge, top établissements.
function renderHopitalOverview() {
  const all = state.historique;
  const consultCount = all.filter(h => h.type === "Consultation").length;
  const examCount = all.filter(h => h.type === "Examen").length;

  renderSplitBar("statsTypeSplit", "statsTypeLegend", [
    { label: "Consultations", value: consultCount, color: "var(--green)" },
    { label: "Examens", value: examCount, color: "var(--blue)" }
  ]);

  const fondsList = ["Fonds Secteur Privé", "Fonds Secteur Public", "Fonds Garantie Sociale"];
  const fondsColors = ["var(--blue)", "var(--green)", "var(--yellow-dark)"];
  renderSplitBar("statsFondsSplit", "statsFondsLegend",
    fondsList.map((f, i) => ({ label: f.replace("Fonds ", ""), value: all.filter(h => h.fonds === f).length, color: fondsColors[i] }))
  );

  const monthBuckets = getHopitalEvolutionByMonth(all);
  renderGroupedBarChart("statsEvoChart", "statsEvoTooltip",
    monthBuckets.map(b => ({ label: monthLabel(b), a: b.consult, b: b.exam, montant: b.montant })),
    { tooltip: it => "<b>" + it.label + "</b><br>Consultations : " + it.a + "<br>Examens : " + it.b + "<br>Part CNAMGS : " + fmtFCFA(it.montant) }
  );

  const hopAgg = getHopitalAggregates(null);
  renderBarChart("statsTopHopChart", "statsTopHopTooltip",
    hopAgg.slice(0, 8).map(h => ({ label: h.hopital, value: h.montantTotal })),
    { color: "var(--green)", tooltip: it => "<b>" + it.label + "</b> — " + fmtFCFA(it.value) }
  );
}

// Complément de la section pharmacies du dashboard : classement par montant.
function renderPharmaOverview() {
  const pharmaAgg = getPharmacieAggregates(null);
  renderBarChart("statsTopPharmChart", "statsTopPharmTooltip",
    pharmaAgg.slice(0, 8).map(p => ({ label: p.pharmacie, value: p.montantTotal })),
    { color: "var(--blue)", tooltip: it => "<b>" + it.label + "</b> — " + fmtFCFA(it.value) }
  );
}

// Rapports : pas une capture de la page, mais un vrai document généré à partir
// des données actuellement affichées (filtres + onglet actif), avec en-tête
// CNAMGS — imprimé seul, le reste de l'app étant masqué (voir @media print).
function buildRapportReportHtml(tab) {
  let title, filtersParts, theadHtml, rowsHtml, totals;
  const kpiLabels = { count: "Établissement(s)", montant: "Montant total dû", paye: "Déjà payé", reste: "Reste à payer", avance: "Avances versées" };

  if (tab === "pharmacies") {
    const f = state.pharmaSuiviFilters;
    const list = getPharmacieAggregates(f);
    title = "Rapport — Prestations des pharmacies partenaires";
    filtersParts = [
      f.from ? "Du " + f.from : null,
      f.to ? "au " + f.to : null,
      f.pharmacie ? "Pharmacie : " + f.pharmacie : null,
      f.statut ? "Statut : " + f.statut : null
    ];
    totals = {
      count: list.length,
      montant: list.reduce((a, p) => a + p.montantTotal, 0),
      paye: list.reduce((a, p) => a + p.paye, 0),
      reste: list.reduce((a, p) => a + p.reste, 0),
      avance: list.reduce((a, p) => a + p.avance, 0)
    };
    theadHtml = "<tr><th>Pharmacie</th><th>Prestations</th><th>Montant total</th><th>Montant payé</th><th>Reste à payer</th><th>Statut</th></tr>";
    rowsHtml = list.length
      ? list.map(p => "<tr><td>" + p.pharmacie + "</td><td>" + p.count + "</td><td>" + fmtFCFA(p.montantTotal) + "</td><td>" + fmtFCFA(p.paye) + "</td><td>" + fmtFCFA(p.reste) + "</td><td>" + p.statut + "</td></tr>").join("")
      : '<tr><td colspan="6" style="text-align:center">Aucune donnée pour ces filtres.</td></tr>';
  } else {
    const f = state.hopitalSuiviFilters;
    const list = getHopitalAggregates(f);
    title = "Rapport — Prestations des hôpitaux partenaires";
    filtersParts = [
      f.from ? "Du " + f.from : null,
      f.to ? "au " + f.to : null,
      f.hopital ? "Hôpital : " + f.hopital : null,
      f.type ? "Type : " + f.type : null,
      f.statut ? "Statut : " + f.statut : null,
      f.fonds ? "Fonds : " + f.fonds : null,
      f.medecin ? "Médecin : " + f.medecin : null
    ];
    totals = {
      count: list.length,
      montant: list.reduce((a, p) => a + p.montantTotal, 0),
      paye: list.reduce((a, p) => a + p.paye, 0),
      reste: list.reduce((a, p) => a + p.reste, 0),
      avance: list.reduce((a, p) => a + p.avance, 0)
    };
    theadHtml = "<tr><th>Hôpital</th><th>Consultations</th><th>Examens</th><th>Total</th><th>Montant total</th><th>Montant payé</th><th>Reste à payer</th><th>Statut</th></tr>";
    rowsHtml = list.length
      ? list.map(p => "<tr><td>" + p.hopital + "</td><td>" + p.consult + "</td><td>" + p.exam + "</td><td>" + p.count + "</td><td>" + fmtFCFA(p.montantTotal) + "</td><td>" + fmtFCFA(p.paye) + "</td><td>" + fmtFCFA(p.reste) + "</td><td>" + p.statut + "</td></tr>").join("")
      : '<tr><td colspan="8" style="text-align:center">Aucune donnée pour ces filtres.</td></tr>';
  }

  const filtersSummary = filtersParts.filter(Boolean).join(" · ") || "Toutes périodes, tous établissements";

  return '<div class="report-doc">' +
    '<div class="report-head">' +
      '<img src="CNAMGS.png" alt="CNAMGS" />' +
      '<div><h1>' + title + '</h1><p>Caisse Nationale d’Assurance Maladie et de Garantie Sociale</p></div>' +
    "</div>" +
    '<div class="report-meta">' +
      "<div><b>Filtres appliqués</b><span>" + filtersSummary + "</span></div>" +
      "<div><b>Généré le</b><span>" + todayFR() + "</span></div>" +
    "</div>" +
    '<div class="report-kpis">' +
      "<div><b>" + totals.count + "</b><span>" + kpiLabels.count + "</span></div>" +
      "<div><b>" + fmtFCFA(totals.montant) + "</b><span>" + kpiLabels.montant + "</span></div>" +
      "<div><b>" + fmtFCFA(totals.paye) + "</b><span>" + kpiLabels.paye + "</span></div>" +
      "<div><b>" + fmtFCFA(totals.reste) + "</b><span>" + kpiLabels.reste + "</span></div>" +
      "<div><b>" + fmtFCFA(totals.avance) + "</b><span>" + kpiLabels.avance + "</span></div>" +
    "</div>" +
    '<table class="report-table"><thead>' + theadHtml + "</thead><tbody>" + rowsHtml + "</tbody></table>" +
    '<div class="report-footer">CNAMGS — Plateforme de gestion du circuit de l’assuré · Rapport généré automatiquement (prototype front-end)</div>' +
  "</div>";
}

document.getElementById("rapportsExportBtn").addEventListener("click", () => {
  const activeChip = document.querySelector("#rapportsTabToggle .chip.active");
  const tab = activeChip ? activeChip.dataset.tab : "hopitaux";
  document.getElementById("reportPrintArea").innerHTML = buildRapportReportHtml(tab);
  audit("rapport.exporter", { ressourceType: "Rapport", ressourceLibelle: tab === "pharmacies" ? "Pharmacies" : "Hôpitaux", message: "Export PDF / impression" });
  document.body.classList.add("printing-report");
  window.print();
  document.body.classList.remove("printing-report");
});

// Export de l'historique complet (selon les filtres actifs) : mêmes règles
// d'impression que Rapports/Statistiques, tableau classé par feuille.
function buildHistoriqueReportHtml() {
  const f = state.historiqueFilters;
  const list = getFilteredHistorique();
  const filtersParts = [
    f.from ? "Du " + f.from : null,
    f.to ? "au " + f.to : null,
    f.type ? "Type : " + f.type : null,
    f.statut ? "Statut : " + f.statut : null,
    f.search ? "Recherche : " + f.search : null
  ];
  const filtersSummary = filtersParts.filter(Boolean).join(" · ") || "Toutes périodes, tous types, tous statuts";
  const totals = {
    count: list.length,
    montant: list.reduce((a, h) => a + num(h.totalMontant), 0),
    part: list.reduce((a, h) => a + num(h.totalPart), 0)
  };

  const rowsHtml = list.length
    ? list.map(h =>
        "<tr><td>" + h.numero + "</td><td>" + h.date + "</td><td>" + (h.patientNom || h.patient || "") + "</td><td>" +
        formatNag(h.matricule) + "</td><td>" + h.type + "</td><td>" + (h.statut || "Validée") + "</td><td>" + fmt(num(h.totalMontant)) + "</td></tr>"
      ).join("")
    : '<tr><td colspan="7" style="text-align:center">Aucune prise en charge pour ces filtres.</td></tr>';

  return '<div class="report-doc">' +
    '<div class="report-head">' +
      '<img src="CNAMGS.png" alt="CNAMGS" />' +
      '<div><h1>Rapport — Historique des prises en charge</h1><p>Caisse Nationale d’Assurance Maladie et de Garantie Sociale</p></div>' +
    "</div>" +
    '<div class="report-meta">' +
      "<div><b>Filtres appliqués</b><span>" + filtersSummary + "</span></div>" +
      "<div><b>Généré le</b><span>" + todayFR() + "</span></div>" +
    "</div>" +
    '<div class="report-kpis">' +
      "<div><b>" + totals.count + "</b><span>Prise(s) en charge</span></div>" +
      "<div><b>" + fmtFCFA(totals.montant) + "</b><span>Montant total</span></div>" +
      "<div><b>" + fmtFCFA(totals.part) + "</b><span>Part CNAMGS</span></div>" +
    "</div>" +
    '<table class="report-table"><thead><tr><th>N° feuille</th><th>Date</th><th>Patient</th><th>Matricule</th><th>Type</th><th>Statut</th><th>Montant total</th></tr></thead><tbody>' + rowsHtml + "</tbody></table>" +
    '<div class="report-footer">CNAMGS — Plateforme de gestion du circuit de l’assuré · Rapport généré automatiquement (prototype front-end)</div>' +
  "</div>";
}
document.getElementById("historiqueExportBtn").addEventListener("click", () => {
  document.getElementById("reportPrintArea").innerHTML = buildHistoriqueReportHtml();
  audit("rapport.exporter", { ressourceType: "Rapport", ressourceLibelle: "Historique des prises en charge", message: "Export PDF / impression" });
  document.body.classList.add("printing-report");
  window.print();
  document.body.classList.remove("printing-report");
});

/* ---------------------------------------------------------------------- */
/* Gestion des permissions (administrateur) : uniquement celles du serveur  */
/* ---------------------------------------------------------------------- */

/* ---------------------------------------------------------------------- */
/* Permissions API (actions vérifiées côté backend, table Permission /     */
/* RolePermission).                                                        */
/* ---------------------------------------------------------------------- */

let apiPermissionsCatalog = []; // [{ id_permission, code, description }] — GET /api/permissions
let apiPermissionsMatrix = {};  // { role: [codes] }             — GET /api/permissions/matrix

function setApiPermissionsBadge(text, cls) {
  const el = document.getElementById("apiPermissionsBadge");
  if (!el) return;
  el.textContent = text;
  el.className = "pill " + cls;
}

function loadApiPermissions() {
  const body = document.getElementById("apiPermissionsBody");
  body.innerHTML = '<tr><td colspan="99" style="text-align:center;color:var(--muted)">Chargement…</td></tr>';
  setApiPermissionsBadge("Chargement…", "attente");

  Promise.all([apiListPermissions(), apiGetPermissionMatrix()]).then(([codes, matrix]) => {
    apiPermissionsCatalog = codes;
    apiPermissionsMatrix = matrix;
    setApiPermissionsBadge("Connecté à l'API", "validee");
    renderApiPermissionsTable();
  }).catch(err => {
    setApiPermissionsBadge(err.isNetworkError ? "Backend injoignable" : "Accès refusé", "inactif");
    body.innerHTML = '<tr><td colspan="99" style="color:var(--red)">' + escapeHtml(err.message || "Impossible de charger les permissions API.") + "</td></tr>";
  });
}

function renderApiPermissionsTable() {
  const head = document.getElementById("apiPermissionsHead");
  head.innerHTML = "<th>Profil</th>" + apiPermissionsCatalog.map(p =>
    '<th title="' + escapeHtml(p.description || "") + '">' + escapeHtml(p.code) + "</th>"
  ).join("");

  const body = document.getElementById("apiPermissionsBody");
  body.innerHTML = "";
  Object.keys(apiPermissionsMatrix).sort().forEach(role => {
    const tr = document.createElement("tr");
    const codes = new Set(apiPermissionsMatrix[role] || []);
    let tds = "<td><b>" + escapeHtml(role) + "</b></td>";
    apiPermissionsCatalog.forEach(p => {
      const checked = codes.has(p.code);
      tds += '<td style="text-align:center"><input type="checkbox" data-role="' + role + '" data-code="' + p.code + '"' + (checked ? " checked" : "") + " /></td>";
    });
    tr.innerHTML = tds;
    body.appendChild(tr);
  });

  body.querySelectorAll('input[type="checkbox"][data-role]').forEach(cb => {
    cb.addEventListener("change", () => {
      const role = cb.dataset.role;
      const code = cb.dataset.code;
      const wasChecked = cb.checked;
      cb.disabled = true;
      const action = wasChecked ? apiGrantPermission(role, code) : apiRevokePermission(role, code);
      action
        // GET /api/permissions/role/{role} : on relit juste ce rôle plutôt
        // que de recharger toute la matrice après chaque bascule.
        .then(() => { audit("permissions.modifier", { ressourceType: "Permission", ressourceLibelle: role + " · " + code, apres: { role: role, code: code, accorde: wasChecked } }); return apiGetRolePermissions(role); })
        .then(res => {
          apiPermissionsMatrix[role] = Array.from(res.permissions || []);
          cb.disabled = false;
        })
        .catch(err => {
          cb.checked = !wasChecked;
          cb.disabled = false;
          showInfoModal("Erreur API", "<p>" + escapeHtml(err.message) + "</p>");
        });
    });
  });
}

document.getElementById("reloadApiPermissionsBtn").addEventListener("click", loadApiPermissions);

/* ---------------------------------------------------------------------- */
/* Initialisation                                                          */
/* ---------------------------------------------------------------------- */

updateClock();
populatePharmaFilterOptions();
populateHospFilterOptions();
buildLoginParticles();
// Actualisation de la page : on retrouve la session (et la page) sans repasser par la connexion.
restoreSession().then(ok => { if (!ok) buildLoginDna(); }).catch(() => { clearSession(); buildLoginDna(); });
/* ==========================================================================
   PEC — logique front-end uniquement (aucun appel réseau / backend)
   ========================================================================== */

const state = {
  currentAssure: null,
  currentPatient: null,   // { matricule, nom, prenom, dateNaissance, sexe, estAssure }
  currentType: null,      // 'Consultation' | 'Examen'
  currentTM: null,        // 'Plein' | 'Plein (ALD)' | 'Exonéré'
  currentMedecin: null,   // objet MEDECINS
  rows: [],
  examRows: [],           // lignes du tableau "Examens" (bon d'examen)
  soinsMode: "agent",     // 'agent' (création, envoi au médecin) | 'medecin' (validation)
  editingEntryId: null,   // id de l'entrée historique en cours de validation par le médecin
  prestaLocked: true,     // la section Prestations n'est éditable qu'en mode 'medecin'
  historique: loadJSON("pec_historique", HISTORIQUE_SEED),
  users: loadJSON("pec_users", USERS_SEED.slice()),
  historiqueFilters: { search: "", type: "", statut: "", from: "", to: "" },
  historiquePage: 1,
  ordoRows: [],           // lignes d'ordonnance en cours d'édition sur la feuille de soins (médecin)
  ordoLocked: true,       // la section Ordonnance n'est éditable qu'en mode 'medecin'
  currentUser: null,      // utilisateur connecté (state.users), déterminé par l'e-mail saisi à la connexion
  reglements: loadJSON("pec_reglements", []),   // paiements réels enregistrés par l'assurance envers les pharmacies : { id, pharmacie, montant, date, note }
  pharmaSuiviFilters: { from: "", to: "", pharmacie: "", statut: "" },
  reglementsHopitaux: loadJSON("pec_reglements_hopitaux", []), // paiements réels envers les hôpitaux : { id, hopital, montant, date, note }
  hopitalSuiviFilters: { from: "", to: "", hopital: "", type: "", statut: "" },
  connexionLog: loadJSON("pec_connexion_log", []),  // { id, email, nom, role, date, heure, statut }
  journalFilters: { search: "", role: "", statut: "", from: "", to: "" },
  apiUsers: null,          // utilisateurs chargés depuis le vrai backend (GET /api/utilisateurs), si joignable
  usersSource: "local"     // "api" | "local" — quelle source alimente actuellement "Gestion des utilisateurs"
};

// Migration douce : les entrées enregistrées avant l'ajout des actions/du statut avaient des champs manquants.
let historiqueMigrated = false;
state.historique.forEach((h, i) => {
  if (!h.id) { h.id = Date.now() + i; historiqueMigrated = true; }
  if (!h.statut) { h.statut = "Validée"; historiqueMigrated = true; }
  if (!h.ordonnance) { h.ordonnance = []; historiqueMigrated = true; }
  // Migration douce : avant l'ajout du bon d'examen, les feuilles de type "Examen"
  // réutilisaient le tableau générique "prestations" — on les bascule vers "examens".
  if (h.type === "Examen" && !h.examens) {
    h.examens = (h.prestations || []).map(r => ({ designation: r.designation, cotation: r.montant, tm: r.tm, part: r.part }));
    h.examNature = h.examNature || "";
    h.examSituation = h.examSituation || "";
    h.examCodePraticien = h.examCodePraticien || "";
    h.examEtablissement = h.examEtablissement || "";
    h.examCodeEtablissement = h.examCodeEtablissement || "";
    h.examDate = h.examDate || h.prestaDate || "";
    h.examMotif = h.examMotif || "";
    h.examPubSignature = h.examPubSignature || "";
    h.examSpecialisteSignature = h.examSpecialisteSignature || "";
    historiqueMigrated = true;
  }
});
if (historiqueMigrated) saveJSON("pec_historique", state.historique);

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

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
function playLoginTransition(callback) {
  const overlay = document.getElementById("loginTransition");
  document.getElementById("view-login").hidden = true;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("active"));
  window.setTimeout(() => {
    overlay.classList.add("leaving");
    window.setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove("active", "leaving");
      document.getElementById("appShell").hidden = false;
      stopLoginDna();
      callback();
    }, 350);
  }, 650);
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
const PERMISSION_VIEWS = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "statistiques", label: "Statistiques" },
  { key: "rapports", label: "Rapports" },
  { key: "nouvelle-pec", label: "Nouvelle prise en charge" },
  { key: "medecin", label: "Espace Médecin" },
  { key: "pharmacie", label: "Espace Pharmacien" },
  { key: "historique", label: "Historique PEC" },
  { key: "users", label: "Gestion des utilisateurs" },
  { key: "journalisation", label: "Journalisation" }
];
const ROLE_ACCESS_DEFAULT = {
  "Super Admin": { views: ["dashboard", "statistiques", "rapports", "nouvelle-pec", "medecin", "pharmacie", "historique", "users", "journalisation"], landing: "dashboard" },
  "DG": { views: ["dashboard", "statistiques", "rapports", "journalisation"], landing: "dashboard" },
  "Médecin": { views: ["medecin"], landing: "medecin" },
  "Agent hospitalier": { views: ["nouvelle-pec", "historique"], landing: "nouvelle-pec" },
  "Pharmacie": { views: ["pharmacie"], landing: "pharmacie" },
  "Caisse": { views: ["dashboard", "statistiques", "rapports"], landing: "rapports" }
};
state.roleAccess = loadJSON("pec_role_access", JSON.parse(JSON.stringify(ROLE_ACCESS_DEFAULT)));
// Migrations douces, une seule fois chacune : les permissions déjà
// enregistrées dans le navigateur avant l'ajout d'une vue ne l'ont pas — on
// l'ajoute aux rôles qui l'ont par défaut, sans revenir dessus si un admin
// la décoche ensuite volontairement (drapeaux pec_*_view_migrated).
if (!loadJSON("pec_journal_view_migrated", false)) {
  ["Super Admin", "DG"].forEach(role => {
    const access = state.roleAccess[role];
    if (access && !access.views.includes("journalisation")) access.views.push("journalisation");
  });
  saveJSON("pec_role_access", state.roleAccess);
  saveJSON("pec_journal_view_migrated", true);
}
if (!loadJSON("pec_stats_view_migrated", false)) {
  ["Super Admin", "DG", "Caisse"].forEach(role => {
    const access = state.roleAccess[role];
    if (access && !access.views.includes("statistiques")) access.views.push("statistiques");
  });
  saveJSON("pec_role_access", state.roleAccess);
  saveJSON("pec_stats_view_migrated", true);
}

// "soins" (feuille de soins) n'a pas d'item de sidebar propre : on y accède
// depuis "nouvelle-pec" (agent) ou "medecin" (validation) — donc autorisé
// dès que l'un des deux l'est, sans case à cocher dédiée dans la matrice.
function getEffectiveViews(role) {
  const access = state.roleAccess[role];
  if (!access) return null;
  const views = access.views.slice();
  if ((views.includes("nouvelle-pec") || views.includes("medecin")) && !views.includes("soins")) {
    views.push("soins");
  }
  return views;
}

// Restreint la barre latérale aux vues autorisées par le rôle de l'utilisateur
// connecté. Un utilisateur sans rôle reconnu (e-mail non trouvé dans
// state.users, cas de démo) garde l'accès complet actuel. Seul le Super
// Admin voit "Gestion des permissions", verrouillé (non présent dans la
// matrice éditable pour éviter de s'auto-verrouiller l'accès à l'écran).
function applyRoleAccess(user) {
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
  const scope = document.getElementById("userMenu");
  if (!scope) return;
  const nameEls = scope.querySelectorAll(".name");
  const roleEls = scope.querySelectorAll(".role");
  const avatarEls = scope.querySelectorAll(".avatar");

  const name = user ? (user.prenom + " " + user.nom) : (email || "—");
  const role = user ? user.role : "Utilisateur";
  const initials = user
    ? ((user.prenom[0] || "") + (user.nom[0] || "")).toUpperCase()
    : (email ? email.slice(0, 2).toUpperCase() : "??");

  nameEls.forEach(el => { el.textContent = name; });
  roleEls.forEach(el => { el.textContent = role; });
  avatarEls.forEach(el => { el.textContent = initials; });
}

// Journalisation : une entrée par tentative de connexion (succès ou échec —
// "échec" ici veut dire e-mail non reconnu dans state.users, ce prototype
// front-end n'ayant pas de vrai mot de passe à vérifier côté serveur).
function logConnexion(user, email, statut) {
  const d = new Date();
  state.connexionLog.unshift({
    id: Date.now(),
    email: user ? user.email : email,
    nom: user ? (user.prenom + " " + user.nom) : "—",
    role: user ? user.role : "Inconnu",
    date: todayFR(),
    heure: pad(d.getHours()) + ":" + pad(d.getMinutes()),
    statut: statut
  });
  saveJSON("pec_connexion_log", state.connexionLog);
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

    if (result.error) {
      // Le backend a répondu et a refusé la connexion (identifiants
      // invalides, compte désactivé...) : échec réel, pas de repli local.
      setFieldError("loginPass", "loginPassError", result.error);
      logConnexion(null, username, "Échec");
      return;
    }

    state.currentUser = result.user;
    logConnexion(state.currentUser, username, state.currentUser ? "Succès" : "Échec");
    applyRoleAccess(state.currentUser);
    updateUserPill(state.currentUser, username);
    const access = state.currentUser ? state.roleAccess[state.currentUser.role] : null;

    playLoginTransition(() => {
      if (access && access.landing !== "dashboard") {
        goToView(access.landing);
      } else {
        renderDashboardStats();
      }
    });
  });
});

// Authentifie d'abord contre le vrai backend (POST /api/auth/login). Si le
// backend est injoignable (Java/SQL Server arrêtés, CORS non configuré —
// voir le PDF de documentation), bascule sur les comptes de démonstration
// locaux (USERS_SEED / pec_users) pour ne pas casser le prototype quand
// l'API n'est pas lancée. Si le backend répond mais refuse les identifiants,
// l'échec est réel : pas de repli silencieux vers le mode démo.
async function authenticate(username, password) {
  try {
    const session = await apiLogin(username, password);
    return { user: mapBackendUser(session.user) };
  } catch (err) {
    if (err.isNetworkError) {
      console.warn("[API] " + err.message + " — bascule sur les comptes de demonstration locaux.");
      const u = state.users.find(x => (x.username || "").toLowerCase() === username.toLowerCase()) || null;
      return { user: u };
    }
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
function showInfoModal(title, bodyHtml) {
  document.getElementById("infoModalTitle").textContent = title;
  document.getElementById("infoModalBody").innerHTML = bodyHtml;
  document.getElementById("infoModal").hidden = false;
}
document.getElementById("closeInfoModal").addEventListener("click", () => { document.getElementById("infoModal").hidden = true; });
document.getElementById("closeInfoModalBtn").addEventListener("click", () => { document.getElementById("infoModal").hidden = true; });

// Modale de confirmation (suppressions) à accent rouge — remplace les confirm()
// natifs du navigateur pour rester cohérent avec le design de l'application.
let confirmModalCallback = null;
function askConfirm(message, onConfirm, opts) {
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

function performLogout() {
  apiLogout();
  document.getElementById("appShell").hidden = true;
  document.getElementById("view-login").hidden = false;
  document.getElementById("loginForm").reset();
  setFieldError("loginUsername", "loginUsernameError", "");
  setFieldError("loginPass", "loginPassError", "");
  resetSearch();
  state.currentUser = null;
  applyRoleAccess(null);
  goToView("dashboard");
  buildLoginDna();
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
  document.getElementById("profil-role").value = u ? u.role : "Utilisateur";
  const etabWrap = document.getElementById("profil-etab-wrap");
  if (u && u.etablissement) {
    document.getElementById("profil-etab").value = u.etablissement;
    etabWrap.hidden = false;
  } else {
    etabWrap.hidden = true;
  }
  document.getElementById("profilModal").hidden = false;
}
document.getElementById("userMenuProfil").addEventListener("click", () => { setUserMenuOpen(false); openProfilModal(); });
document.getElementById("closeProfilModal").addEventListener("click", () => { document.getElementById("profilModal").hidden = true; });
document.getElementById("cancelProfilModal").addEventListener("click", () => { document.getElementById("profilModal").hidden = true; });
document.getElementById("profilForm").addEventListener("submit", e => {
  e.preventDefault();
  const u = state.currentUser;
  if (!u) { document.getElementById("profilModal").hidden = true; return; }
  const nomComplet = document.getElementById("profil-nom").value.trim();
  const parts = nomComplet.split(" ");
  u.prenom = parts.shift() || nomComplet;
  u.nom = parts.join(" ") || "";
  saveJSON("pec_users", state.users);
  updateUserPill(u, u.email);
  document.getElementById("profilModal").hidden = true;
});

document.getElementById("userMenuParams").addEventListener("click", () => {
  setUserMenuOpen(false);
  showInfoModal("Paramètres", "<p>Les paramètres du compte et les préférences de l'application seront disponibles prochainement.</p>");
});
document.getElementById("userMenuNotifs").addEventListener("click", () => {
  setUserMenuOpen(false);
  showInfoModal("Notifications", "<p>Aucune notification pour le moment. Le centre de notifications sera disponible prochainement.</p>");
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
/* Barre latérale : réduction / dépliage                                  */
/* ---------------------------------------------------------------------- */

const sidebarEl = document.getElementById("sidebar");
function setSidebarCollapsed(collapsed) {
  sidebarEl.classList.toggle("collapsed", collapsed);
  saveJSON("pec_sidebar_collapsed", collapsed);
}
document.getElementById("sidebarCollapseBtn").addEventListener("click", function () {
  setSidebarCollapsed(!sidebarEl.classList.contains("collapsed"));
});
setSidebarCollapsed(!!loadJSON("pec_sidebar_collapsed", false));

/* ---------------------------------------------------------------------- */
/* Horloge de l'en-tête                                                    */
/* ---------------------------------------------------------------------- */

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function updateClock() {
  const el = document.getElementById("topbarClock");
  if (!el) return;
  const d = new Date();
  const txt = JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear() + " · " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  el.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
}
setInterval(updateClock, 30000);

/* ---------------------------------------------------------------------- */
/* Navigation entre les vues de l'application                             */
/* ---------------------------------------------------------------------- */

const VIEW_META = {
  dashboard: { title: "Tableau de bord", crumb: "Accueil" },
  statistiques: { title: "Statistiques", crumb: "Accueil / Statistiques" },
  "nouvelle-pec": { title: "Nouvelle prise en charge", crumb: "Accueil / Nouvelle prise en charge" },
  medecin: { title: "Espace Médecin", crumb: "Accueil / Espace Médecin" },
  soins: { title: "Feuille de soins", crumb: "Accueil / Feuille de soins" },
  historique: { title: "Historique PEC", crumb: "Accueil / Historique" },
  users: { title: "Gestion des utilisateurs", crumb: "Accueil / Utilisateurs" },
  pharmacie: { title: "Espace Pharmacien", crumb: "Accueil / Espace Pharmacien" },
  rapports: { title: "Rapports", crumb: "Accueil / Rapports" },
  permissions: { title: "Gestion des permissions", crumb: "Accueil / Permissions" },
  journalisation: { title: "Journalisation", crumb: "Accueil / Journalisation" }
};

function goToView(name) {
  if (!isViewAllowed(name)) {
    name = state.roleAccess[state.currentUser.role].landing;
  }
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  document.getElementById("view-" + name).hidden = false;

  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const navBtn = document.querySelector('.nav-item[data-view="' + name + '"]');
  if (navBtn) navBtn.classList.add("active");

  const meta = VIEW_META[name];
  document.getElementById("topbarTitle").textContent = meta.title;
  document.getElementById("topbarBackBtn").hidden = name === "dashboard";
  renderCrumb(meta);

  if (name === "historique") renderHistorique();
  if (name === "users") renderUsers();
  if (name === "dashboard") renderDashboardStats();
  if (name === "medecin") renderMedecinQueue();
  if (name === "pharmacie") resetPharmaSearch();
  if (name === "rapports") renderRapports();
  if (name === "permissions") renderPermissions();
  if (name === "journalisation") renderJournalisation();
  if (name === "statistiques") renderStatistiques();
}

// "Accueil" (racine du fil d'Ariane) est cliquable et ramène au tableau de
// bord ; le segment courant reste du texte simple — motif standard de
// breadcrumb, cohérent avec le bouton retour à côté du titre.
function renderCrumb(meta) {
  const el = document.getElementById("topbarCrumb");
  const parts = meta.crumb.split(" / ");
  if (parts.length === 1) {
    el.innerHTML = '<span class="crumb-current">' + parts[0] + "</span>";
    return;
  }
  el.innerHTML =
    '<button type="button" class="crumb-link" id="crumbHomeBtn">' + parts[0] + "</button>" +
    '<span class="crumb-sep">/</span>' +
    '<span class="crumb-current">' + parts.slice(1).join(" / ") + "</span>";
  document.getElementById("crumbHomeBtn").addEventListener("click", () => goToView("dashboard"));
}
document.getElementById("topbarBackBtn").addEventListener("click", () => goToView("dashboard"));

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
  sel.innerHTML = '<option value="">— Choisir un médecin —</option>';
  MEDECINS.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = "Dr. " + m.prenom + " " + m.nom + " — " + m.etablissement;
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
  document.getElementById("notFoundMsg").hidden = true;
  document.getElementById("matriculeInput").value = "";
  document.querySelectorAll("#tmChoices .chip").forEach(c => c.classList.remove("active"));
  document.getElementById("medecinSelect").value = "";
  updateActionButtons();
}

function findAssure(matricule) {
  return ASSURES.find(a => a.matricule === matricule) || null;
}

function runSearch(matricule) {
  matricule = (matricule || "").trim();
  const found = findAssure(matricule);
  document.getElementById("notFoundMsg").hidden = !!found || !matricule;
  if (!found) {
    document.getElementById("assureFound").hidden = true;
    state.currentAssure = null;
    updateActionButtons();
    return;
  }
  state.currentAssure = found;
  showAssureCard(found);
}

// Avatar "photo" d'un assuré : pas de vraie photo dans ce prototype
// front-end (aucune source d'image), donc un cadre d'initiales à couleur
// stable (dérivée du nom) tient lieu de section photo dédiée.
const AVATAR_COLORS = ["#4d9e63", "#14479c", "#b6791f", "#8a3fa0", "#c0392b", "#1f8a8a", "#2f7d45"];
function avatarColorFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function setAvatar(el, prenom, nom) {
  if (!el) return;
  el.textContent = ((prenom || "").charAt(0) + (nom || "").charAt(0)).toUpperCase();
  el.style.background = avatarColorFor((prenom || "") + (nom || ""));
}

function showAssureCard(assure) {
  document.getElementById("assureFound").hidden = false;
  document.getElementById("af-nom").textContent = assure.prenom + " " + assure.nom;
  document.getElementById("af-situation").textContent = assure.nature || "Assuré principal";
  document.getElementById("af-matricule").textContent = assure.matricule;
  document.getElementById("af-naissance").textContent = assure.dateNaissance;
  document.getElementById("af-fonds").textContent = assure.fonds;
  document.getElementById("af-nature").textContent = assure.nature || "Assuré principal";
  setAvatar(document.getElementById("af-avatar"), assure.prenom, assure.nom);

  // Le patient de la prise en charge est l'assuré recherché — plus de choix
  // séparé entre l'assuré principal et ses ayants droit sur cet écran.
  state.currentPatient = {
    matricule: assure.matricule,
    nom: assure.nom,
    prenom: assure.prenom,
    dateNaissance: assure.dateNaissance,
    sexe: assure.sexe,
    estAssure: true
  };
  updateActionButtons();

  state.currentTM = null;
  state.currentMedecin = null;
  document.querySelectorAll("#tmChoices .chip").forEach(c => c.classList.remove("active"));
  document.getElementById("medecinSelect").value = "";
  updateActionButtons();
}

function updateActionButtons() {
  const ready = !!(state.currentAssure && state.currentPatient && state.currentTM && state.currentMedecin);
  document.getElementById("btnConsultation").disabled = !ready;
  document.getElementById("btnExamen").disabled = !ready;
  const hint = document.getElementById("readyHint");
  if (hint) hint.hidden = ready;
}

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
  state.currentMedecin = MEDECINS.find(m => m.id === id) || null;
  updateActionButtons();
});

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
  const n = state.historique.length + 1;
  return "F" + new Date().getFullYear() + "-" + String(n).padStart(5, "0");
}

const TYPE_LABELS = { generaliste: "Généraliste", specialiste: "Spécialiste", autre: "Autre" };
const TM_IDS = { "Plein": "tm-plein", "Plein (ALD)": "tm-ald", "Exonéré": "tm-exonere" };

function openSoins(type) {
  if (!state.currentAssure || !state.currentPatient || !state.currentTM || !state.currentMedecin) return;
  state.soinsMode = "agent";
  state.editingEntryId = null;
  state.currentType = type;
  state.examRows = [emptyExamRow()];

  const isExam = type === "Examen";
  document.getElementById("soinsWrap").classList.toggle("examen-theme", isExam);
  document.getElementById("prSectionTitle").textContent = isExam ? "Praticien prescripteur" : "Praticien";
  document.getElementById("prestationsSection").hidden = isExam;
  document.getElementById("ordonnanceSection").hidden = isExam;
  document.getElementById("examenSection").hidden = !isExam;

  // La bascule Consultation ⇄ Examen n'a de sens que côté médecin, en validation.
  document.getElementById("recommandExamenSection").hidden = true;
  document.getElementById("retourConsultationSection").hidden = true;

  const assure = state.currentAssure;
  const patient = state.currentPatient;
  const medecin = state.currentMedecin;

  const badge = document.getElementById("soinsBadge");
  badge.textContent = type;
  badge.className = "soins-type-badge " + (type === "Consultation" ? "consultation" : "examen");

  const numero = nextFeuilleNum();
  document.getElementById("soinsNum").value = numero;
  document.getElementById("soinsDate").value = todayFR();
  document.getElementById("soinsFonds").value = assure.fonds;
  document.getElementById("soinsFonds").disabled = false;

  document.getElementById("p-patientNom").value = patient.prenom + " " + patient.nom;
  document.getElementById("p-dateNaissance").value = patient.dateNaissance;
  document.getElementById("p-matriculePatient").value = patient.matricule;

  const isSelf = patient.estAssure;
  document.getElementById("chk-assure").checked = isSelf;
  document.getElementById("chk-ayant").checked = !isSelf;
  document.getElementById("chk-assure-wrap").classList.toggle("on", isSelf);
  document.getElementById("chk-ayant-wrap").classList.toggle("on", !isSelf);

  document.getElementById("pr-nom").value = "Dr. " + medecin.prenom + " " + medecin.nom;
  document.getElementById("pr-etab").value = medecin.etablissement;
  document.getElementById("pr-code").value = medecin.code;
  document.getElementById("pr-signature").value = "";

  Object.keys(TYPE_LABELS).forEach(key => {
    const checked = medecin.type === TYPE_LABELS[key];
    document.getElementById("pr-type-" + key).checked = checked;
    document.getElementById("pr-type-" + key + "-wrap").classList.toggle("on", checked);
  });

  Object.keys(TM_IDS).forEach(key => {
    const id = TM_IDS[key];
    const checked = state.currentTM === key;
    document.getElementById(id).checked = checked;
    document.getElementById(id + "-wrap").classList.toggle("locked", checked);
  });

  document.querySelectorAll('#view-soins input[type=radio]').forEach(el => { el.checked = false; el.disabled = false; });

  // La partie Prestations est du ressort du médecin : verrouillée à cette étape.
  state.prestaLocked = true;
  document.getElementById("prestationsHint").hidden = false;
  document.getElementById("presta-date").value = todayFR();
  document.getElementById("presta-date").disabled = true;
  document.getElementById("presta-code").value = "";
  document.getElementById("presta-code").disabled = true;
  document.getElementById("presta-domicile-oui").disabled = true;
  document.getElementById("presta-domicile-non").disabled = true;
  document.getElementById("totalMontant").value = "0";
  document.getElementById("totalTm").value = "0";
  document.getElementById("totalPart").value = "0";
  document.getElementById("totalMontant").disabled = true;
  document.getElementById("totalTm").disabled = true;
  document.getElementById("totalPart").disabled = true;

  // L'ordonnance (médicaments prescrits) est elle aussi du ressort du médecin.
  state.ordoLocked = true;
  document.getElementById("ordonnanceHint").hidden = false;
  document.getElementById("addOrdoRowBtn").disabled = true;
  document.getElementById("removeOrdoRowBtn").disabled = true;
  state.ordoRows = [emptyOrdoRow()];

  // Le bon d'examen (prestations + examens + volet établissement public) est lui aussi
  // du ressort du médecin : verrouillé à cette étape, comme Prestations/Ordonnance ci-dessus.
  document.getElementById("examPrestaHint").hidden = false;
  document.getElementById("exam-presta-date").value = todayFR();
  document.getElementById("exam-presta-date").disabled = true;
  document.getElementById("exam-etablissement").value = "";
  document.getElementById("exam-etablissement").disabled = true;
  document.getElementById("exam-code-praticien").value = "";
  document.getElementById("exam-code-praticien").disabled = true;
  document.getElementById("exam-code-etablissement").value = "";
  document.getElementById("exam-code-etablissement").disabled = true;
  document.getElementById("exam-motif").value = "";
  document.getElementById("exam-motif").disabled = true;
  document.getElementById("exam-pub-signature").value = "";
  document.getElementById("exam-specialiste-signature").value = "";
  [
    "exam-nature-radiologie", "exam-nature-biologie", "exam-nature-autre",
    "exam-situation-hospitalise", "exam-situation-externe"
  ].forEach(id => { document.getElementById(id).disabled = true; });
  document.getElementById("addExamRowBtn").disabled = true;
  document.getElementById("removeExamRowBtn").disabled = true;

  document.getElementById("saveSoinsBtn").textContent = "Envoyer au médecin";

  drawPseudoQR(document.getElementById("qrCanvas"), patient.matricule + "-" + numero);

  renderOrdoRows();
  renderExamRows();
  goToView("soins");
}

function openSoinsForValidation(entryId, opts) {
  const entry = state.historique.find(h => h.id === entryId);
  if (!entry) return;
  const skipNav = !!(opts && opts.skipNav);
  state.soinsMode = "medecin";
  state.editingEntryId = entryId;
  state.currentType = entry.type;

  const badge = document.getElementById("soinsBadge");
  badge.textContent = entry.type;
  badge.className = "soins-type-badge " + (entry.type === "Consultation" ? "consultation" : "examen");

  document.getElementById("soinsNum").value = entry.numero;
  document.getElementById("soinsDate").value = entry.date;
  document.getElementById("soinsFonds").value = entry.fonds || "";
  document.getElementById("soinsFonds").disabled = true;

  document.getElementById("p-patientNom").value = entry.patientNom || "";
  document.getElementById("p-dateNaissance").value = entry.dateNaissance || "";
  document.getElementById("p-matriculePatient").value = entry.matricule || "";

  const isSelf = !!entry.estAssure;
  document.getElementById("chk-assure").checked = isSelf;
  document.getElementById("chk-ayant").checked = !isSelf;
  document.getElementById("chk-assure-wrap").classList.toggle("on", isSelf);
  document.getElementById("chk-ayant-wrap").classList.toggle("on", !isSelf);

  const isExam = entry.type === "Examen";
  document.getElementById("soinsWrap").classList.toggle("examen-theme", isExam);
  document.getElementById("prSectionTitle").textContent = isExam ? "Praticien prescripteur" : "Praticien";
  document.getElementById("prestationsSection").hidden = isExam;
  document.getElementById("ordonnanceSection").hidden = isExam;
  document.getElementById("examenSection").hidden = !isExam;

  updateExamSwitchUI(entry);

  document.getElementById("pr-nom").value = entry.medecin || "";
  document.getElementById("pr-etab").value = entry.medecinEtab || "";
  document.getElementById("pr-code").value = entry.medecinCode || "";
  document.getElementById("pr-signature").value = entry.signature || "";

  Object.keys(TYPE_LABELS).forEach(key => {
    const checked = entry.medecinType === TYPE_LABELS[key];
    document.getElementById("pr-type-" + key).checked = checked;
    document.getElementById("pr-type-" + key + "-wrap").classList.toggle("on", checked);
  });

  Object.keys(TM_IDS).forEach(key => {
    const id = TM_IDS[key];
    const checked = entry.ticketModerateur === key;
    document.getElementById(id).checked = checked;
    document.getElementById(id + "-wrap").classList.toggle("locked", checked);
  });

  // Condition de prise en charge : déjà renseignée par l'agent, verrouillée pour le médecin.
  document.getElementById("tiers-oui").checked = entry.accidentTiers === "Oui";
  document.getElementById("tiers-non").checked = entry.accidentTiers === "Non";
  document.getElementById("grossesse-oui").checked = entry.grossesse === "Oui";
  document.getElementById("grossesse-non").checked = entry.grossesse === "Non";
  document.querySelectorAll('input[name=tiers], input[name=grossesse]').forEach(el => { el.disabled = true; });

  // La partie Prestations est déverrouillée : c'est le travail du médecin.
  state.prestaLocked = false;
  document.getElementById("prestationsHint").hidden = true;
  document.getElementById("presta-date").value = entry.prestaDate || todayFR();
  document.getElementById("presta-date").disabled = false;
  document.getElementById("presta-code").value = entry.prestaCode || "";
  document.getElementById("presta-code").disabled = false;
  document.getElementById("presta-domicile-oui").checked = entry.prestaDomicile === "Oui";
  document.getElementById("presta-domicile-non").checked = entry.prestaDomicile === "Non";
  document.getElementById("presta-domicile-oui").disabled = false;
  document.getElementById("presta-domicile-non").disabled = false;
  document.getElementById("totalMontant").value = entry.totalMontant || "0";
  document.getElementById("totalTm").value = entry.totalTm || "0";
  document.getElementById("totalPart").value = entry.totalPart || "0";
  document.getElementById("totalMontant").disabled = false;
  document.getElementById("totalTm").disabled = false;
  document.getElementById("totalPart").disabled = false;

  // L'ordonnance est déverrouillée : le médecin prescrit désignation + quantité (pas de montant).
  state.ordoLocked = false;
  document.getElementById("ordonnanceHint").hidden = true;
  document.getElementById("addOrdoRowBtn").disabled = false;
  document.getElementById("removeOrdoRowBtn").disabled = false;
  state.ordoRows = (entry.ordonnance && entry.ordonnance.length) ? entry.ordonnance.map(r => Object.assign({}, r)) : [emptyOrdoRow()];

  // Le bon d'examen est lui aussi déverrouillé : c'est le travail du médecin.
  if (isExam) {
    document.getElementById("examPrestaHint").hidden = true;
    document.getElementById("exam-presta-date").value = entry.examDate || todayFR();
    document.getElementById("exam-presta-date").disabled = false;
    document.getElementById("exam-etablissement").value = entry.examEtablissement || "";
    document.getElementById("exam-etablissement").disabled = false;
    document.getElementById("exam-code-praticien").value = entry.examCodePraticien || "";
    document.getElementById("exam-code-praticien").disabled = false;
    document.getElementById("exam-code-etablissement").value = entry.examCodeEtablissement || "";
    document.getElementById("exam-code-etablissement").disabled = false;
    document.getElementById("exam-motif").value = entry.examMotif || "";
    document.getElementById("exam-motif").disabled = false;
    document.getElementById("exam-pub-signature").value = entry.examPubSignature || "";
    document.getElementById("exam-specialiste-signature").value = entry.examSpecialisteSignature || "";

    document.getElementById("exam-nature-radiologie").checked = entry.examNature === "Radiologie";
    document.getElementById("exam-nature-biologie").checked = entry.examNature === "Biologie";
    document.getElementById("exam-nature-autre").checked = entry.examNature === "Autre";
    document.getElementById("exam-situation-hospitalise").checked = entry.examSituation === "Hospitalisé";
    document.getElementById("exam-situation-externe").checked = entry.examSituation === "Soins Externes";
    [
      "exam-nature-radiologie", "exam-nature-biologie", "exam-nature-autre",
      "exam-situation-hospitalise", "exam-situation-externe"
    ].forEach(id => { document.getElementById(id).disabled = false; });
    document.getElementById("addExamRowBtn").disabled = false;
    document.getElementById("removeExamRowBtn").disabled = false;
  }
  state.examRows = (entry.examens && entry.examens.length) ? entry.examens.map(r => Object.assign({}, r)) : [emptyExamRow()];

  document.getElementById("saveSoinsBtn").textContent = "Valider et enregistrer";

  drawPseudoQR(document.getElementById("qrCanvas"), (entry.matricule || "") + "-" + entry.numero);

  renderOrdoRows();
  renderExamRows();
  if (!skipNav) goToView("soins");
}

document.getElementById("btnConsultation").addEventListener("click", () => openSoins("Consultation"));
document.getElementById("btnExamen").addEventListener("click", () => openSoins("Examen"));
document.getElementById("cancelSoinsBtn").addEventListener("click", () => {
  goToView(state.soinsMode === "medecin" ? "medecin" : "nouvelle-pec");
});

/* ---- Bascule animée Consultation ⇄ Examen (bon d'examen lié) ------------ */

// Met à jour les deux cartes de bascule (vers l'examen depuis une Consultation,
// vers la consultation depuis un Examen) selon la feuille actuellement affichée.
function updateExamSwitchUI(entry) {
  const isExam = entry.type === "Examen";
  const forwardBox = document.getElementById("recommandExamenSection");
  const backBox = document.getElementById("retourConsultationSection");

  forwardBox.hidden = isExam;
  if (!isExam) {
    const linked = (entry.linkedExamenIds || [])
      .map(id => state.historique.find(h => h.id === id))
      .filter(Boolean);
    const last = linked[linked.length - 1];
    const btn = document.getElementById("examSwitchBtn");
    const addAnother = document.getElementById("examSwitchAddAnother");
    const removeBtn = document.getElementById("examSwitchRemove");
    if (last) {
      document.getElementById("examSwitchBtnLabel").textContent = "Voir le bon d'examen " + last.numero;
      document.getElementById("examSwitchSub").textContent = "Un examen a déjà été recommandé pour cette consultation.";
      btn.dataset.mode = "goto";
      btn.dataset.targetId = String(last.id);
      addAnother.hidden = false;
      removeBtn.hidden = false;
      removeBtn.dataset.targetId = String(last.id);
    } else {
      document.getElementById("examSwitchBtnLabel").textContent = "Créer un bon d'examen";
      document.getElementById("examSwitchSub").textContent = "Génère un bon d'examen lié, pré-rempli avec les informations du patient.";
      btn.dataset.mode = "create";
      btn.dataset.targetId = "";
      addAnother.hidden = true;
      removeBtn.hidden = true;
      removeBtn.dataset.targetId = "";
    }
  }

  const src = isExam && entry.linkedConsultationId
    ? state.historique.find(h => h.id === entry.linkedConsultationId)
    : null;
  backBox.hidden = !src;
  if (src) {
    document.getElementById("retourConsultationSub").textContent = "Lié à la consultation " + src.numero;
    document.getElementById("retourConsultationBtn").dataset.targetId = String(src.id);
  }
}

// Anime la carte (léger flip 3D) puis recharge la feuille demandée à la place,
// sans quitter la vue — donne l'impression de "retourner" la feuille.
// La saisie en cours sur la feuille quittée est d'abord sauvegardée (brouillon,
// statut inchangé) pour ne rien perdre en allant-venant entre les deux bons.
function flipSoinsTo(entryId) {
  const current = state.historique.find(h => h.id === state.editingEntryId);
  if (current) {
    captureFormIntoEntry(current);
    saveJSON("pec_historique", state.historique);
  }

  const wrap = document.getElementById("soinsWrap");
  wrap.classList.add("flip-leave");
  window.setTimeout(() => {
    openSoinsForValidation(entryId, { skipNav: true });
    wrap.classList.remove("flip-leave");
    wrap.classList.add("flip-enter");
    void wrap.offsetWidth; // force le reflow pour que la transition rejoue à la sortie de la classe
    wrap.classList.remove("flip-enter");
  }, 260);
}

function createLinkedExamAndFlip() {
  const consultEntry = state.historique.find(h => h.id === state.editingEntryId);
  if (!consultEntry) return;
  const examEntry = examEntryFromConsultation(consultEntry);
  consultEntry.linkedExamenIds = (consultEntry.linkedExamenIds || []).concat([examEntry.id]);
  state.historique.unshift(examEntry);
  saveJSON("pec_historique", state.historique);
  refreshPendingBadge();
  flipSoinsTo(examEntry.id);
}

document.getElementById("examSwitchBtn").addEventListener("click", () => {
  const btn = document.getElementById("examSwitchBtn");
  if (btn.dataset.mode === "goto" && btn.dataset.targetId) {
    flipSoinsTo(parseInt(btn.dataset.targetId, 10));
  } else {
    createLinkedExamAndFlip();
  }
});
document.getElementById("examSwitchAddAnother").addEventListener("click", createLinkedExamAndFlip);

// Retire (supprime) un bon d'examen lié à la consultation actuellement affichée —
// délie les deux feuilles et retire l'examen de l'historique / de la file médecin.
function removeLinkedExam(examId) {
  const consultEntry = state.historique.find(h => h.id === state.editingEntryId);
  if (!consultEntry) return;
  const examEntry = state.historique.find(h => h.id === examId);
  askConfirm(
    "Le bon d'examen " + (examEntry ? examEntry.numero : "") + " lié à cette consultation sera définitivement supprimé.",
    () => {
      state.historique = state.historique.filter(h => h.id !== examId);
      consultEntry.linkedExamenIds = (consultEntry.linkedExamenIds || []).filter(id => id !== examId);
      saveJSON("pec_historique", state.historique);
      refreshPendingBadge();
      updateExamSwitchUI(consultEntry);
    },
    { title: "Retirer ce bon d'examen ?" }
  );
}
document.getElementById("examSwitchRemove").addEventListener("click", () => {
  const targetId = document.getElementById("examSwitchRemove").dataset.targetId;
  if (targetId) removeLinkedExam(parseInt(targetId, 10));
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
    const options = '<option value=""></option>' + MEDICAMENTS.map(m =>
      '<option value="' + m.designation.replace(/"/g, "&quot;") + '"' + (row.designation === m.designation ? " selected" : "") + ">" + m.designation + "</option>"
    ).join("");
    tr.innerHTML =
      '<td><select data-key="designation"' + (locked ? " disabled" : "") + ">" + options + "</select></td>" +
      '<td><input type="text" class="num" data-key="quantite" value="' + (row.quantite ? String(row.quantite).replace(/"/g, "&quot;") : "") + '"' + (locked ? " disabled" : "") + " /></td>" +
      '<td><input type="text" data-key="posologie" value="' + (row.posologie ? String(row.posologie).replace(/"/g, "&quot;") : "") + '"' + (locked ? " disabled" : "") + " /></td>";
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

function submitAgentFeuille() {
  const medecin = state.currentMedecin;
  const entry = {
    id: Date.now(),
    numero: document.getElementById("soinsNum").value,
    date: document.getElementById("soinsDate").value,
    type: state.currentType,
    patientNom: document.getElementById("p-patientNom").value,
    dateNaissance: document.getElementById("p-dateNaissance").value,
    matricule: document.getElementById("p-matriculePatient").value,
    estAssure: document.getElementById("chk-assure").checked,
    fonds: document.getElementById("soinsFonds").value,
    ticketModerateur: state.currentTM,
    medecin: medecin ? ("Dr. " + medecin.prenom + " " + medecin.nom) : "",
    medecinEtab: medecin ? medecin.etablissement : "",
    medecinCode: medecin ? medecin.code : "",
    medecinType: medecin ? medecin.type : "",
    accidentTiers: (document.querySelector('input[name=tiers]:checked') || {}).value || "",
    grossesse: (document.querySelector('input[name=grossesse]:checked') || {}).value || "",
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
  state.historique.unshift(entry);
  saveJSON("pec_historique", state.historique);
  state.historiquePage = 1;
  goToView("dashboard");
}

// Bon d'examen créé par le médecin depuis la validation d'une Consultation
// (bouton "Créer un bon d'examen") — reprend les données partagées du
// patient/praticien, prêt à être complété par un médecin.
function examEntryFromConsultation(consultEntry) {
  return {
    id: Date.now() + 1,
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
    medecinCode: consultEntry.medecinCode,
    medecinType: consultEntry.medecinType,
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
    signature: "",
    linkedConsultationId: consultEntry.id
  };
}

// Recopie l'état actuel du formulaire (Prestations/Ordonnance ou bon d'examen)
// dans l'entrée d'historique correspondante — sans toucher à son statut.
// Utilisé à la fois par la validation finale et par la bascule Consultation ⇄ Examen,
// pour qu'aucune saisie en cours ne soit perdue en changeant de feuille.
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
    entry.ordonnance = state.ordoRows
      .filter(r => r.designation && r.quantite)
      .map(r => ({ designation: r.designation, quantite: r.quantite, posologie: r.posologie || "", statut: "Non servi", servicePar: "", dateService: "", prixUnitaire: "", partAssurance: "", partPatient: "" }));
    entry.totalMontant = document.getElementById("totalMontant").value;
    entry.totalTm = document.getElementById("totalTm").value;
    entry.totalPart = document.getElementById("totalPart").value;
    entry.prestaDate = document.getElementById("presta-date").value;
    entry.prestaDomicile = (document.querySelector('input[name=domicile]:checked') || {}).value || "";
    entry.prestaCode = document.getElementById("presta-code").value;
  }
}

function submitMedecinValidation() {
  const entry = state.historique.find(h => h.id === state.editingEntryId);
  if (!entry) return;
  captureFormIntoEntry(entry);
  entry.statut = "Validée";
  saveJSON("pec_historique", state.historique);
  state.editingEntryId = null;
  goToView("medecin");
}

document.getElementById("saveSoinsBtn").addEventListener("click", () => {
  if (state.soinsMode === "medecin") {
    submitMedecinValidation();
  } else {
    submitAgentFeuille();
  }
});

/* ---------------------------------------------------------------------- */
/* Tableau de bord : statistiques, courbes d'évolution, répartition,       */
/* dernières opérations médicales                                         */
/* ---------------------------------------------------------------------- */

function pendingCount() { return state.historique.filter(h => h.statut === "En attente").length; }

function refreshPendingBadge() {
  const badge = document.getElementById("medecinNavBadge");
  if (!badge) return;
  const count = pendingCount();
  badge.textContent = count;
  badge.hidden = count === 0;
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

/* ---------------------------------------------------------------------- */
/* Espace Médecin : file d'attente des feuilles à valider                  */
/* ---------------------------------------------------------------------- */

function renderMedecinQueue() {
  const body = document.getElementById("medecinQueueBody");
  const empty = document.getElementById("medecinQueueEmpty");
  const pending = state.historique.filter(h => h.statut === "En attente");
  body.innerHTML = "";
  empty.hidden = pending.length > 0;
  pending.forEach(h => {
    const tr = document.createElement("tr");
    const pillClass = h.type === "Consultation" ? "consultation" : "examen";
    tr.innerHTML =
      "<td>" + h.numero + "</td>" +
      "<td>" + h.date + "</td>" +
      "<td>" + (h.patientNom || "") + "</td>" +
      "<td>" + (h.matricule || "") + "</td>" +
      '<td><span class="pill ' + pillClass + '">' + h.type + "</span></td>" +
      "<td>" + (h.medecin || "") + "</td>" +
      '<td class="row-actions"><button type="button" class="btn-secondary btn-sm" data-action="examine" data-id="' + h.id + '">Examiner</button></td>';
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-action="examine"]').forEach(btn => {
    btn.addEventListener("click", () => openSoinsForValidation(parseInt(btn.dataset.id, 10)));
  });
  refreshPendingBadge();
}

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
      const hay = ((h.patientNom || h.patient || "") + " " + (h.matricule || "")).toLowerCase();
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
  const totalPages = Math.max(1, Math.ceil(all.length / HIST_PAGE_SIZE));
  if (state.historiquePage > totalPages) state.historiquePage = totalPages;
  if (state.historiquePage < 1) state.historiquePage = 1;
  const start = (state.historiquePage - 1) * HIST_PAGE_SIZE;
  const pageItems = all.slice(start, start + HIST_PAGE_SIZE);

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
      "<td>" + (h.matricule || "") + "</td>" +
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
        saveJSON("pec_historique", state.historique);
        renderHistorique();
        renderDashboardStats();
        refreshPendingBadge();
      }, { title: "Supprimer cette prise en charge ?" });
    });
  });

  renderPagination(totalPages, all.length);
}

function renderPagination(totalPages, totalItems) {
  const el = document.getElementById("historiquePagination");
  if (totalItems === 0) { el.innerHTML = ""; return; }
  const p = state.historiquePage;
  el.innerHTML =
    '<div class="pg-info">Page ' + p + " sur " + totalPages + " · " + totalItems + " résultat(s)</div>" +
    '<div class="pg-btns">' +
      '<button type="button" class="btn-secondary btn-sm" id="pgPrev"' + (p <= 1 ? " disabled" : "") + ">‹ Précédent</button>" +
      '<button type="button" class="btn-secondary btn-sm" id="pgNext"' + (p >= totalPages ? " disabled" : "") + ">Suivant ›</button>" +
    "</div>";
  const prevBtn = document.getElementById("pgPrev");
  const nextBtn = document.getElementById("pgNext");
  if (prevBtn) prevBtn.addEventListener("click", () => { state.historiquePage--; renderHistorique(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { state.historiquePage++; renderHistorique(); });
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

  let tableHead, rowsHtml;
  if (isExam) {
    const rows = (h.examens || []).filter(r => r.designation || r.cotation);
    tableHead = "<tr><th>Désignation de l'examen</th><th>Cotation</th><th>TM</th><th>Part CNAMGS</th></tr>";
    rowsHtml = rows.length
      ? rows.map(r =>
          "<tr><td>" + (r.designation || "") + "</td><td>" + (r.cotation || "") + "</td><td>" + (r.tm || "") + "</td><td>" + (r.part || "") + "</td></tr>"
        ).join("")
      : '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Aucun examen renseigné</td></tr>';
  } else {
    const rows = (h.prestations || []).filter(r => r.designation || r.montant);
    tableHead = "<tr><th>Désignation</th><th>Qté</th><th>Montant</th><th>TM</th><th>Part CNAMGS</th></tr>";
    rowsHtml = rows.length
      ? rows.map(r =>
          "<tr><td>" + (r.designation || "") + "</td><td>" + (r.qte || "") + "</td><td>" + (r.montant || "") + "</td><td>" + (r.tm || "") + "</td><td>" + (r.part || "") + "</td></tr>"
        ).join("")
      : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Aucune prestation renseignée</td></tr>';
  }

  const extraGrid = isExam
    ? "<div><b>Nature de la prestation</b><span>" + (h.examNature || "—") + "</span></div>" +
      "<div><b>Situation du patient</b><span>" + (h.examSituation || "—") + "</span></div>" +
      "<div><b>Établissement réalisant l'examen</b><span>" + (h.examEtablissement || "—") + "</span></div>"
    : "";

  let linkHtml = "";
  if (isExam && h.linkedConsultationId) {
    const src = state.historique.find(e => e.id === h.linkedConsultationId);
    if (src) {
      linkHtml = '<div class="preview-link">Examen recommandé suite à la feuille <a href="#" data-preview-link="' + src.id + '">' + src.numero + "</a></div>";
    }
  } else if (!isExam && h.linkedExamenIds && h.linkedExamenIds.length) {
    const links = h.linkedExamenIds
      .map(examId => state.historique.find(e => e.id === examId))
      .filter(Boolean)
      .map(ex => '<a href="#" data-preview-link="' + ex.id + '">' + ex.numero + "</a>");
    if (links.length) linkHtml = '<div class="preview-link">Examen(s) recommandé(s) : ' + links.join(", ") + "</div>";
  }

  document.getElementById("previewBody").innerHTML =
    '<div class="preview-head"><img src="CNAMGS.png" alt="CNAMGS" /><div>' +
      '<span class="pill ' + pillClass + '">' + h.type + "</span> " +
      '<span class="pill ' + statutClass + '">' + (h.statut || "Validée") + "</span>" +
      '<div class="preview-num">' + h.numero + "</div>" +
    "</div></div>" +
    linkHtml +
    '<div class="preview-grid">' +
      "<div><b>Patient</b><span>" + (h.patientNom || h.patient || "—") + "</span></div>" +
      "<div><b>Matricule</b><span>" + (h.matricule || "—") + "</span></div>" +
      "<div><b>Date</b><span>" + h.date + "</span></div>" +
      "<div><b>Fonds</b><span>" + (h.fonds || "—") + "</span></div>" +
      "<div><b>Ticket modérateur</b><span>" + (h.ticketModerateur || "—") + "</span></div>" +
      "<div><b>Médecin</b><span>" + (h.medecin || "—") + "</span></div>" +
      "<div><b>Accident causé par un tiers</b><span>" + (h.accidentTiers || "—") + "</span></div>" +
      "<div><b>Soins liés à la grossesse</b><span>" + (h.grossesse || "—") + "</span></div>" +
      extraGrid +
    "</div>" +
    '<table class="data-table"><thead>' + tableHead + "</thead><tbody>" + rowsHtml + "</tbody></table>" +
    '<div class="preview-totals">' +
      "<div>Total montant <b>" + h.totalMontant + "</b></div>" +
      "<div>Total TM <b>" + h.totalTm + "</b></div>" +
      "<div>Total CNAMGS <b>" + h.totalPart + "</b></div>" +
    "</div>";

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

/* ---------------------------------------------------------------------- */
/* Gestion des utilisateurs                                               */
/* ---------------------------------------------------------------------- */

// "Gestion des utilisateurs" essaie d'abord le vrai backend
// (GET /api/utilisateurs, nécessite le token JWT obtenu à la connexion).
// S'il est injoignable ou refuse (pas connecté via le backend, permission
// manquante...), la page retombe sur les comptes de démonstration locaux —
// state.usersSource indique laquelle des deux sources est active, et une
// puce dans l'en-tête le rappelle visuellement (voir renderUsersSourceBadge).
function renderUsers() {
  const body = document.getElementById("usersBody");
  body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">Chargement…</td></tr>';

  apiListUtilisateurs().then(list => {
    state.apiUsers = list.map(mapBackendUser);
    state.usersSource = "api";
    renderUsersTable(state.apiUsers);
    renderUsersSourceBadge();
  }).catch(err => {
    state.usersSource = "local";
    renderUsersTable(state.users);
    renderUsersSourceBadge();
  });
}

function renderUsersSourceBadge() {
  const el = document.getElementById("usersSourceBadge");
  if (!el) return;
  if (state.usersSource === "api") {
    el.textContent = "Connecté à l'API";
    el.className = "pill validee";
  } else {
    el.textContent = "Mode démo local (backend injoignable)";
    el.className = "pill attente";
  }
}

function renderUsersTable(list) {
  const body = document.getElementById("usersBody");
  body.innerHTML = "";
  list.forEach(u => {
    const tr = document.createElement("tr");
    const statutClass = u.statut === "Actif" ? "actif" : "inactif";
    tr.innerHTML =
      "<td>" + u.prenom + " " + u.nom + "</td>" +
      "<td>" + u.email + "</td>" +
      "<td>" + u.role + "</td>" +
      "<td>" + (u.structure || "—") + "</td>" +
      "<td>" + (u.dateCreation || "—") + "</td>" +
      '<td><span class="pill ' + statutClass + '">' + u.statut + "</span></td>" +
      '<td class="row-actions">' +
        '<button class="icon-btn" data-action="toggle" data-id="' + u.id + '" title="Activer / désactiver">' + iconToggle() + "</button>" +
        '<button class="icon-btn danger" data-action="delete" data-id="' + u.id + '" title="Supprimer">' + iconTrash() + "</button>" +
      "</td>";
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      if (state.usersSource === "api") {
        const u = state.apiUsers.find(x => x.id === id);
        apiSetUtilisateurActif(id, u.statut !== "Actif").then(() => renderUsers())
          .catch(err => showInfoModal("Erreur API", "<p>" + escapeHtml(err.message) + "</p>"));
        return;
      }
      const u = state.users.find(x => x.id === id);
      u.statut = u.statut === "Actif" ? "Inactif" : "Actif";
      saveJSON("pec_users", state.users);
      renderUsers();
    });
  });
  body.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      const source = state.usersSource === "api" ? state.apiUsers : state.users;
      const u = source.find(x => x.id === id);
      askConfirm("Le compte de " + (u ? u.prenom + " " + u.nom : "cet utilisateur") + " sera définitivement supprimé et perdra tout accès à la plateforme.", () => {
        if (state.usersSource === "api") {
          apiDeleteUtilisateur(id).then(() => renderUsers())
            .catch(err => showInfoModal("Erreur API", "<p>" + escapeHtml(err.message) + "</p>"));
          return;
        }
        state.users = state.users.filter(x => x.id !== id);
        saveJSON("pec_users", state.users);
        renderUsers();
      }, { title: "Supprimer cet utilisateur ?" });
    });
  });
}

const userModal = document.getElementById("userModal");
document.getElementById("addUserBtn").addEventListener("click", () => {
  document.getElementById("u-date-creation").value = todayFR();
  userModal.hidden = false;
});
document.getElementById("closeUserModal").addEventListener("click", () => { userModal.hidden = true; });
document.getElementById("cancelUserModal").addEventListener("click", () => { userModal.hidden = true; });

document.getElementById("userForm").addEventListener("submit", e => {
  e.preventDefault();
  const nomComplet = document.getElementById("u-nom").value.trim();
  const parts = nomComplet.split(" ");
  const prenom = parts.shift() || nomComplet;
  const nom = parts.join(" ") || "";
  const email = document.getElementById("u-email").value.trim();
  const role = document.getElementById("u-role").value;

  if (state.usersSource === "api") {
    // POST /api/auth/register — id_structure vaut 1 par défaut, faute d'un
    // module "Structure" exposé par l'API pour choisir la vraie structure
    // (voir le PDF, "Périmètre connecté").
    apiRegister({
      username: (email.split("@")[0] || "").toLowerCase(),
      mot_de_passe: document.getElementById("u-pass").value || "changeme123",
      nom: nomComplet,
      email: email,
      telephone: "",
      role: FRONT_ROLE_TO_API_ROLE[role] || role,
      id_structure: 1
    }).then(() => {
      document.getElementById("userForm").reset();
      userModal.hidden = true;
      renderUsers();
    }).catch(err => showInfoModal("Erreur API", "<p>" + escapeHtml(err.message) + "</p>"));
    return;
  }

  const newUser = {
    id: Date.now(),
    nom: nom,
    prenom: prenom,
    email: email,
    username: (email.split("@")[0] || "").toLowerCase(),
    role: role,
    structure: document.getElementById("u-structure").value.trim(),
    dateCreation: todayFR(),
    statut: "Actif"
  };
  state.users.push(newUser);
  saveJSON("pec_users", state.users);
  document.getElementById("userForm").reset();
  userModal.hidden = true;
  renderUsers();
});

/* ---------------------------------------------------------------------- */
/* Journalisation : filtres + tableau des connexions                       */
/* ---------------------------------------------------------------------- */

function populateJournalRoleFilter() {
  const sel = document.getElementById("logFilterRole");
  const current = sel.value;
  const roles = Array.from(new Set(state.connexionLog.map(l => l.role).filter(Boolean))).sort();
  sel.innerHTML = '<option value="">Tous les rôles</option>' + roles.map(r => '<option value="' + r.replace(/"/g, "&quot;") + '">' + r + "</option>").join("");
  sel.value = current;
}

function getFilteredJournal() {
  const f = state.journalFilters;
  return state.connexionLog.filter(l => {
    if (f.role && l.role !== f.role) return false;
    if (f.statut && l.statut !== f.statut) return false;
    if (f.search) {
      const hay = ((l.nom || "") + " " + (l.email || "")).toLowerCase();
      if (!hay.includes(f.search.toLowerCase())) return false;
    }
    if (f.from || f.to) {
      const d = parseFRDate(l.date);
      if (!d) return false;
      if (f.from && d < new Date(f.from)) return false;
      if (f.to && d > new Date(f.to + "T23:59:59")) return false;
    }
    return true;
  });
}

function renderJournalisation() {
  populateJournalRoleFilter();
  const list = getFilteredJournal();

  const todayStr = todayFR();
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const recent = state.connexionLog.filter(l => {
    const d = parseFRDate(l.date);
    return d && d >= since30;
  });
  document.getElementById("logKpiToday").textContent = state.connexionLog.filter(l => l.date === todayStr && l.statut === "Succès").length;
  document.getElementById("logKpiUniques").textContent = new Set(recent.filter(l => l.statut === "Succès").map(l => l.email)).size;
  document.getElementById("logKpiEchecs").textContent = recent.filter(l => l.statut === "Échec").length;
  document.getElementById("logKpiDerniere").textContent = state.connexionLog.length ? (state.connexionLog[0].date + " " + state.connexionLog[0].heure) : "—";

  const body = document.getElementById("journalBody");
  const empty = document.getElementById("journalEmpty");
  body.innerHTML = "";
  empty.hidden = list.length > 0;
  list.forEach(l => {
    const tr = document.createElement("tr");
    const statutClass = l.statut === "Succès" ? "actif" : "inactif";
    tr.innerHTML =
      "<td>" + (l.nom || "—") + " <span style=\"color:var(--muted)\">(" + (l.email || "—") + ")</span></td>" +
      "<td>" + (l.role || "—") + "</td>" +
      "<td>" + l.date + "</td>" +
      "<td>" + l.heure + "</td>" +
      '<td><span class="pill ' + statutClass + '">' + l.statut + "</span></td>";
    body.appendChild(tr);
  });
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
    renderJournalisation();
  });
});
document.getElementById("logFilterResetBtn").addEventListener("click", () => {
  document.getElementById("logFilterSearch").value = "";
  document.getElementById("logFilterRole").value = "";
  document.getElementById("logFilterStatut").value = "";
  document.getElementById("logFilterFrom").value = "";
  document.getElementById("logFilterTo").value = "";
  state.journalFilters = { search: "", role: "", statut: "", from: "", to: "" };
  renderJournalisation();
});

/* ---------------------------------------------------------------------- */
/* Espace Pharmacien : recherche d'ordonnance par NAG et délivrance        */
/* ---------------------------------------------------------------------- */

// Taux de remboursement CNAMGS appliqué au tarif de base du médicament, selon
// le ticket modérateur déjà enregistré sur la feuille de soins (même logique
// que pour les prestations : la donnée vient de l'étape agent, verrouillée ici).
const TM_RATE = { "Plein": 0.8, "Plein (ALD)": 1, "Exonéré": 1 };

function medicamentPrix(designation) {
  const m = MEDICAMENTS.find(x => x.designation === designation);
  return m ? m.prix : 0;
}

function resetPharmaSearch() {
  document.getElementById("pharmaNagInput").value = "";
  document.getElementById("pharmaDateInput").value = "";
  document.getElementById("pharmaNotFound").hidden = true;
  document.getElementById("pharmaAssureCard").hidden = true;
  document.getElementById("pharmaResults").innerHTML = "";
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// L'identité s'affiche dès que le NAG correspond à une consultation connue,
// même si la date renseignée ne donne aucune ordonnance — le pharmacien voit
// alors que le patient existe bien, seule la prestation recherchée manque.
function findPharmaIdentity(nag) {
  return state.historique.find(h => h.type === "Consultation" && h.matricule === nag && h.patientNom) || null;
}

function renderPharmaAssureCard(identity) {
  const card = document.getElementById("pharmaAssureCard");
  if (!identity) { card.hidden = true; return; }
  card.hidden = false;
  document.getElementById("pa-nom").textContent = identity.patientNom || "—";
  document.getElementById("pa-matricule").textContent = identity.matricule || "—";
  document.getElementById("pa-naissance").textContent = identity.dateNaissance || "—";
  document.getElementById("pa-fonds").textContent = identity.fonds || "—";
  const parts = (identity.patientNom || "").split(" ");
  setAvatar(document.getElementById("pa-avatar"), parts[0], parts.slice(1).join(" "));
}

function runPharmaSearch(nag, dateStr) {
  nag = (nag || "").trim();
  const targetDate = dateStr ? new Date(dateStr + "T00:00:00") : null;
  const entries = state.historique.filter(h => {
    if (h.type !== "Consultation" || h.statut !== "Validée") return false;
    if (h.matricule !== nag) return false;
    if (!(h.ordonnance || []).length) return false;
    if (targetDate) {
      const d = parseFRDate(h.date);
      if (!d || !isSameDay(d, targetDate)) return false;
    }
    return true;
  });
  document.getElementById("pharmaNotFound").hidden = !nag || entries.length > 0;
  renderPharmaAssureCard(nag ? findPharmaIdentity(nag) : null);
  renderPharmaResults(entries);
}

document.getElementById("pharmaSearchBtn").addEventListener("click", () => {
  runPharmaSearch(document.getElementById("pharmaNagInput").value, document.getElementById("pharmaDateInput").value);
});

function renderPharmaResults(entries) {
  const wrap = document.getElementById("pharmaResults");
  wrap.innerHTML = "";

  entries.forEach(entry => {
    const rate = TM_RATE[entry.ticketModerateur] != null ? TM_RATE[entry.ticketModerateur] : 0.8;

    const rows = entry.ordonnance.map((med, i) => {
      const prix = medicamentPrix(med.designation);
      const servi = med.statut === "Servi";
      const partAssurance = servi ? num(med.partAssurance) : Math.round(prix * rate);
      const partPatient = servi ? num(med.partPatient) : (prix - Math.round(prix * rate));
      const actionCell = servi
        ? '<span class="rx-served-note">Servi le ' + med.dateService + " — " + med.servicePar + "</span>"
        : '<button type="button" class="btn-primary btn-sm" data-action="servir" data-entry="' + entry.id + '" data-idx="' + i + '">Servir</button>';
      return '<tr class="' + (servi ? "rx-row-done" : "") + '">' +
        "<td>" + med.designation + "</td>" +
        "<td>" + med.quantite + "</td>" +
        "<td>" + (med.posologie || "—") + "</td>" +
        "<td>" + fmt(prix) + "</td>" +
        "<td>" + fmt(partAssurance) + "</td>" +
        "<td>" + fmt(partPatient) + "</td>" +
        '<td><span class="pill ' + (servi ? "validee" : "attente") + '">' + med.statut + "</span></td>" +
        "<td>" + actionCell + "</td>" +
      "</tr>";
    }).join("");

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      '<div class="card-head"><h3>' + (entry.patientNom || "") + " — Feuille " + entry.numero + "</h3>" +
        '<span class="pill consultation">Consultation du ' + entry.date + "</span>" +
      "</div>" +
      '<div class="card-body" style="padding-top:0">' +
        '<p class="hint" style="margin-top:0">Prescrit par <b>' + (entry.medecin || "—") + "</b>" + (entry.medecinEtab ? " — " + entry.medecinEtab : "") + "</p>" +
      "</div>" +
      '<div class="card-body" style="padding:0">' +
        '<table class="data-table">' +
          "<thead><tr><th>Désignation</th><th>Quantité</th><th>Posologie / Durée</th><th>Prix</th><th>Part assurance</th><th>Part patient</th><th>Statut</th><th>Action</th></tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>" +
      "</div>";
    wrap.appendChild(card);

    card.querySelectorAll('[data-action="servir"]').forEach(btn => {
      btn.addEventListener("click", () => {
        if (!confirm("Confirmer la délivrance de ce médicament ?")) return;
        const targetEntry = state.historique.find(h => h.id === parseInt(btn.dataset.entry, 10));
        if (!targetEntry) return;
        const med = targetEntry.ordonnance[parseInt(btn.dataset.idx, 10)];
        if (!med || med.statut === "Servi") return;

        const prix = medicamentPrix(med.designation);
        const r = TM_RATE[targetEntry.ticketModerateur] != null ? TM_RATE[targetEntry.ticketModerateur] : 0.8;
        const pa = Math.round(prix * r);

        med.statut = "Servi";
        med.dateService = todayFR();
        med.servicePar = (state.currentUser && state.currentUser.etablissement) ? state.currentUser.etablissement : "Pharmacie";
        med.prixUnitaire = String(prix);
        med.partAssurance = String(pa);
        med.partPatient = String(prix - pa);

        saveJSON("pec_historique", state.historique);
        runPharmaSearch(document.getElementById("pharmaNagInput").value, document.getElementById("pharmaDateInput").value);
      });
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Tableau de bord : suivi des prestations des pharmacies partenaires      */
/* ---------------------------------------------------------------------- */

function fmtFCFA(n) { return fmt(n) + " FCFA"; }

// Toutes les lignes de médicaments effectivement servies (données réelles,
// issues de state.historique[].ordonnance — voir l'espace Pharmacien).
function getServedMedicaments() {
  const meds = [];
  state.historique.forEach(h => {
    (h.ordonnance || []).forEach(med => {
      if (med.statut === "Servi" && med.servicePar) meds.push(med);
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
    const reste = Math.max(0, p.montantTotal - paye);
    const statut = paye <= 0 ? "Impayé" : (reste <= 0 ? "Payé" : "Partiellement payé");
    return { pharmacie: p.pharmacie, count: p.count, montantTotal: p.montantTotal, paye: paye, reste: reste, statut: statut };
  });

  if (f.statut) list = list.filter(p => p.statut === f.statut);
  list.sort((a, b) => b.reste - a.reste);
  return list;
}

// Nombre de pharmacies partenaires enregistrées (state.users, rôle Pharmacie) —
// un décompte du réseau, indépendant de la période/du statut de règlement.
function getPartnerPharmacyCount(filters) {
  const f = filters || EMPTY_PHARMA_FILTERS;
  const names = new Set(state.users.filter(u => u.role === "Pharmacie" && u.etablissement).map(u => u.etablissement));
  if (f.pharmacie) return names.has(f.pharmacie) ? 1 : 0;
  return names.size;
}

function monthLabel(b) {
  const name = MOIS[b.month];
  return name.charAt(0).toUpperCase() + name.slice(1) + " " + b.year;
}

function getPharmaEvolutionByMonth(meds) {
  const buckets = {};
  meds.forEach(med => {
    const d = parseFRDate(med.dateService);
    if (!d) return;
    const key = d.getFullYear() + "-" + pad(d.getMonth() + 1);
    if (!buckets[key]) buckets[key] = { key: key, year: d.getFullYear(), month: d.getMonth(), count: 0, montant: 0 };
    buckets[key].count++;
    buckets[key].montant += num(med.partAssurance);
  });
  return Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));
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

  list.forEach(p => {
    const statutClass = p.statut === "Payé" ? "validee" : (p.statut === "Impayé" ? "inactif" : "attente");
    const actionCell = p.reste > 0
      ? '<button type="button" class="btn-secondary btn-sm" data-action="regler" data-pharmacie="' + p.pharmacie.replace(/"/g, "&quot;") + '">Enregistrer un paiement</button>'
      : '<span class="rx-served-note">Soldé</span>';
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + p.pharmacie + "</td>" +
      "<td>" + p.count + "</td>" +
      "<td>" + fmtFCFA(p.montantTotal) + "</td>" +
      "<td>" + fmtFCFA(p.paye) + "</td>" +
      "<td>" + fmtFCFA(p.reste) + "</td>" +
      '<td><span class="pill ' + statutClass + '">' + p.statut + "</span></td>" +
      '<td class="row-actions">' + actionCell + "</td>";
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-action="regler"]').forEach(btn => {
    btn.addEventListener("click", () => openReglementModal(btn.dataset.pharmacie));
  });
}

// Dashboard : vue synthétique, toujours globale (aucun filtre) — cartes + graphiques.
function renderPharmaDashboard() {
  const aggregates = getPharmacieAggregates(null);
  const totalPrestations = aggregates.reduce((a, p) => a + p.count, 0);
  const totalMontant = aggregates.reduce((a, p) => a + p.montantTotal, 0);
  const totalPaye = aggregates.reduce((a, p) => a + p.paye, 0);
  const totalReste = aggregates.reduce((a, p) => a + p.reste, 0);

  document.getElementById("pharmaStatCount").textContent = getPartnerPharmacyCount(null);
  document.getElementById("pharmaStatPrestations").textContent = totalPrestations;
  document.getElementById("pharmaStatMontant").textContent = fmtFCFA(totalMontant);
  document.getElementById("pharmaStatPaye").textContent = fmtFCFA(totalPaye);
  document.getElementById("pharmaStatReste").textContent = fmtFCFA(totalReste);

  renderBarChart("pharmaBarChart", "pharmaBarTooltip",
    aggregates.map(p => ({ label: p.pharmacie, value: p.reste })),
    { color: "var(--blue)", tooltip: it => "<b>" + it.label + "</b> — " + fmtFCFA(it.value) + " restant dû" }
  );

  const monthBuckets = getPharmaEvolutionByMonth(getPharmaSuiviPeriodFiltered(null));
  renderBarChart("pharmaEvoChart", "pharmaEvoTooltip",
    monthBuckets.map(b => ({ label: monthLabel(b), value: b.count, montant: b.montant })),
    { color: "var(--green)", tooltip: it => "<b>" + it.label + "</b> — " + it.value + " prestation(s)" + (it.montant ? " — " + fmtFCFA(it.montant) : "") }
  );
}

// Page Rapports : vue détaillée, respecte state.pharmaSuiviFilters — tableau uniquement.
function renderPharmaRapport() {
  renderPharmaSuiviTable(getPharmacieAggregates(state.pharmaSuiviFilters));
}

function populatePharmaFilterOptions() {
  const sel = document.getElementById("pharmaFilterPharmacie");
  const current = sel.value;
  const names = Array.from(new Set(state.users.filter(u => u.role === "Pharmacie" && u.etablissement).map(u => u.etablissement))).sort();
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

function openReglementModal(pharmacie) {
  document.getElementById("reg-pharmacie").value = pharmacie;
  document.getElementById("reg-montant").value = "";
  document.getElementById("reg-note").value = "";
  document.getElementById("reglementModal").hidden = false;
}
document.getElementById("closeReglementModal").addEventListener("click", () => { document.getElementById("reglementModal").hidden = true; });
document.getElementById("cancelReglementModal").addEventListener("click", () => { document.getElementById("reglementModal").hidden = true; });
document.getElementById("reglementForm").addEventListener("submit", e => {
  e.preventDefault();
  const pharmacie = document.getElementById("reg-pharmacie").value;
  const montant = num(document.getElementById("reg-montant").value);
  if (!pharmacie || montant <= 0) return;
  state.reglements.push({
    id: Date.now(),
    pharmacie: pharmacie,
    montant: montant,
    date: todayFR(),
    note: document.getElementById("reg-note").value.trim()
  });
  saveJSON("pec_reglements", state.reglements);
  document.getElementById("reglementModal").hidden = true;
  renderPharmaRapport();
});

/* ---------------------------------------------------------------------- */
/* Tableau de bord : suivi des prestations des hôpitaux partenaires        */
/* ---------------------------------------------------------------------- */

// Une feuille de soins validée = une prestation réellement réalisée par
// l'hôpital (medecinEtab). Montant dû à l'hôpital = totalPart, c'est-à-dire
// le champ déjà existant "Total à payer par la CNAMGS" (pas le montant total
// facturé, qui inclut la part du patient).
const EMPTY_HOPITAL_FILTERS = { from: "", to: "", hopital: "", type: "", statut: "" };

function getHopitalSuiviFiltered(filters) {
  const f = filters || EMPTY_HOPITAL_FILTERS;
  return state.historique.filter(h => {
    if (h.statut !== "Validée" || !h.medecinEtab) return false;
    if (f.hopital && h.medecinEtab !== f.hopital) return false;
    if (f.type && h.type !== f.type) return false;
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
    const reste = Math.max(0, h.montantTotal - paye);
    const statut = paye <= 0 ? "Impayé" : (reste <= 0 ? "Payé" : "Partiellement payé");
    return { hopital: h.hopital, consult: h.consult, exam: h.exam, count: h.consult + h.exam, montantTotal: h.montantTotal, paye: paye, reste: reste, statut: statut };
  });

  if (f.statut) list = list.filter(p => p.statut === f.statut);
  list.sort((a, b) => b.reste - a.reste);
  return list;
}

// Nombre d'hôpitaux partenaires enregistrés (MEDECINS, champ etablissement) —
// un décompte du réseau, indépendant de la période/du statut de règlement.
function getPartnerHospitalCount(filters) {
  const f = filters || EMPTY_HOPITAL_FILTERS;
  const names = new Set(MEDECINS.map(m => m.etablissement).filter(Boolean));
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

  list.forEach(p => {
    const statutClass = p.statut === "Payé" ? "validee" : (p.statut === "Impayé" ? "inactif" : "attente");
    const actionCell = p.reste > 0
      ? '<button type="button" class="btn-secondary btn-sm" data-action="regler-hopital" data-hopital="' + p.hopital.replace(/"/g, "&quot;") + '">Enregistrer un paiement</button>'
      : '<span class="rx-served-note">Soldé</span>';
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + p.hopital + "</td>" +
      "<td>" + p.consult + "</td>" +
      "<td>" + p.exam + "</td>" +
      "<td>" + p.count + "</td>" +
      "<td>" + fmtFCFA(p.montantTotal) + "</td>" +
      "<td>" + fmtFCFA(p.paye) + "</td>" +
      "<td>" + fmtFCFA(p.reste) + "</td>" +
      '<td><span class="pill ' + statutClass + '">' + p.statut + "</span></td>" +
      '<td class="row-actions">' + actionCell + "</td>";
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-action="regler-hopital"]').forEach(btn => {
    btn.addEventListener("click", () => openReglementHopitalModal(btn.dataset.hopital));
  });
}

// Dashboard : vue synthétique, toujours globale (aucun filtre) — cartes + graphiques.
function renderHopitalDashboard() {
  const aggregates = getHopitalAggregates(null);
  const totalConsult = aggregates.reduce((a, p) => a + p.consult, 0);
  const totalExam = aggregates.reduce((a, p) => a + p.exam, 0);
  const totalMontant = aggregates.reduce((a, p) => a + p.montantTotal, 0);
  const totalPaye = aggregates.reduce((a, p) => a + p.paye, 0);
  const totalReste = aggregates.reduce((a, p) => a + p.reste, 0);

  document.getElementById("hospStatCount").textContent = getPartnerHospitalCount(null);
  document.getElementById("hospStatPrestations").textContent = totalConsult + totalExam;
  document.getElementById("hospStatConsult").textContent = totalConsult;
  document.getElementById("hospStatExam").textContent = totalExam;
  document.getElementById("hospStatMontant").textContent = fmtFCFA(totalMontant);
  document.getElementById("hospStatPaye").textContent = fmtFCFA(totalPaye);
  document.getElementById("hospStatReste").textContent = fmtFCFA(totalReste);

  renderBarChart("hospResteChart", "hospResteTooltip",
    aggregates.map(p => ({ label: p.hopital, value: p.reste })),
    { color: "var(--blue)", tooltip: it => "<b>" + it.label + "</b> — " + fmtFCFA(it.value) + " restant dû" }
  );

  const monthBuckets = getHopitalEvolutionByMonth(getHopitalSuiviFiltered(null));
  renderGroupedBarChart("hospEvoChart", "hospEvoTooltip",
    monthBuckets.map(b => ({ label: monthLabel(b), a: b.consult, b: b.exam, montant: b.montant })),
    { tooltip: it => "<b>" + it.label + "</b><br>Consultations : " + it.a + "<br>Examens : " + it.b + (it.montant ? "<br>Montant : " + fmtFCFA(it.montant) : "") }
  );
}

// Page Rapports : vue détaillée, respecte state.hopitalSuiviFilters — tableau
// + comparaison consultations/examens par hôpital.
function renderHopitalRapport() {
  const aggregates = getHopitalAggregates(state.hopitalSuiviFilters);
  renderHopitalSuiviTable(aggregates);
  renderGroupedBarChart("hospCompareChart", "hospCompareTooltip",
    aggregates.map(p => ({ label: p.hopital, a: p.consult, b: p.exam })),
    { tooltip: it => "<b>" + it.label + "</b><br>Consultations : " + it.a + "<br>Examens : " + it.b + "<br>Total : " + (it.a + it.b) + " prestation(s)" }
  );
}

function populateHospFilterOptions() {
  const sel = document.getElementById("hospFilterHopital");
  const current = sel.value;
  const names = Array.from(new Set(MEDECINS.map(m => m.etablissement).filter(Boolean))).sort();
  sel.innerHTML = '<option value="">Tous les hôpitaux</option>' + names.map(n => '<option value="' + n.replace(/"/g, "&quot;") + '">' + n + "</option>").join("");
  sel.value = current;
}

["hospFilterFrom", "hospFilterTo", "hospFilterHopital", "hospFilterType", "hospFilterStatut"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    state.hopitalSuiviFilters = {
      from: document.getElementById("hospFilterFrom").value,
      to: document.getElementById("hospFilterTo").value,
      hopital: document.getElementById("hospFilterHopital").value,
      type: document.getElementById("hospFilterType").value,
      statut: document.getElementById("hospFilterStatut").value
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
  state.hopitalSuiviFilters = { from: "", to: "", hopital: "", type: "", statut: "" };
  renderHopitalRapport();
});

function openReglementHopitalModal(hopital) {
  document.getElementById("regh-hopital").value = hopital;
  document.getElementById("regh-montant").value = "";
  document.getElementById("regh-note").value = "";
  document.getElementById("reglementHopitalModal").hidden = false;
}
document.getElementById("closeReglementHopitalModal").addEventListener("click", () => { document.getElementById("reglementHopitalModal").hidden = true; });
document.getElementById("cancelReglementHopitalModal").addEventListener("click", () => { document.getElementById("reglementHopitalModal").hidden = true; });
document.getElementById("reglementHopitalForm").addEventListener("submit", e => {
  e.preventDefault();
  const hopital = document.getElementById("regh-hopital").value;
  const montant = num(document.getElementById("regh-montant").value);
  if (!hopital || montant <= 0) return;
  state.reglementsHopitaux.push({
    id: Date.now(),
    hopital: hopital,
    montant: montant,
    date: todayFR(),
    note: document.getElementById("regh-note").value.trim()
  });
  saveJSON("pec_reglements_hopitaux", state.reglementsHopitaux);
  document.getElementById("reglementHopitalModal").hidden = true;
  renderHopitalRapport();
});

/* ---------------------------------------------------------------------- */
/* Statistiques (vue Direction) : agrégats globaux + filtres avancés       */
/* ---------------------------------------------------------------------- */

state.statsFilters = { from: "", to: "", type: "", statut: "", fonds: "", medecin: "", search: "" };

function getStatsFiltered() {
  const f = state.statsFilters;
  return state.historique.filter(h => {
    if (f.type && h.type !== f.type) return false;
    if (f.statut && h.statut !== f.statut) return false;
    if (f.fonds && h.fonds !== f.fonds) return false;
    if (f.medecin && h.medecin !== f.medecin) return false;
    if (f.search) {
      const hay = ((h.patientNom || "") + " " + (h.matricule || "")).toLowerCase();
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

function populateStatsMedecinFilter() {
  const sel = document.getElementById("statsFilterMedecin");
  const current = sel.value;
  const names = Array.from(new Set(state.historique.map(h => h.medecin).filter(Boolean))).sort();
  sel.innerHTML = '<option value="">Tous les médecins</option>' + names.map(n => '<option value="' + n.replace(/"/g, "&quot;") + '">' + n + "</option>").join("");
  sel.value = current;
}

// Barre de répartition en pourcentage (segments = [{ label, value, color }]) —
// utilisée pour Type de prestation et Fonds sur la page Statistiques.
function renderSplitBar(barId, legendId, segments) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const bar = document.getElementById(barId);
  const legend = document.getElementById(legendId);
  if (!total) {
    bar.innerHTML = '<div class="split-bar-empty"></div>';
    legend.innerHTML = '<div class="empty-state" style="padding:6px 0">Aucune donnée pour ces filtres.</div>';
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

function renderStatistiques() {
  populateStatsMedecinFilter();
  const filtered = getStatsFiltered();

  const totalPEC = filtered.length;
  const uniquePatients = new Set(filtered.map(h => h.matricule).filter(Boolean)).size;
  const totalMontant = filtered.reduce((a, h) => a + num(h.totalMontant), 0);
  const totalCharge = filtered.reduce((a, h) => a + num(h.totalPart), 0);
  const validees = filtered.filter(h => h.statut === "Validée").length;
  const tauxValidation = totalPEC ? Math.round((validees / totalPEC) * 100) : 0;
  const consultCount = filtered.filter(h => h.type === "Consultation").length;
  const examCount = filtered.filter(h => h.type === "Examen").length;

  document.getElementById("statsKpiTotal").textContent = totalPEC;
  document.getElementById("statsKpiPatients").textContent = uniquePatients;
  document.getElementById("statsKpiMontant").textContent = fmtFCFA(totalMontant);
  document.getElementById("statsKpiCharge").textContent = fmtFCFA(totalCharge);
  document.getElementById("statsKpiValidation").textContent = tauxValidation + "%";

  // Restant dû : agrégats globaux hôpitaux + pharmacies (leurs propres filtres
  // de période/statut, distincts de ceux de cette page — vision "toutes périodes").
  const pharmaAgg = getPharmacieAggregates(null);
  const hopAgg = getHopitalAggregates(null);
  const pharmaReste = pharmaAgg.reduce((a, p) => a + p.reste, 0);
  const hopReste = hopAgg.reduce((a, p) => a + p.reste, 0);
  document.getElementById("statsKpiReste").textContent = fmtFCFA(pharmaReste + hopReste);

  renderSplitBar("statsTypeSplit", "statsTypeLegend", [
    { label: "Consultations", value: consultCount, color: "var(--green)" },
    { label: "Examens", value: examCount, color: "var(--blue)" }
  ]);

  const fondsList = ["Fonds Secteur Privé", "Fonds Secteur Public", "Fonds Garantie Sociale"];
  const fondsColors = ["var(--blue)", "var(--green)", "var(--yellow-dark)"];
  renderSplitBar("statsFondsSplit", "statsFondsLegend",
    fondsList.map((f, i) => ({ label: f.replace("Fonds ", ""), value: filtered.filter(h => h.fonds === f).length, color: fondsColors[i] }))
  );

  const monthBuckets = getHopitalEvolutionByMonth(filtered);
  renderGroupedBarChart("statsEvoChart", "statsEvoTooltip",
    monthBuckets.map(b => ({ label: monthLabel(b), a: b.consult, b: b.exam, montant: b.montant })),
    { tooltip: it => "<b>" + it.label + "</b><br>Consultations : " + it.a + "<br>Examens : " + it.b + "<br>Part CNAMGS : " + fmtFCFA(it.montant) }
  );

  renderBarChart("statsTopHopChart", "statsTopHopTooltip",
    hopAgg.slice(0, 8).map(h => ({ label: h.hopital, value: h.montantTotal })),
    { color: "var(--green)", tooltip: it => "<b>" + it.label + "</b> — " + fmtFCFA(it.value) }
  );
  renderBarChart("statsTopPharmChart", "statsTopPharmTooltip",
    pharmaAgg.slice(0, 8).map(p => ({ label: p.pharmacie, value: p.montantTotal })),
    { color: "var(--blue)", tooltip: it => "<b>" + it.label + "</b> — " + fmtFCFA(it.value) }
  );
}

["statsFilterFrom", "statsFilterTo", "statsFilterType", "statsFilterStatut", "statsFilterFonds", "statsFilterMedecin", "statsFilterSearch"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    state.statsFilters = {
      from: document.getElementById("statsFilterFrom").value,
      to: document.getElementById("statsFilterTo").value,
      type: document.getElementById("statsFilterType").value,
      statut: document.getElementById("statsFilterStatut").value,
      fonds: document.getElementById("statsFilterFonds").value,
      medecin: document.getElementById("statsFilterMedecin").value,
      search: document.getElementById("statsFilterSearch").value.trim()
    };
    renderStatistiques();
  });
});
document.getElementById("statsFilterResetBtn").addEventListener("click", () => {
  document.getElementById("statsFilterFrom").value = "";
  document.getElementById("statsFilterTo").value = "";
  document.getElementById("statsFilterType").value = "";
  document.getElementById("statsFilterStatut").value = "";
  document.getElementById("statsFilterFonds").value = "";
  document.getElementById("statsFilterMedecin").value = "";
  document.getElementById("statsFilterSearch").value = "";
  state.statsFilters = { from: "", to: "", type: "", statut: "", fonds: "", medecin: "", search: "" };
  renderStatistiques();
});
document.getElementById("statsExportBtn").addEventListener("click", () => { window.print(); });

// Rapports : pas une capture de la page, mais un vrai document généré à partir
// des données actuellement affichées (filtres + onglet actif), avec en-tête
// CNAMGS — imprimé seul, le reste de l'app étant masqué (voir @media print).
function buildRapportReportHtml(tab) {
  let title, filtersParts, theadHtml, rowsHtml, totals;

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
      reste: list.reduce((a, p) => a + p.reste, 0)
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
      f.statut ? "Statut : " + f.statut : null
    ];
    totals = {
      count: list.length,
      montant: list.reduce((a, p) => a + p.montantTotal, 0),
      paye: list.reduce((a, p) => a + p.paye, 0),
      reste: list.reduce((a, p) => a + p.reste, 0)
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
      "<div><b>" + totals.count + "</b><span>Établissement(s)</span></div>" +
      "<div><b>" + fmtFCFA(totals.montant) + "</b><span>Montant total</span></div>" +
      "<div><b>" + fmtFCFA(totals.paye) + "</b><span>Montant payé</span></div>" +
      "<div><b>" + fmtFCFA(totals.reste) + "</b><span>Reste à payer</span></div>" +
    "</div>" +
    '<table class="report-table"><thead>' + theadHtml + "</thead><tbody>" + rowsHtml + "</tbody></table>" +
    '<div class="report-footer">CNAMGS — Plateforme de gestion du circuit de l’assuré · Rapport généré automatiquement (prototype front-end)</div>' +
  "</div>";
}

document.getElementById("rapportsExportBtn").addEventListener("click", () => {
  const activeChip = document.querySelector("#rapportsTabToggle .chip.active");
  const tab = activeChip ? activeChip.dataset.tab : "hopitaux";
  document.getElementById("reportPrintArea").innerHTML = buildRapportReportHtml(tab);
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
        (h.matricule || "") + "</td><td>" + h.type + "</td><td>" + (h.statut || "Validée") + "</td><td>" + fmt(num(h.totalMontant)) + "</td></tr>"
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
  document.body.classList.add("printing-report");
  window.print();
  document.body.classList.remove("printing-report");
});

/* ---------------------------------------------------------------------- */
/* Gestion des permissions (Super Admin) : matrice rôle → vues autorisées  */
/* ---------------------------------------------------------------------- */

function landingOptionsHtml(views) {
  return views.map(v => {
    const label = (PERMISSION_VIEWS.find(pv => pv.key === v) || {}).label || v;
    return '<option value="' + v + '">' + label + "</option>";
  }).join("");
}

function renderPermissions() {
  const body = document.getElementById("permissionsBody");
  body.innerHTML = "";

  Object.keys(state.roleAccess).forEach(role => {
    const tr = document.createElement("tr");

    if (role === "Super Admin") {
      tr.innerHTML =
        "<td><b>" + role + "</b></td>" +
        PERMISSION_VIEWS.map(() => '<td style="text-align:center"><input type="checkbox" checked disabled /></td>').join("") +
        '<td><span class="rx-served-note">Tous les accès (non modifiable)</span></td>';
      body.appendChild(tr);
      return;
    }

    const access = state.roleAccess[role];
    let tds = "<td><b>" + role + "</b></td>";
    PERMISSION_VIEWS.forEach(v => {
      const checked = access.views.includes(v.key);
      tds += '<td style="text-align:center"><input type="checkbox" data-role="' + role + '" data-view="' + v.key + '"' + (checked ? " checked" : "") + " /></td>";
    });
    tds += '<td><select class="permissions-landing" data-role="' + role + '">' + landingOptionsHtml(access.views) + "</select></td>";
    tr.innerHTML = tds;
    body.appendChild(tr);

    const select = tr.querySelector(".permissions-landing");
    select.value = access.views.includes(access.landing) ? access.landing : (access.views[0] || "");
    select.disabled = access.views.length === 0;
  });

  body.querySelectorAll('input[type="checkbox"][data-role]').forEach(cb => {
    cb.addEventListener("change", () => {
      const access = state.roleAccess[cb.dataset.role];
      const view = cb.dataset.view;
      if (cb.checked) {
        if (!access.views.includes(view)) access.views.push(view);
      } else {
        access.views = access.views.filter(v => v !== view);
        if (access.landing === view) access.landing = access.views[0] || "";
      }
      const select = cb.closest("tr").querySelector(".permissions-landing");
      select.innerHTML = landingOptionsHtml(access.views);
      select.value = access.views.includes(access.landing) ? access.landing : (access.views[0] || "");
      select.disabled = access.views.length === 0;
    });
  });

  body.querySelectorAll("select.permissions-landing").forEach(sel => {
    sel.addEventListener("change", () => {
      state.roleAccess[sel.dataset.role].landing = sel.value;
    });
  });
}

document.getElementById("savePermissionsBtn").addEventListener("click", function () {
  const emptyRole = Object.keys(state.roleAccess).find(role => role !== "Super Admin" && state.roleAccess[role].views.length === 0);
  if (emptyRole) {
    alert("Le rôle « " + emptyRole + " » n'a plus aucune vue autorisée. Cochez au moins une vue avant d'enregistrer.");
    return;
  }
  saveJSON("pec_role_access", state.roleAccess);
  applyRoleAccess(state.currentUser);
  const label = this.textContent;
  this.textContent = "Enregistré";
  setTimeout(() => { this.textContent = label; }, 1500);
});

document.getElementById("resetPermissionsBtn").addEventListener("click", () => {
  if (!confirm("Réinitialiser toutes les permissions aux valeurs par défaut ?")) return;
  state.roleAccess = JSON.parse(JSON.stringify(ROLE_ACCESS_DEFAULT));
  saveJSON("pec_role_access", state.roleAccess);
  applyRoleAccess(state.currentUser);
  renderPermissions();
});

/* ---------------------------------------------------------------------- */
/* Initialisation                                                          */
/* ---------------------------------------------------------------------- */

updateClock();
populatePharmaFilterOptions();
populateHospFilterOptions();
buildLoginParticles();
buildLoginDna();
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
  hopitalSuiviFilters: { from: "", to: "", hopital: "", type: "", statut: "" }
};

// Migration douce : les entrées enregistrées avant l'ajout des actions/du statut avaient des champs manquants.
let historiqueMigrated = false;
state.historique.forEach((h, i) => {
  if (!h.id) { h.id = Date.now() + i; historiqueMigrated = true; }
  if (!h.statut) { h.statut = "Validée"; historiqueMigrated = true; }
  if (!h.ordonnance) { h.ordonnance = []; historiqueMigrated = true; }
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
function mockAuthenticate(email, password) {
  return new Promise(resolve => {
    setTimeout(() => resolve({ ok: true }), 800);
  });
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
  { key: "rapports", label: "Rapports" },
  { key: "nouvelle-pec", label: "Nouvelle prise en charge" },
  { key: "medecin", label: "Espace Médecin" },
  { key: "pharmacie", label: "Espace Pharmacien" },
  { key: "historique", label: "Historique PEC" },
  { key: "users", label: "Gestion des utilisateurs" }
];
const ROLE_ACCESS_DEFAULT = {
  "Super Admin": { views: ["dashboard", "rapports", "nouvelle-pec", "medecin", "pharmacie", "historique", "users"], landing: "dashboard" },
  "DG": { views: ["dashboard", "rapports"], landing: "dashboard" },
  "Médecin": { views: ["medecin"], landing: "medecin" },
  "Agent hospitalier": { views: ["nouvelle-pec", "historique"], landing: "nouvelle-pec" },
  "Pharmacie": { views: ["pharmacie"], landing: "pharmacie" },
  "Caisse": { views: ["dashboard", "rapports"], landing: "rapports" }
};
state.roleAccess = loadJSON("pec_role_access", JSON.parse(JSON.stringify(ROLE_ACCESS_DEFAULT)));

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

let loginSubmitting = false;
document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  if (loginSubmitting) return;

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPass").value;
  let valid = true;

  if (!email) {
    setFieldError("loginEmail", "loginEmailError", "L'adresse e-mail est obligatoire.");
    valid = false;
  } else if (!isValidEmail(email)) {
    setFieldError("loginEmail", "loginEmailError", "Veuillez saisir une adresse e-mail valide.");
    valid = false;
  } else {
    setFieldError("loginEmail", "loginEmailError", "");
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

  mockAuthenticate(email, password).then(() => {
    loginSubmitting = false;
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.querySelector(".btn-label").textContent = "Se connecter";
    document.getElementById("view-login").hidden = true;
    document.getElementById("appShell").hidden = false;
    stopLoginDna();

    state.currentUser = state.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
    applyRoleAccess(state.currentUser);
    updateUserPill(state.currentUser, email);
    const access = state.currentUser ? state.roleAccess[state.currentUser.role] : null;
    if (access && access.landing !== "dashboard") {
      goToView(access.landing);
    } else {
      renderDashboardStats();
    }
  });
});

document.getElementById("togglePass").addEventListener("click", function () {
  const input = document.getElementById("loginPass");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  this.setAttribute("aria-pressed", String(show));
  this.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
  this.querySelector(".eye-on").hidden = show;
  this.querySelector(".eye-off").hidden = !show;
});

// Panneau d'information générique (mot de passe oublié / création de compte / mentions légales).
// Prêt à être remplacé par une vraie navigation si un système de routage est introduit.
function showInfoModal(title, bodyHtml) {
  document.getElementById("infoModalTitle").textContent = title;
  document.getElementById("infoModalBody").innerHTML = bodyHtml;
  document.getElementById("infoModal").hidden = false;
}
document.getElementById("closeInfoModal").addEventListener("click", () => { document.getElementById("infoModal").hidden = true; });
document.getElementById("closeInfoModalBtn").addEventListener("click", () => { document.getElementById("infoModal").hidden = true; });

document.getElementById("forgotPassBtn").addEventListener("click", () => {
  showInfoModal("Mot de passe oublié", "<p>Contactez votre administrateur pour réinitialiser votre mot de passe. La réinitialisation en libre-service sera ajoutée prochainement.</p>");
});

function performLogout() {
  document.getElementById("appShell").hidden = true;
  document.getElementById("view-login").hidden = false;
  document.getElementById("loginForm").reset();
  setFieldError("loginEmail", "loginEmailError", "");
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
  "nouvelle-pec": { title: "Nouvelle prise en charge", crumb: "Accueil / Nouvelle prise en charge" },
  medecin: { title: "Espace Médecin", crumb: "Accueil / Espace Médecin" },
  soins: { title: "Feuille de soins", crumb: "Accueil / Feuille de soins" },
  historique: { title: "Historique PEC", crumb: "Accueil / Historique" },
  users: { title: "Gestion des utilisateurs", crumb: "Accueil / Utilisateurs" },
  pharmacie: { title: "Espace Pharmacien", crumb: "Accueil / Espace Pharmacien" },
  rapports: { title: "Rapports", crumb: "Accueil / Rapports" },
  permissions: { title: "Gestion des permissions", crumb: "Accueil / Permissions" }
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
  document.getElementById("topbarCrumb").textContent = meta.crumb;

  if (name === "historique") renderHistorique();
  if (name === "users") renderUsers();
  if (name === "dashboard") renderDashboardStats();
  if (name === "medecin") renderMedecinQueue();
  if (name === "pharmacie") resetPharmaSearch();
  if (name === "rapports") renderRapports();
  if (name === "permissions") renderPermissions();
}

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

function showAssureCard(assure) {
  document.getElementById("assureFound").hidden = false;
  document.getElementById("af-nom").textContent = assure.prenom + " " + assure.nom;
  document.getElementById("af-situation").textContent = assure.situation;
  document.getElementById("af-matricule").textContent = assure.matricule;
  document.getElementById("af-naissance").textContent = assure.dateNaissance;
  document.getElementById("af-fonds").textContent = assure.fonds;
  document.getElementById("af-employeur").textContent = assure.employeur;

  const select = document.getElementById("patientSelect");
  select.innerHTML = "";
  const optAssure = document.createElement("option");
  optAssure.value = "assure";
  optAssure.textContent = assure.prenom + " " + assure.nom + " (Assuré principal)";
  select.appendChild(optAssure);
  (assure.ayantsDroit || []).forEach((ad, i) => {
    const opt = document.createElement("option");
    opt.value = "ad-" + i;
    opt.textContent = ad.prenom + " " + ad.nom + " (" + ad.lien + ")";
    select.appendChild(opt);
  });
  select.value = "assure";
  updatePatientSelection();

  state.currentTM = null;
  state.currentMedecin = null;
  document.querySelectorAll("#tmChoices .chip").forEach(c => c.classList.remove("active"));
  document.getElementById("medecinSelect").value = "";
  updateActionButtons();
}

function updatePatientSelection() {
  const select = document.getElementById("patientSelect");
  const assure = state.currentAssure;
  if (!assure) return;
  if (select.value === "assure") {
    state.currentPatient = {
      matricule: assure.matricule,
      nom: assure.nom,
      prenom: assure.prenom,
      dateNaissance: assure.dateNaissance,
      sexe: assure.sexe,
      estAssure: true
    };
  } else {
    const idx = parseInt(select.value.split("-")[1], 10);
    const ad = assure.ayantsDroit[idx];
    state.currentPatient = {
      matricule: ad.matricule,
      nom: ad.nom,
      prenom: ad.prenom,
      dateNaissance: ad.dateNaissance,
      sexe: ad.sexe,
      estAssure: false
    };
  }
  updateActionButtons();
}

function updateActionButtons() {
  const ready = !!(state.currentAssure && state.currentPatient && state.currentTM && state.currentMedecin);
  document.getElementById("btnConsultation").disabled = !ready;
  document.getElementById("btnExamen").disabled = !ready;
  const hint = document.getElementById("readyHint");
  if (hint) hint.hidden = ready;
}

document.getElementById("patientSelect").addEventListener("change", updatePatientSelection);
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
  state.rows = [emptyRow()];

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
  document.getElementById("p-assureNom").value = isSelf ? "" : (assure.prenom + " " + assure.nom);
  document.getElementById("p-matriculeAssure").value = isSelf ? "" : assure.matricule;

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
  document.getElementById("addRowBtn").disabled = true;
  document.getElementById("removeRowBtn").disabled = true;

  // L'ordonnance (médicaments prescrits) est elle aussi du ressort du médecin.
  state.ordoLocked = true;
  document.getElementById("ordonnanceHint").hidden = false;
  document.getElementById("addOrdoRowBtn").disabled = true;
  document.getElementById("removeOrdoRowBtn").disabled = true;
  state.ordoRows = [emptyOrdoRow()];

  document.getElementById("saveSoinsBtn").textContent = "Envoyer au médecin";

  drawPseudoQR(document.getElementById("qrCanvas"), patient.matricule + "-" + numero);

  renderRows();
  renderOrdoRows();
  goToView("soins");
}

function openSoinsForValidation(entryId) {
  const entry = state.historique.find(h => h.id === entryId);
  if (!entry) return;
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
  document.getElementById("p-assureNom").value = entry.assureNom || "";
  document.getElementById("p-matriculeAssure").value = entry.matriculeAssure || "";

  const isSelf = !!entry.estAssure;
  document.getElementById("chk-assure").checked = isSelf;
  document.getElementById("chk-ayant").checked = !isSelf;
  document.getElementById("chk-assure-wrap").classList.toggle("on", isSelf);
  document.getElementById("chk-ayant-wrap").classList.toggle("on", !isSelf);

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
  document.getElementById("addRowBtn").disabled = false;
  document.getElementById("removeRowBtn").disabled = false;

  // L'ordonnance est déverrouillée : le médecin prescrit désignation + quantité (pas de montant).
  state.ordoLocked = false;
  document.getElementById("ordonnanceHint").hidden = true;
  document.getElementById("addOrdoRowBtn").disabled = false;
  document.getElementById("removeOrdoRowBtn").disabled = false;
  state.ordoRows = (entry.ordonnance && entry.ordonnance.length) ? entry.ordonnance.map(r => Object.assign({}, r)) : [emptyOrdoRow()];

  document.getElementById("saveSoinsBtn").textContent = "Valider et enregistrer";

  state.rows = (entry.prestations && entry.prestations.length) ? entry.prestations.map(r => Object.assign({}, r)) : [emptyRow()];

  drawPseudoQR(document.getElementById("qrCanvas"), (entry.matricule || "") + "-" + entry.numero);

  renderRows();
  renderOrdoRows();
  goToView("soins");
}

document.getElementById("btnConsultation").addEventListener("click", () => openSoins("Consultation"));
document.getElementById("btnExamen").addEventListener("click", () => openSoins("Examen"));
document.getElementById("cancelSoinsBtn").addEventListener("click", () => {
  goToView(state.soinsMode === "medecin" ? "medecin" : "nouvelle-pec");
});

function emptyRow() { return { designation: "", qte: "", montant: "", tm: "", part: "", valide: "" }; }

function renderRows() {
  const body = document.getElementById("prestaBody");
  body.innerHTML = "";
  const locked = !!state.prestaLocked;
  state.rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      cell("designation", row.designation, "text", locked) +
      cell("qte", row.qte, "num", locked) +
      cell("montant", row.montant, "num", locked) +
      cell("tm", row.tm, "num", locked) +
      cell("part", row.part, "num", locked) +
      cell("valide", row.valide, "num", locked);
    body.appendChild(tr);

    if (!locked) {
      ["designation", "qte", "montant", "tm", "part", "valide"].forEach(key => {
        tr.querySelector('[data-key="' + key + '"]').addEventListener("input", e => {
          state.rows[i][key] = e.target.value;
          updateTotals();
        });
      });
    }
  });
  updateTotals();
}

function cell(key, value, kind, disabled) {
  const cls = kind === "num" ? "num" : "";
  const val = value ? String(value).replace(/"/g, "&quot;") : "";
  return '<td><input type="text" class="' + cls + '" data-key="' + key + '" value="' + val + '"' + (disabled ? " disabled" : "") + " /></td>";
}

document.getElementById("addRowBtn").addEventListener("click", () => {
  if (state.prestaLocked) return;
  state.rows.push(emptyRow());
  renderRows();
});
document.getElementById("removeRowBtn").addEventListener("click", () => {
  if (state.prestaLocked) return;
  if (state.rows.length > 1) state.rows.pop();
  renderRows();
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
function updateTotals() {
  const sum = key => state.rows.reduce((a, r) => a + num(r[key]), 0);
  document.getElementById("totalMontant").value = fmt(sum("montant"));
  document.getElementById("totalTm").value = fmt(sum("tm"));
  document.getElementById("totalPart").value = fmt(sum("part"));
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
    assureNom: document.getElementById("p-assureNom").value,
    matriculeAssure: document.getElementById("p-matriculeAssure").value,
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
    totalMontant: "0",
    totalTm: "0",
    totalPart: "0"
  };
  state.historique.unshift(entry);
  saveJSON("pec_historique", state.historique);
  state.historiquePage = 1;
  goToView("dashboard");
}

function submitMedecinValidation() {
  const entry = state.historique.find(h => h.id === state.editingEntryId);
  if (!entry) return;
  entry.prestations = state.rows.filter(r => r.designation || r.montant);
  entry.ordonnance = state.ordoRows
    .filter(r => r.designation && r.quantite)
    .map(r => ({ designation: r.designation, quantite: r.quantite, posologie: r.posologie || "", statut: "Non servi", servicePar: "", dateService: "", prixUnitaire: "", partAssurance: "", partPatient: "" }));
  entry.totalMontant = document.getElementById("totalMontant").value;
  entry.totalTm = document.getElementById("totalTm").value;
  entry.totalPart = document.getElementById("totalPart").value;
  entry.prestaDate = document.getElementById("presta-date").value;
  entry.prestaDomicile = (document.querySelector('input[name=domicile]:checked') || {}).value || "";
  entry.prestaCode = document.getElementById("presta-code").value;
  entry.signature = document.getElementById("pr-signature").value;
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
      if (!confirm("Supprimer cette feuille de l'historique ?")) return;
      const id = parseInt(btn.dataset.id, 10);
      state.historique = state.historique.filter(h => h.id !== id);
      saveJSON("pec_historique", state.historique);
      renderHistorique();
      renderDashboardStats();
      refreshPendingBadge();
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
  const rows = (h.prestations || []).filter(r => r.designation || r.montant);
  const rowsHtml = rows.length
    ? rows.map(r =>
        "<tr><td>" + (r.designation || "") + "</td><td>" + (r.qte || "") + "</td><td>" + (r.montant || "") + "</td><td>" + (r.tm || "") + "</td><td>" + (r.part || "") + "</td></tr>"
      ).join("")
    : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Aucune prestation renseignée</td></tr>';

  document.getElementById("previewBody").innerHTML =
    '<div class="preview-head"><img src="CNAMGS.png" alt="CNAMGS" /><div>' +
      '<span class="pill ' + pillClass + '">' + h.type + "</span> " +
      '<span class="pill ' + statutClass + '">' + (h.statut || "Validée") + "</span>" +
      '<div class="preview-num">' + h.numero + "</div>" +
    "</div></div>" +
    '<div class="preview-grid">' +
      "<div><b>Patient</b><span>" + (h.patientNom || h.patient || "—") + "</span></div>" +
      "<div><b>Matricule</b><span>" + (h.matricule || "—") + "</span></div>" +
      "<div><b>Date</b><span>" + h.date + "</span></div>" +
      "<div><b>Fonds</b><span>" + (h.fonds || "—") + "</span></div>" +
      "<div><b>Ticket modérateur</b><span>" + (h.ticketModerateur || "—") + "</span></div>" +
      "<div><b>Médecin</b><span>" + (h.medecin || "—") + "</span></div>" +
      "<div><b>Accident causé par un tiers</b><span>" + (h.accidentTiers || "—") + "</span></div>" +
      "<div><b>Soins liés à la grossesse</b><span>" + (h.grossesse || "—") + "</span></div>" +
    "</div>" +
    '<table class="data-table"><thead><tr><th>Désignation</th><th>Qté</th><th>Montant</th><th>TM</th><th>Part CNAMGS</th></tr></thead><tbody>' + rowsHtml + "</tbody></table>" +
    '<div class="preview-totals">' +
      "<div>Total montant <b>" + h.totalMontant + "</b></div>" +
      "<div>Total TM <b>" + h.totalTm + "</b></div>" +
      "<div>Total CNAMGS <b>" + h.totalPart + "</b></div>" +
    "</div>";

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

function renderUsers() {
  const body = document.getElementById("usersBody");
  body.innerHTML = "";
  state.users.forEach(u => {
    const tr = document.createElement("tr");
    const statutClass = u.statut === "Actif" ? "actif" : "inactif";
    tr.innerHTML =
      "<td>" + u.prenom + " " + u.nom + "</td>" +
      "<td>" + u.email + "</td>" +
      "<td>" + u.role + "</td>" +
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
      const u = state.users.find(x => x.id === id);
      u.statut = u.statut === "Actif" ? "Inactif" : "Actif";
      saveJSON("pec_users", state.users);
      renderUsers();
    });
  });
  body.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      if (!confirm("Supprimer cet utilisateur ?")) return;
      state.users = state.users.filter(x => x.id !== id);
      saveJSON("pec_users", state.users);
      renderUsers();
    });
  });
}

const userModal = document.getElementById("userModal");
document.getElementById("addUserBtn").addEventListener("click", () => { userModal.hidden = false; });
document.getElementById("closeUserModal").addEventListener("click", () => { userModal.hidden = true; });
document.getElementById("cancelUserModal").addEventListener("click", () => { userModal.hidden = true; });

document.getElementById("userForm").addEventListener("submit", e => {
  e.preventDefault();
  const nomComplet = document.getElementById("u-nom").value.trim();
  const parts = nomComplet.split(" ");
  const prenom = parts.shift() || nomComplet;
  const nom = parts.join(" ") || "";
  const newUser = {
    id: Date.now(),
    nom: nom,
    prenom: prenom,
    email: document.getElementById("u-email").value.trim(),
    role: document.getElementById("u-role").value,
    statut: "Actif"
  };
  state.users.push(newUser);
  saveJSON("pec_users", state.users);
  document.getElementById("userForm").reset();
  userModal.hidden = true;
  renderUsers();
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
  document.getElementById("pharmaNotFound").hidden = true;
  document.getElementById("pharmaResults").innerHTML = "";
}

function runPharmaSearch(nag) {
  nag = (nag || "").trim();
  const entries = state.historique.filter(h =>
    h.type === "Consultation" && h.statut === "Validée" &&
    h.matricule === nag && (h.ordonnance || []).length > 0
  );
  document.getElementById("pharmaNotFound").hidden = !nag || entries.length > 0;
  renderPharmaResults(entries);
}

document.getElementById("pharmaSearchBtn").addEventListener("click", () => {
  runPharmaSearch(document.getElementById("pharmaNagInput").value);
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
        runPharmaSearch(document.getElementById("pharmaNagInput").value);
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
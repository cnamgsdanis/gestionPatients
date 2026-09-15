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
  historique: loadJSON("pec_historique", []),
  users: loadJSON("pec_users", USERS_SEED.slice()),
  historiqueFilters: { search: "", type: "", statut: "", from: "", to: "" },
  historiquePage: 1
};

// Migration douce : les entrées enregistrées avant l'ajout des actions/du statut avaient des champs manquants.
let historiqueMigrated = false;
state.historique.forEach((h, i) => {
  if (!h.id) { h.id = Date.now() + i; historiqueMigrated = true; }
  if (!h.statut) { h.statut = "Validée"; historiqueMigrated = true; }
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
    renderDashboardStats();
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

document.getElementById("logoutBtn").addEventListener("click", function () {
  document.getElementById("appShell").hidden = true;
  document.getElementById("view-login").hidden = false;
  document.getElementById("loginForm").reset();
  setFieldError("loginEmail", "loginEmailError", "");
  setFieldError("loginPass", "loginPassError", "");
  resetSearch();
  goToView("dashboard");
  buildLoginDna();
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
  users: { title: "Gestion des utilisateurs", crumb: "Accueil / Utilisateurs" }
};

function goToView(name) {
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
}

document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
  btn.addEventListener("click", () => goToView(btn.dataset.view));
});
document.getElementById("heroCtaBtn").addEventListener("click", () => goToView("nouvelle-pec"));
document.getElementById("recentViewAllBtn").addEventListener("click", () => goToView("historique"));

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

  document.getElementById("saveSoinsBtn").textContent = "Envoyer au médecin";

  drawPseudoQR(document.getElementById("qrCanvas"), patient.matricule + "-" + numero);

  renderRows();
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

  document.getElementById("saveSoinsBtn").textContent = "Valider et enregistrer";

  state.rows = (entry.prestations && entry.prestations.length) ? entry.prestations.map(r => Object.assign({}, r)) : [emptyRow()];

  drawPseudoQR(document.getElementById("qrCanvas"), (entry.matricule || "") + "-" + entry.numero);

  renderRows();
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
/* Tableau de bord : statistiques, graphique, activité récente             */
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
  const today = todayFR();
  const todays = state.historique.filter(h => h.date === today);
  const consultCount = state.historique.filter(h => h.type === "Consultation").length;
  const examCount = state.historique.filter(h => h.type === "Examen").length;
  const total = consultCount + examCount;

  document.getElementById("statToday").textContent = todays.length;
  document.getElementById("statPending").textContent = pendingCount();
  document.getElementById("statConsult").textContent = consultCount;
  document.getElementById("statExam").textContent = examCount;

  const donut = document.getElementById("donutChart");
  const pct = total ? Math.round((consultCount / total) * 100) : 0;
  donut.style.setProperty("--p", pct);
  donut.classList.toggle("empty", total === 0);
  document.getElementById("donutTotal").textContent = total;
  document.getElementById("legendConsult").textContent = consultCount;
  document.getElementById("legendExam").textContent = examCount;

  renderRecentActivity();
  refreshPendingBadge();
}
document.getElementById("statPendingCard").addEventListener("click", () => goToView("medecin"));

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

function renderRecentActivity() {
  const body = document.getElementById("recentBody");
  const empty = document.getElementById("recentEmpty");
  const recent = state.historique.slice(0, 5);
  body.innerHTML = "";
  empty.hidden = recent.length > 0;
  recent.forEach(h => {
    const tr = document.createElement("tr");
    const pillClass = h.type === "Consultation" ? "consultation" : "examen";
    tr.innerHTML =
      "<td>" + h.numero + "</td>" +
      "<td>" + h.date + "</td>" +
      "<td>" + (h.patientNom || h.patient || "") + "</td>" +
      '<td><span class="pill ' + pillClass + '">' + h.type + "</span></td>";
    body.appendChild(tr);
  });
}

/* ---------------------------------------------------------------------- */
/* Historique : filtres, pagination, aperçu, suppression                   */
/* ---------------------------------------------------------------------- */

const HIST_PAGE_SIZE = 8;

function parseFRDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || "");
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
}

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
/* Initialisation                                                          */
/* ---------------------------------------------------------------------- */

updateClock();
buildLoginParticles();
buildLoginDna();

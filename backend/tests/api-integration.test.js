// Test d'intégration de l'API RÉELLE (Java + SQL Server) : tout est écrit dans la base.
// Prérequis : back-end démarré, migration v5 appliquée, compte admin / admin.
//   node backend/tests/api-integration.test.js
// Variables : API (défaut http://localhost:8080), PEC_SQL_SERVER (défaut localhost\SQLEXPRESS), PEC_SQL_DB (défaut gestionpatient).
// Données de test préfixées « ZTEST » / « zt_ » : à supprimer ensuite avec backend/tests/cleanup-tests.sql.
// Redémarrer le serveur entre deux exécutions (anti-doublons en mémoire des alertes et des refus).
const { execSync } = require("child_process");
const BASE = process.env.API || "http://localhost:8080";
const SQL_SERVER = process.env.PEC_SQL_SERVER || "localhost\\SQLEXPRESS";
const SQL_DB = process.env.PEC_SQL_DB || "gestionpatient";
const res = [];
function ok(c, label, extra) { res.push(!!c); console.log((c ? "  PASS " : "  FAIL ") + label + (c || extra === undefined ? "" : "  -> " + JSON.stringify(extra).slice(0, 300))); }
async function api(method, path, token, body, headers) {
  const h = Object.assign({ "Content-Type": "application/json" }, headers || {});
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; const txt = await r.text(); try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = { raw: txt }; }
  return { status: r.status, json, headers: r.headers };
}
function sql(q) {
  const out = execSync(`sqlcmd -S "${SQL_SERVER}" -d ${SQL_DB} -E -C -I -f 65001 -h -1 -W -Q "SET NOCOUNT ON; ${q.replace(/"/g, '\\"')}"`, { encoding: "utf8" });
  return out.replace(/\r/g, "").trim();
}
async function login(u, p) { const r = await api("POST", "/api/auth/login", null, { username: u, mot_de_passe: p }); return r; }
const rid = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

(async () => {
  console.log("\n[0] Connexion administrateur");
  let r = await login("admin", "admin");
  ok(r.status === 200 && r.json.token, "admin / admin se connecte", r);
  const ADMIN = r.json.token;
  ok(r.json.expires_in === 3600, "durée du jeton annoncée (expires_in)");

  r = await api("GET", "/api/auth/me", ADMIN);
  ok(r.status === 200 && r.json.user.username === "admin" && r.json.permissions.includes("feuille.supprimer") && r.json.permissions.length >= 38, "GET /api/auth/me : compte + 38 permissions", r.json && r.json.permissions && r.json.permissions.length);
  ok(r.json.user.role === "administrateur" && r.json.user.profil_principal === "administrateur" && r.json.user.profils.includes("administrateur") && r.json.user.doit_changer_mdp === false, "GET /api/auth/me : profil actif, profil principal, profils, mot de passe à jour", r.json.user);
  ok(r.json.controles_antifraude === true && r.json.permissions.includes("controle.gerer"), "GET /api/auth/me : l'administrateur voit l'état des contrôles anti-fraude (actifs par défaut)", r.json.controles_antifraude);
  const ADMIN_ID = r.json.user.id_utilisateur;

  console.log("\n[1] Structures, comptes et assurés (CRUD)");
  r = await api("POST", "/api/structures", ADMIN, { raison_sociale: "ZTEST Hôpital", addresse: "Libreville", type_structure: "hopital" });
  ok(r.status === 201, "structure hôpital créée", r); const HOSP = r.json.id_structure;
  r = await api("POST", "/api/structures", ADMIN, { raison_sociale: "ZTEST Pharmacie", addresse: "Libreville", type_structure: "pharmacie" });
  ok(r.status === 201, "structure pharmacie créée", r); const PHARM = r.json.id_structure;
  r = await api("POST", "/api/structures", ADMIN, { raison_sociale: "ZTEST Pharmacie 2", addresse: "Port-Gentil", type_structure: "pharmacie" });
  ok(r.status === 201, "seconde pharmacie créée (livraison partielle)", r); const PHARM2 = r.json.id_structure;
  r = await api("POST", "/api/structures", ADMIN, { raison_sociale: "ZTEST X", addresse: "x", type_structure: "cinema" });
  ok(r.status === 400, "type de structure invalide refusé");
  r = await api("GET", "/api/structures", ADMIN);
  ok(r.status === 200 && r.json.some(s => s.raison_sociale === "ZTEST Hôpital") && r.json.some(s => s.type_structure === "administration"), "liste des structures (incl. administration)");

  const mk = async (username, role, idS, extra) => api("POST", "/api/auth/register", ADMIN, Object.assign({ username, mot_de_passe: "test1234", prenom: "Zt", nom: "Compte " + username, email: username + "@test.local", role, id_structure: idS }, extra || {}));
  r = await mk("zt_agent", "agent_accueil", HOSP); ok(r.status === 201, "agent d'accueil créé", r); const AGENT_ID = r.json.id_utilisateur;
  r = await mk("zt_medecin", "medecin", HOSP, { prenom: "Rosine", nom: "AKUE", code_praticien: "MED-9001", type_praticien: "Spécialiste" }); ok(r.status === 201 && r.json.code_praticien === "MED-9001" && r.json.type_praticien === "Spécialiste", "médecin créé (code + type praticien)", r); const MED_ID = r.json.id_utilisateur;
  r = await mk("zt_medecin2", "medecin", HOSP, { prenom: "Paul", nom: "OBAME" }); const MED2_ID = r.json.id_utilisateur;
  r = await mk("zt_pharma", "pharmacien", PHARM); ok(r.status === 201, "pharmacien créé", r); const PH_ID = r.json.id_utilisateur;
  ok(r.json.doit_changer_mdp === true && r.json.role === "pharmacien" && r.json.profil_principal === "pharmacien" && JSON.stringify(r.json.profils) === '["pharmacien"]', "compte créé par l'admin : mot de passe temporaire à changer, un profil (le rôle)", r.json);
  r = await mk("zt_pharma2", "pharmacien", PHARM2); ok(r.status === 201, "pharmacien de la seconde pharmacie créé", r); const PH2_ID = r.json.id_utilisateur;
  r = await mk("zt_multi", "agent_accueil", HOSP, { profils: ["caissier_structure"] }); ok(r.status === 201 && JSON.stringify(r.json.profils) === '["agent_accueil","caissier_structure"]', "compte créé avec un profil principal + un profil supplémentaire", r.json); const MULTI_ID = r.json.id_utilisateur;
  r = await mk("zt_bad3", "agent_accueil", HOSP, { profils: ["roi"] }); ok(r.status === 400 && /profil invalide/.test(r.json.error), "profil supplémentaire invalide : 400", r.json);
  r = await mk("zt_caisse", "caissier_structure", HOSP); ok(r.status === 201, "caissier créé");
  r = await mk("zt_dg", "directeur_structure", HOSP); ok(r.status === 201, "directeur créé"); const DG_ID = r.json.id_utilisateur;
  r = await mk("zt_admin2", "administrateur", HOSP); ok(r.status === 201, "second administrateur créé (garde-fous des profils)"); const ADMIN2_ID = r.json.id_utilisateur;
  r = await mk("zt_agent", "agent_accueil", HOSP); ok(r.status === 409, "identifiant déjà pris : 409");
  r = await mk("zt_bad", "roi", HOSP); ok(r.status === 400, "rôle invalide : 400");
  r = await mk("zt_bad2", "agent_accueil", 999999); ok(r.status === 400, "structure inexistante : 400");
  r = await api("POST", "/api/auth/register", null, { username: "zt_pirate", mot_de_passe: "xxxx", nom: "P", role: "administrateur", id_structure: HOSP });
  ok(r.status === 401, "création de compte sans jeton refusée (401)");

  // ---- première connexion : le mot de passe donné par l'admin est TEMPORAIRE ----
  const PW = "test1234", PW2 = "Zt-Perso-2026";
  const T = {};
  let x = await login("zt_agent", PW);
  ok(x.status === 200 && x.json.user.doit_changer_mdp === true, "première connexion : le compte doit changer son mot de passe (doit_changer_mdp)", x.json && x.json.user);
  r = await api("GET", "/api/feuilles", x.json.token);
  ok(r.status === 403 && r.json.code === "MDP_A_CHANGER" && /mot de passe/i.test(r.json.error), "avant le changement : les routes métier sont bloquées (403 MDP_A_CHANGER)", r.json);
  r = await api("GET", "/api/patients/nag/2345678901", x.json.token); ok(r.status === 403 && r.json.code === "MDP_A_CHANGER", "avant le changement : la recherche d'assuré est aussi bloquée");
  r = await api("GET", "/api/auth/me", x.json.token); ok(r.status === 200 && r.json.user.doit_changer_mdp === true, "avant le changement : /api/auth/me reste accessible (l'écran sait quoi demander)");
  r = await api("PUT", "/api/auth/change-password", x.json.token, { ancien: PW, nouveau: PW }); ok(r.status === 400 && /différent/.test(r.json.error), "le nouveau mot de passe doit différer du temporaire (400)", r.json);
  r = await api("PUT", "/api/auth/change-password", x.json.token, { ancien: PW, nouveau: "ab" }); ok(r.status === 400, "nouveau mot de passe trop court refusé");
  r = await api("PUT", "/api/auth/change-password", x.json.token, { ancien: PW, nouveau: PW2 });
  ok(r.status === 200 && r.json.token && r.json.user.doit_changer_mdp === false && r.json.user.role === "agent_accueil", "changement du mot de passe temporaire : jeton neuf, drapeau retombé", r.json);
  const AGENT_TOKEN = r.json.token;
  r = await api("GET", "/api/auth/me", x.json.token); ok(r.status === 401, "l'ancien jeton (mot de passe temporaire) est invalidé");
  r = await api("GET", "/api/feuilles", AGENT_TOKEN); ok(r.status === 200, "après le changement : toutes les routes du rôle sont ouvertes");
  r = await login("zt_agent", PW); ok(r.status === 401, "l'ancien mot de passe temporaire ne fonctionne plus");
  r = await login("zt_agent", PW2); ok(r.status === 200 && r.json.user.doit_changer_mdp === false, "reconnexion avec le mot de passe personnel : plus de changement demandé");
  T.zt_agent = AGENT_TOKEN;
  ok(sql("SELECT doit_changer_mdp FROM Utilisateur WHERE username = N'zt_agent'") === "0", "base : doit_changer_mdp = 0 après le changement");
  for (const u of ["zt_medecin", "zt_medecin2", "zt_pharma", "zt_pharma2", "zt_caisse", "zt_dg", "zt_multi", "zt_admin2"]) {
    const l = await login(u, PW);
    const c = await api("PUT", "/api/auth/change-password", l.json.token, { ancien: PW, nouveau: PW2 });
    T[u] = c.json.token;
  }
  ok(Object.values(T).every(Boolean), "tous les comptes ont choisi leur mot de passe et se connectent");

  // PUT partiel : ne doit PAS désactiver le compte (défaut historique corrigé)
  r = await api("PUT", "/api/utilisateurs/" + MED2_ID, ADMIN, { email: "paul@test.local" });
  ok(r.status === 200 && r.json.actif === true && r.json.email === "paul@test.local" && r.json.role === "medecin", "PUT partiel : le compte reste actif", r.json);
  r = await api("PATCH", "/api/utilisateurs/" + MED2_ID + "/actif", ADMIN, { actif: false });
  ok(r.status === 200, "désactivation");
  r = await api("GET", "/api/auth/me", T.zt_medecin2);
  ok(r.status === 401, "jeton d'un compte désactivé refusé aussitôt");
  r = await login("zt_medecin2", "test1234"); ok(r.status === 403, "connexion d'un compte désactivé : 403");
  r = await api("PATCH", "/api/utilisateurs/" + MED2_ID + "/actif", ADMIN, { actif: true }); ok(r.status === 200, "réactivation");
  r = await api("PATCH", "/api/utilisateurs/1/actif", ADMIN, { actif: false }); ok(r.status === 409, "on ne peut pas désactiver son propre compte / le dernier admin", r.json);
  r = await api("DELETE", "/api/utilisateurs/1", ADMIN); ok(r.status === 409, "on ne peut pas se supprimer soi-même");
  r = await api("GET", "/api/utilisateurs", T.zt_agent); ok(r.status === 403, "l'agent ne peut pas lister les comptes (403)");
  r = await api("POST", "/api/auth/reset-password", ADMIN, { id_utilisateur: MED2_ID, nouveau: "nouveau12" });
  ok(r.status === 200, "réinitialisation du mot de passe par l'admin");
  r = await api("GET", "/api/auth/me", T.zt_medecin2); ok(r.status === 401, "les anciens jetons de ce compte sont invalidés");
  r = await login("zt_medecin2", "nouveau12"); ok(r.status === 200 && r.json.user.doit_changer_mdp === true, "nouveau mot de passe accepté, mais TEMPORAIRE : à changer à la connexion");
  r = await api("PUT", "/api/auth/change-password", r.json.token, { ancien: "nouveau12", nouveau: PW2 }); ok(r.status === 200, "le médecin choisit à nouveau son mot de passe"); T.zt_medecin2 = r.json.token;

  // assurés : NAG NVARCHAR de 10 chiffres (> INT max), nature, statut
  r = await api("POST", "/api/patients", ADMIN, { prenom: "ZTEST", nom: "Actif", sex: "F", contact: "0700000001", date_naissance: "1988-03-14", fonds: 2, nature: "Assuré principal", matricule_nag: "2345678901" });
  ok(r.status === 201 && r.json.matricule_nag === "2345678901", "assuré actif créé avec un NAG > 2 147 483 647", r); const P1 = r.json.id_patient;
  r = await api("POST", "/api/patients", ADMIN, { prenom: "ZTEST", nom: "Suspendu", sex: "M", contact: "0700000002", fonds: 1, nature: 1, statut: "suspendu", matricule_nag: "2345678902" });
  ok(r.status === 201, "assuré suspendu créé", r); const P2 = r.json.id_patient;
  r = await api("POST", "/api/patients", ADMIN, { prenom: "ZTEST", nom: "Enfant", sex: "M", contact: "0700000003", fonds: 2, nature: "Ayant droit", id_assure_principal: P1 });
  ok(r.status === 201 && /^\d{10}$/.test(r.json.matricule_nag), "NAG généré automatiquement (10 chiffres) pour un ayant droit", r); const P3 = r.json.id_patient; const NAG3 = r.json.matricule_nag;
  r = await api("POST", "/api/patients", ADMIN, { prenom: "ZTEST", nom: "Doublon", sex: "M", contact: "0700000004", matricule_nag: "2345678901" });
  ok(r.status === 409, "NAG déjà attribué : 409");
  r = await api("POST", "/api/patients", ADMIN, { prenom: "ZTEST", nom: "Court", sex: "M", matricule_nag: "12345" });
  ok(r.status === 400, "NAG de moins de 10 chiffres refusé : 400");
  r = await api("GET", "/api/patients/nag/2345678901", T.zt_agent);
  ok(r.status === 200 && r.json.nature === "Assuré principal" && r.json.nature_assure === 1 && r.json.statut === "actif" && r.json.statut_assure === true, "recherche par NAG : nature + statut actif", r.json);
  r = await api("GET", "/api/patients/nag/2345678902", T.zt_agent);
  ok(r.status === 200 && r.json.statut === "suspendu" && r.json.statut_assure === false, "recherche par NAG : assuré suspendu", r.json);
  r = await api("GET", "/api/patients/nag/" + NAG3, T.zt_agent);
  ok(r.status === 200 && r.json.nature_assure === 2 && r.json.fonds_couverture === 2, "ayant droit : couverture du parent", r.json);
  r = await api("GET", "/api/patients/nag/2345678999", T.zt_agent); ok(r.status === 404, "NAG inconnu : 404");
  r = await api("GET", "/api/patients/nag/abc", T.zt_agent); ok(r.status === 400, "NAG non numérique : 400");
  r = await api("PUT", "/api/patients/" + P1, ADMIN, { adresse: "Owendo" });
  ok(r.status === 200, "PUT patient partiel");
  r = await api("GET", "/api/patients/" + P1, ADMIN); ok(r.json.adresse === "Owendo" && r.json.statut === "actif" && r.json.prenom === "ZTEST" && r.json.matricule_nag === "2345678901", "PUT partiel : les autres champs et le NAG sont inchangés", r.json);
  r = await api("POST", "/api/patients", ADMIN, { prenom: "ZTEST", nom: "Jetable", sex: "F", contact: "0700000009" }); const PDEL = r.json.id_patient;
  r = await api("DELETE", "/api/patients/" + PDEL, ADMIN); ok(r.status === 200, "DELETE patient sans historique");
  r = await api("GET", "/api/patients/" + PDEL, ADMIN); ok(r.status === 404, "patient supprimé introuvable");

  console.log("\n[2] Annuaires : médecins et catalogue");
  r = await api("GET", "/api/medecins", T.zt_agent);
  ok(r.status === 200 && r.json.some(m => m.id_utilisateur === MED_ID && m.code_praticien === "MED-9001" && m.type_praticien === "Spécialiste" && m.nom === "Rosine AKUE" && m.structure_nom === "ZTEST Hôpital"), "GET /api/medecins", r.json);
  r = await api("GET", "/api/catalogue/medicaments", T.zt_medecin);
  ok(r.status === 200 && r.json.length >= 8 && r.json[0].designation && r.json.every(m => m.prix_reference !== undefined), "GET /api/catalogue/medicaments", r.json && r.json.length);
  r = await api("POST", "/api/catalogue/medicaments", ADMIN, { designation: "ZTEST Sirop 100ml", prix_reference: 1900 }); ok(r.status === 201, "ajout au catalogue"); const CAT = r.json.id_catalogue;
  r = await api("POST", "/api/catalogue/medicaments", ADMIN, { designation: "ZTEST Sirop 100ml", prix_reference: 1 }); ok(r.status === 409, "doublon au catalogue : 409");
  r = await api("PUT", "/api/catalogue/medicaments/" + CAT, ADMIN, { designation: "ZTEST Sirop 100ml", prix_reference: 2100 }); ok(r.status === 200, "modification du prix de référence");
  r = await api("POST", "/api/catalogue/medicaments", T.zt_medecin, { designation: "ZTEST Interdit" }); ok(r.status === 403, "le médecin ne modifie pas le catalogue");
  r = await api("DELETE", "/api/catalogue/medicaments/" + CAT, ADMIN); ok(r.status === 200, "retrait du catalogue");
  r = await api("GET", "/api/catalogue/medicaments", T.zt_medecin); ok(!r.json.some(m => m.designation === "ZTEST Sirop 100ml"), "médicament retiré n'apparaît plus");

  console.log("\n[3] Feuilles de soins : accueil → médecin → pharmacie");
  // La base peut contenir des données réelles (ordonnances à servir, médecins…) : les compteurs se comparent à l'état de départ.
  const ASERVIR0 = (await api("GET", "/api/feuilles/compteurs", T.zt_pharma)).json.ordonnances_a_servir;
  const MED_BASE = Number(sql("SELECT COUNT(*) FROM Utilisateur WHERE actif = 1 AND role = 'medecin' AND LEFT(username, 3) <> 'zt_'"));
  const base = (nag, nom, extra) => Object.assign({ id: rid(), type: "Consultation", statut: "En attente", matricule: nag, patientNom: nom, dateNaissance: "1988-03-14", estAssure: true,
    fonds: "Fonds Secteur Privé", ticketModerateur: "Plein", medecinId: MED_ID, medecin: "Dr Rosine AKUE", medecinCode: "MED-9001", medecinType: "Spécialiste", medecinEtab: "ZTEST Hôpital",
    quartier: "Nzeng-Ayong", telephone: "", service: "Médecine générale", prestations: [], ordonnance: [], examens: [], signature: "", totalMontant: "0", totalTm: "0", totalPart: "0" }, extra || {});
  const F1 = base("2345678901", "ZTEST Actif");
  r = await api("POST", "/api/feuilles", T.zt_agent, F1);
  ok(r.status === 201 && r.json.serverId && /^F2026-\d{5}$/.test(r.json.numero) && r.json.statut === "En attente" && r.json.type === "Consultation" && r.json.id === F1.id && /^\d{2}\/\d{2}\/\d{4}$/.test(r.json.date), "accueil : feuille créée, numéro attribué par le serveur", r.json);
  const S1 = r.json.serverId;
  r = await api("POST", "/api/feuilles", T.zt_agent, F1); ok(r.status === 409, "identifiant client déjà utilisé : 409");
  r = await api("POST", "/api/feuilles", T.zt_agent, base("2345678902", "ZTEST Suspendu"));
  ok(r.status === 409 && /suspendu/i.test(r.json.error), "assuré SUSPENDU : création refusée (409)", r.json);
  r = await api("POST", "/api/feuilles", T.zt_agent, base("2345678999", "Inconnu")); ok(r.status === 404, "NAG inconnu : 404");
  r = await api("POST", "/api/feuilles", T.zt_pharma, base("2345678901", "ZTEST Actif")); ok(r.status === 403, "le pharmacien ne crée pas de feuille");
  r = await api("POST", "/api/feuilles", T.zt_agent, base("2345678901", "ZTEST Actif", { type: "Examen" })); ok(r.status === 403, "l'accueil ne crée pas de feuille d'examen");
  r = await api("POST", "/api/feuilles", T.zt_agent, base("2345678901", "ZTEST Actif", { statut: "Validée", ordonnance: [{ designation: "Fraude", quantite: "1", statut: "Servi", servicePar: "X", prixUnitaire: "5", partAssurance: "4", partPatient: "1" }] }));
  ok(r.status === 201 && r.json.statut === "En attente" && r.json.ordonnance[0].statut === "Non servi" && r.json.ordonnance[0].prixUnitaire === "", "l'accueil ne peut ni valider ni pré-servir une ordonnance", r.json);
  const FRAUDE = r.json.serverId;

  r = await api("GET", "/api/feuilles", T.zt_agent); ok(r.status === 200 && r.json.some(f => f.serverId === S1), "accueil : voit les feuilles de sa structure");
  r = await api("GET", "/api/feuilles", T.zt_medecin); ok(r.status === 200 && r.json.some(f => f.serverId === S1), "médecin : voit la feuille en attente");
  r = await api("GET", "/api/feuilles/compteurs", T.zt_medecin); ok(r.status === 200 && r.json.en_attente_medecin === 1, "compteur du médecin = 1 patient en attente", r.json);
  r = await api("GET", "/api/feuilles", T.zt_pharma); ok(r.status === 200 && r.json.length === 0, "pharmacien : aucune navigation libre (liste vide sans NAG)");
  r = await api("GET", "/api/feuilles?nag=2345678901", T.zt_pharma); ok(r.status === 200 && r.json.length === 0, "pharmacien : la feuille en attente n'est pas visible");

  // l'accueil corrige sa partie
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_agent, Object.assign({}, F1, { quartier: "Akanda", telephone: "066000000", patientNom: "PIRATE" }));
  ok(r.status === 200 && r.json.quartier === "Akanda" && r.json.telephone === "066000000" && r.json.patientNom === "ZTEST Actif", "accueil : corrige les coordonnées, l'identité reste verrouillée", r.json);

  // médecin : brouillon
  const F1b = Object.assign({}, F1, { prestations: [{ acte: "C", cotation: "10000" }], service: "PIRATE-SERVICE", ticketModerateur: "Exonéré", examNature: "" });
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_medecin, Object.assign({}, F1b, { ordonnance: [{ designation: "Paracétamol 500mg (boîte de 16)", quantite: "2", posologie: "1 cp matin et soir", statut: "Servi", prixUnitaire: "1" }] }));
  ok(r.status === 200 && r.json.statut === "En attente" && r.json.service === "Médecine générale" && r.json.ticketModerateur === "Plein" && r.json.prestations.length === 1 && r.json.ordonnance[0].statut === "Non servi" && r.json.ordonnance[0].prixUnitaire === "", "médecin : brouillon enregistré, accueil verrouillé, délivrance remise à zéro", r.json);
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_medecin2, F1b); ok(r.status === 200, "médecin de la même structure peut aussi la traiter");
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_pharma, F1b); ok(r.status === 409, "pharmacien : feuille non validée → refusé (409)");

  // validation
  const validation = Object.assign({}, F1, { statut: "Validée", prestations: [{ acte: "C", cotation: "10000" }], signature: "signé", totalMontant: "10 000", totalTm: "2 000", totalPart: "8 000", prestaDate: "19/09/2026 10h",
    ordonnance: [{ designation: "Paracétamol 500mg (boîte de 16)", quantite: "2", posologie: "1 cp matin et soir", statut: "Non servi" }, { designation: "Amoxicilline 500mg (boîte de 12)", quantite: "1", posologie: "1 cp x3/j, 7 jours", statut: "Non servi" }, { designation: "   ", quantite: "1" }] });
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_agent, validation); ok(r.status === 200 && r.json.statut === "En attente", "l'accueil ne peut pas valider (statut inchangé)", r.json.statut);
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_medecin, validation);
  ok(r.status === 200 && r.json.statut === "Validée" && r.json.ordonnance.length === 2, "médecin : feuille VALIDÉE (ligne vide retirée)", r.json);
  ok(sql("SELECT COUNT(*) FROM Prestation p JOIN Feuille_soins f ON f.id_prestation = p.id_prestation WHERE f.id_feuille = " + S1 + " AND p.type_prestation='consultation' AND p.montant = 10000") === "1", "base : Prestation « consultation » 10 000 créée");
  ok(sql("SELECT COUNT(*) FROM Prise_en_charge c JOIN Feuille_soins f ON f.id_prestation = c.id_prestation WHERE f.id_feuille = " + S1 + " AND c.montant_pec = 8000 AND c.statut='validee'") === "1", "base : Prise en charge de 8 000 (part CNAMGS) créée");
  ok(sql("SELECT COUNT(*) FROM Ordonnance_ligne l JOIN Ordonnance o ON o.id_ordonnance = l.id_ordonnance JOIN Feuille_soins f ON f.id_prestation = o.id_prestation WHERE f.id_feuille = " + S1) === "2", "base : ordonnance + 2 lignes créées");
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_medecin, validation); ok(r.status === 409, "feuille déjà validée : plus modifiable (409)");

  // pharmacie
  r = await api("GET", "/api/feuilles?nag=2345678901&statut=Valid%C3%A9e&avec_ordonnance=1", T.zt_pharma); ok(r.status === 200 && r.json.length === 1 && r.json[0].serverId === S1, "pharmacien : retrouve l'ordonnance par NAG", r.json && r.json.length);
  r = await api("GET", "/api/feuilles/compteurs", T.zt_pharma); ok(r.json.ordonnances_a_servir === ASERVIR0 + 1, "compteur pharmacie : +1 ordonnance à servir", r.json);
  let sheet = (await api("GET", "/api/feuilles?nag=2345678901&avec_ordonnance=1", T.zt_pharma)).json[0];
  const cp = JSON.parse(JSON.stringify(sheet));
  cp.ordonnance[0].statut = "Servi";   // sans prix
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_pharma, cp); ok(r.status === 400 && /prix/i.test(r.json.error), "délivrance sans prix unitaire refusée (400)", r.json);
  cp.ordonnance[0].prixUnitaire = "0"; r = await api("PUT", "/api/feuilles/" + S1, T.zt_pharma, cp); ok(r.status === 400, "prix nul refusé");
  cp.ordonnance[0].prixUnitaire = "1000"; cp.ordonnance[0].partAssurance = "99999"; cp.service = "PIRATE"; cp.totalMontant = "1";
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_pharma, cp);
  const l0 = r.json && r.json.ordonnance && r.json.ordonnance[0];
  ok(r.status === 200 && l0.statut === "Servi" && l0.prixUnitaire === "1000" && l0.partAssurance === "1600" && l0.partPatient === "400" && l0.servicePar === "ZTEST Pharmacie" && /^\d{2}\/\d{2}\/\d{4}$/.test(l0.dateService), "délivrance : 2 × 1000 → assurance 1 600 (80 %), patient 400, pharmacie et date fixées par le SERVEUR", r.json);
  ok(r.json.service === "Médecine générale" && r.json.totalMontant === "10 000", "la pharmacie ne peut modifier aucun autre champ", { service: r.json.service, total: r.json.totalMontant });
  ok(r.json.ordonnance[1].statut === "Non servi", "seconde ligne encore à servir");
  ok(sql("SELECT o.statut FROM Ordonnance o JOIN Feuille_soins f ON f.id_prestation=o.id_prestation WHERE f.id_feuille=" + S1) === "partiellement_delivree", "base : ordonnance « partiellement_delivree »");
  const cp2 = JSON.parse(JSON.stringify(r.json)); cp2.ordonnance[1].statut = "Servi"; cp2.ordonnance[1].prixUnitaire = "2500";
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_pharma, cp2);
  ok(r.status === 200 && r.json.ordonnance[1].partAssurance === "2000" && r.json.ordonnance[1].partPatient === "500", "seconde ligne : 2 500 → 2 000 / 500", r.json.ordonnance && r.json.ordonnance[1]);
  ok(sql("SELECT o.statut FROM Ordonnance o JOIN Feuille_soins f ON f.id_prestation=o.id_prestation WHERE f.id_feuille=" + S1) === "delivree", "base : ordonnance « delivree »");
  ok(sql("SELECT CAST(SUM(part_assurance) AS INT) FROM Ordonnance_ligne l JOIN Ordonnance o ON o.id_ordonnance=l.id_ordonnance JOIN Feuille_soins f ON f.id_prestation=o.id_prestation WHERE f.id_feuille=" + S1 + " AND l.id_structure_pharmacie=" + PHARM) === "3600", "base : parts assurance de la pharmacie = 3 600");
  const cp3 = JSON.parse(JSON.stringify(r.json)); cp3.ordonnance[0].statut = "Non servi"; cp3.ordonnance[0].prixUnitaire = "1";
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_pharma, cp3); ok(r.json.ordonnance[0].statut === "Servi" && r.json.ordonnance[0].prixUnitaire === "1000", "une ligne servie ne peut pas être « désservie »");
  r = await api("GET", "/api/feuilles?servi_par_moi=1", T.zt_pharma); ok(r.status === 200 && r.json.length === 1, "pharmacie : historique de ses délivrances");
  r = await api("GET", "/api/feuilles/compteurs", T.zt_pharma); ok(r.json.ordonnances_a_servir === ASERVIR0, "plus d'ordonnance de test à servir", r.json);
  r = await api("DELETE", "/api/feuilles/" + S1, ADMIN); ok(r.status === 409, "feuille déjà servie : suppression refusée (409)", r.json);

  // assuré suspendu APRÈS la validation : rien ne peut lui être servi
  const F2 = base("2345678901", "ZTEST Actif"); r = await api("POST", "/api/feuilles", T.zt_agent, F2); const S2 = r.json.serverId;
  r = await api("PUT", "/api/feuilles/" + S2, T.zt_medecin, Object.assign({}, F2, { statut: "Validée", totalMontant: "5000", totalPart: "4000", signature: "s", ordonnance: [{ designation: "Ibuprofène 400mg (boîte de 20)", quantite: "1", posologie: "x" }] }));
  ok(r.status === 200 && r.json.statut === "Validée", "2e feuille validée");
  r = await api("PUT", "/api/patients/" + P1, ADMIN, { statut: "suspendu" }); ok(r.status === 200, "l'assuré est suspendu");
  sheet = (await api("GET", "/api/feuilles?nag=2345678901&avec_ordonnance=1&statut=Valid%C3%A9e", T.zt_pharma)).json.find(f => f.serverId === S2);
  const c4 = JSON.parse(JSON.stringify(sheet)); c4.ordonnance[0].statut = "Servi"; c4.ordonnance[0].prixUnitaire = "1500";
  r = await api("PUT", "/api/feuilles/" + S2, T.zt_pharma, c4); ok(r.status === 409 && /suspendu/i.test(r.json.error), "assuré suspendu : délivrance refusée (409)", r.json);
  r = await api("POST", "/api/feuilles", T.zt_agent, base("2345678901", "ZTEST Actif")); ok(r.status === 409, "assuré suspendu : nouvelle feuille refusée");
  const F3 = base("2345678902", "x"); // pour tester la validation d'une feuille dont l'assuré devient suspendu
  r = await api("PUT", "/api/patients/" + P1, ADMIN, { statut: "actif" }); ok(r.status === 200, "réactivation de l'assuré");
  const F4 = base("2345678901", "ZTEST Actif"); r = await api("POST", "/api/feuilles", T.zt_agent, F4); const S4 = r.json.serverId;
  await api("PUT", "/api/patients/" + P1, ADMIN, { statut: "suspendu" });
  r = await api("PUT", "/api/feuilles/" + S4, T.zt_medecin, Object.assign({}, F4, { statut: "Validée", totalMontant: "1000" })); ok(r.status === 409, "assuré suspendu entre-temps : validation refusée (409)", r.json);
  await api("PUT", "/api/patients/" + P1, ADMIN, { statut: "actif" });

  // examen
  const FE = base("2345678901", "ZTEST Actif", { type: "Examen", medecinId: undefined, linkedConsultationId: F1.id, examNature: "Radiographie thoracique", totalMontant: "15000", totalPart: "12000" });
  r = await api("POST", "/api/feuilles", T.zt_medecin, FE); ok(r.status === 201 && r.json.type === "Examen" && r.json.serverId, "médecin : crée la feuille d'examen", r.json); const SE = r.json.serverId;
  r = await api("PUT", "/api/feuilles/" + SE, T.zt_medecin, Object.assign({}, FE, { statut: "Validée", signature: "s" })); ok(r.status === 200 && r.json.statut === "Validée", "feuille d'examen validée");
  ok(sql("SELECT COUNT(*) FROM Examen e JOIN Feuille_soins f ON f.id_prestation=e.id_prestation WHERE f.id_feuille=" + SE + " AND e.type_examen = N'Radiographie thoracique' AND e.statut='en_attente'") === "1", "base : ligne Examen créée");

  // dossier patient (endpoints hérités) : reflète les validations
  r = await api("GET", "/api/consultations?id_patient=" + P1, T.zt_medecin); ok(r.status === 200 && r.json.length >= 1, "dossier patient : la consultation validée est visible", r.json && r.json.length);
  r = await api("GET", "/api/examens?id_patient=" + P1, T.zt_medecin); ok(r.status === 200 && r.json.length >= 1, "dossier patient : l'examen validé est visible");

  // suppression d'une feuille en attente (admin) et permissions
  r = await api("DELETE", "/api/feuilles/" + FRAUDE, T.zt_agent); ok(r.status === 403, "l'accueil ne supprime pas");
  r = await api("DELETE", "/api/feuilles/" + FRAUDE, ADMIN); ok(r.status === 200, "admin : supprime une feuille en attente");
  r = await api("GET", "/api/feuilles/" + FRAUDE, ADMIN); ok(r.status === 404, "feuille supprimée introuvable");
  r = await api("DELETE", "/api/feuilles/" + S2, ADMIN); ok(r.status === 200, "admin : supprime une feuille validée non servie (Prestation, PEC, Ordonnance retirées)");
  ok(sql("SELECT COUNT(*) FROM Prestation WHERE id_prestation NOT IN (SELECT id_prestation FROM Feuille_soins WHERE id_prestation IS NOT NULL) AND id_patient = " + P1) === "0", "base : aucune prestation orpheline");
  r = await api("GET", "/api/feuilles", T.zt_caisse); ok(r.status === 200 && r.json.length >= 2, "caissier : lecture des feuilles (rapports)");
  r = await api("PUT", "/api/feuilles/" + S1, T.zt_caisse, {}); ok(r.status === 403, "caissier : ne modifie pas");

  console.log("\n[4] Règlements");
  r = await api("GET", "/api/reglements", T.zt_agent); ok(r.status === 403, "l'accueil ne voit pas les règlements");
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "hopital", structure: "ZTEST Hôpital", montant: 100000, type: "reglement", note: "trop" });
  ok(r.status === 409 && /reste à payer/.test(r.json.error), "règlement au-delà du reste à payer refusé (409)", r.json);
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "hopital", structure: "ZTEST Hôpital", montant: 5000, type: "reglement", note: "acompte" });
  ok(r.status === 201 && r.json.id_reglement && r.json.kind === "hopital" && r.json.structure === "ZTEST Hôpital" && Number(r.json.montant) === 5000 && /^\d{4}-\d{2}-\d{2}$/.test(r.json.date), "règlement hôpital enregistré", r.json);
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "hopital", structure: "ZTEST Hôpital", montant: 500000, type: "avance", note: "avance" }); ok(r.status === 201, "une avance peut dépasser le dû");
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "pharmacie", structure: "ZTEST Pharmacie", montant: 3600, type: "reglement" }); ok(r.status === 201, "règlement pharmacie = 3 600 (exactement le dû)");
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "pharmacie", structure: "ZTEST Pharmacie", montant: 1, type: "reglement" }); ok(r.status === 409, "pharmacie : plus rien à payer");
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "hopital", structure: "Inconnue", montant: 1 }); ok(r.status === 400, "structure inconnue : 400");
  r = await api("GET", "/api/reglements", T.zt_dg); ok(r.status === 200 && r.json.length === 3, "liste des règlements", r.json && r.json.length);

  console.log("\n[4b] Livraison partielle : une ordonnance servie en plusieurs fois, par plusieurs pharmacies");
  const FP = base("2345678901", "ZTEST Actif"); r = await api("POST", "/api/feuilles", T.zt_agent, FP); const SP = r.json.serverId;
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_medecin, Object.assign({}, FP, { statut: "Validée", totalMontant: "8000", totalPart: "6400", signature: "s",
    ordonnance: [{ designation: "Paracétamol 500mg (boîte de 16)", quantite: "5", posologie: "1 cp x3/j" }, { designation: "Amoxicilline 500mg (boîte de 12)", quantite: "1", posologie: "1 cp x3/j" }] }));
  ok(r.status === 200 && r.json.statut === "Validée" && r.json.ordonnance.length === 2, "feuille avec ordonnance (5 + 1) validée", r.json);
  const voir = async (tok, S) => (await api("GET", "/api/feuilles?nag=2345678901&avec_ordonnance=1&statut=Valid%C3%A9e", tok)).json.find(f => f.serverId === S);
  const servir = (sheet, i, q, prix) => { const c = JSON.parse(JSON.stringify(sheet)); c.ordonnance[i].aServir = { quantite: q, prixUnitaire: prix }; return c; };
  let sh = await voir(T.zt_pharma, SP);
  ok(sh.ordonnance[0].quantiteServie === 0 && sh.ordonnance[0].statut === "Non servi" && Array.isArray(sh.ordonnance[0].livraisons) && sh.ordonnance[0].livraisons.length === 0, "avant service : quantité servie 0, aucune livraison", sh.ordonnance[0]);
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_pharma, servir(sh, 0, 6, "1000")); ok(r.status === 400 && /entre 1 et 5/.test(r.json.error), "quantité supérieure au prescrit refusée (400, « entre 1 et 5 »)", r.json);
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_pharma, servir(sh, 0, 0, "1000")); ok(r.status === 400, "quantité 0 refusée");
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_pharma, servir(sh, 0, 1.5, "1000")); ok(r.status === 400, "quantité décimale refusée");
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_pharma, servir(sh, 0, 2, "")); ok(r.status === 400 && /prix/i.test(r.json.error), "prix unitaire obligatoire pour servir");
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_pharma, servir(sh, 0, 2, "1000"));
  let L0 = r.json.ordonnance && r.json.ordonnance[0];
  ok(r.status === 200 && L0.statut === "Partiel" && L0.quantiteServie === 2 && L0.livraisons.length === 1, "pharmacie 1 sert 2 sur 5 (rupture de stock) : ligne « Partiel »", r.json);
  const D1 = L0.livraisons[0];
  ok(D1.quantite === 2 && D1.prixUnitaire === "1000" && D1.montantTotal === "2000" && D1.partAssurance === "1600" && D1.partPatient === "400" && D1.idPharmacie === PHARM && D1.servicePar === "ZTEST Pharmacie" && D1.idPharmacien === PH_ID && /Compte zt_pharma/.test(D1.pharmacien) && /^\d{2}\/\d{2}\/\d{4}$/.test(D1.dateService) && /^\d{2}:\d{2}$/.test(D1.heureService), "livraison : quantité, prix unitaire, montant total, part assurance, part patient, pharmacie, pharmacien, date", D1);
  ok(r.json.ordonnance[1].statut === "Non servi" && r.json.ordonnance[1].quantiteServie === 0, "seconde ligne intacte");
  const qSp = "SELECT %COL% FROM Ordonnance_delivrance d JOIN Ordonnance_ligne l ON l.id_ligne = d.id_ligne JOIN Ordonnance o ON o.id_ordonnance = l.id_ordonnance JOIN Feuille_soins f ON f.id_prestation = o.id_prestation WHERE f.id_feuille = " + SP + " AND l.position = 1 ORDER BY d.id_delivrance";
  ok(sql(qSp.replace("%COL%", "CONCAT(d.quantite,'/',CAST(d.prix_unitaire AS INT),'/',CAST(d.montant_total AS INT),'/',CAST(d.part_assurance AS INT),'/',CAST(d.part_patient AS INT),'/',d.id_structure_pharmacie,'/',d.id_pharmacien)")) === "2/1000/2000/1600/400/" + PHARM + "/" + PH_ID, "base : Ordonnance_delivrance (quantité, prix unitaire, montant total, parts, id_structure_pharmacie, id_pharmacien)");
  ok(sql(qSp.replace("%COL%", "CASE WHEN d.date_delivrance >= DATEADD(MINUTE, -30, SYSDATETIME()) THEN 'recente' ELSE 'ancienne' END")) === "recente", "base : date_delivrance enregistrée automatiquement");
  ok(sql("SELECT l.quantite_servie FROM Ordonnance_ligne l JOIN Ordonnance o ON o.id_ordonnance = l.id_ordonnance JOIN Feuille_soins f ON f.id_prestation = o.id_prestation WHERE f.id_feuille = " + SP + " AND l.position = 1") === "2", "base : Ordonnance_ligne.quantite_servie = 2");
  ok(sql("SELECT o.statut FROM Ordonnance o JOIN Feuille_soins f ON f.id_prestation = o.id_prestation WHERE f.id_feuille = " + SP) === "partiellement_delivree", "base : ordonnance « partiellement_delivree »");

  // le patient va chercher le reste dans une AUTRE pharmacie
  const sh2 = await voir(T.zt_pharma2, SP);
  ok(sh2 && sh2.ordonnance[0].quantiteServie === 2 && sh2.ordonnance[0].livraisons.length === 1, "pharmacie 2 voit ce qui a déjà été servi (2 sur 5)");
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_pharma2, servir(sh2, 0, 4, "1200")); ok(r.status === 400 && /entre 1 et 3/.test(r.json.error), "pharmacie 2 : au plus le reste (3), 4 refusé", r.json);
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_pharma2, servir(sh2, 0, 3, "1200"));
  L0 = r.json.ordonnance && r.json.ordonnance[0];
  ok(r.status === 200 && L0.statut === "Servi" && L0.quantiteServie === 5 && L0.livraisons.length === 2 && L0.livraisons[0].servicePar === "ZTEST Pharmacie" && L0.livraisons[1].servicePar === "ZTEST Pharmacie 2" && L0.livraisons[1].idPharmacie === PHARM2 && L0.livraisons[1].partAssurance === "2880" && L0.livraisons[1].partPatient === "720" && L0.livraisons[1].montantTotal === "3600", "pharmacie 2 sert les 3 restants à 1 200 : ligne « Servi », deux livraisons de deux pharmacies", L0);
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_pharma2, servir(sh2, 0, 1, "1200")); ok(r.status === 409 && /entièrement servi/.test(r.json.error), "ligne entièrement servie : on ne peut plus rien servir (409)", r.json);
  ok(sql("SELECT o.statut FROM Ordonnance o JOIN Feuille_soins f ON f.id_prestation = o.id_prestation WHERE f.id_feuille = " + SP) === "partiellement_delivree", "base : tant qu'une ligne reste à servir, l'ordonnance reste « partiellement_delivree »");
  r = await api("GET", "/api/feuilles/compteurs", T.zt_pharma); ok(r.json.ordonnances_a_servir === ASERVIR0 + 1, "compteur pharmacie : 1 ordonnance encore à servir (une ligne reste)", r.json);
  // ancien protocole (statut « Servi » + prix) = servir TOUT le reste de la ligne
  const legacy = JSON.parse(JSON.stringify(await voir(T.zt_pharma, SP))); legacy.ordonnance[1].statut = "Servi"; legacy.ordonnance[1].prixUnitaire = "2500";
  r = await api("PUT", "/api/feuilles/" + SP, T.zt_pharma, legacy);
  ok(r.status === 200 && r.json.ordonnance[1].statut === "Servi" && r.json.ordonnance[1].livraisons.length === 1 && r.json.ordonnance[1].livraisons[0].partAssurance === "2000", "ancien protocole « Servi » : sert tout le reste de la ligne", r.json.ordonnance && r.json.ordonnance[1]);
  ok(sql("SELECT o.statut FROM Ordonnance o JOIN Feuille_soins f ON f.id_prestation = o.id_prestation WHERE f.id_feuille = " + SP) === "delivree", "base : toutes les lignes servies → ordonnance « delivree »");
  r = await api("GET", "/api/feuilles/compteurs", T.zt_pharma); ok(r.json.ordonnances_a_servir === ASERVIR0, "compteur pharmacie : plus rien à servir (retour à l'état de départ)", r.json);
  r = await api("GET", "/api/feuilles?nag=2345678901&avec_ordonnance=1&statut=Valid%C3%A9e", T.zt_pharma); ok(r.status === 200 && r.json.find(f => f.serverId === SP).ordonnance.every(l => l.statut === "Servi"), "la feuille reste consultable, toutes lignes « Servi » (l'écran affiche « aucune ordonnance à servir »)");
  r = await api("GET", "/api/feuilles?servi_par_moi=1", T.zt_pharma2); ok(r.status === 200 && r.json.length === 1 && r.json[0].serverId === SP, "historique de la pharmacie 2 : uniquement ce qu'elle a servi", r.json.map(f => f.serverId));
  r = await api("GET", "/api/feuilles?servi_par_moi=1", T.zt_pharma); ok(r.status === 200 && r.json.length === 2, "historique de la pharmacie 1 : ses 2 ordonnances", r.json.map(f => f.serverId));
  // règlements : chaque pharmacie est due de SES livraisons
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "pharmacie", structure: "ZTEST Pharmacie 2", montant: 2881, type: "reglement" }); ok(r.status === 409, "pharmacie 2 : dû = 2 880 (sa livraison partielle), 2 881 refusé", r.json);
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "pharmacie", structure: "ZTEST Pharmacie 2", montant: 2880, type: "reglement" }); ok(r.status === 201, "pharmacie 2 : règlement de 2 880 accepté");
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "pharmacie", structure: "ZTEST Pharmacie", montant: 3601, type: "reglement" }); ok(r.status === 409, "pharmacie 1 : reste dû = 3 600 (1 600 + 2 000), 3 601 refusé", r.json);
  r = await api("POST", "/api/reglements", T.zt_caisse, { kind: "pharmacie", structure: "ZTEST Pharmacie", montant: 3600, type: "reglement" }); ok(r.status === 201, "pharmacie 1 : règlement de 3 600 accepté");

  console.log("\n[4c] Interrupteur des contrôles anti-fraude (compte Super Admin)");
  r = await api("GET", "/api/parametres/controles", T.zt_medecin); ok(r.status === 403, "le médecin ne voit pas l'interrupteur (403)");
  r = await api("GET", "/api/parametres/controles", ADMIN); ok(r.status === 200 && r.json.actif === true, "contrôles actifs par défaut", r.json);
  const FA = base("2345678901", "ZTEST Actif"); r = await api("POST", "/api/feuilles", T.zt_agent, FA); const SA = r.json.serverId;
  r = await api("PUT", "/api/feuilles/" + SA, ADMIN, Object.assign({}, FA, { quartier: "Quartier-Admin" }));
  ok(r.status === 403 && /Contrôles anti-fraude actifs/.test(r.json.error), "contrôles ACTIFS : l'administrateur ne modifie pas une feuille (403, message explicite)", r.json);
  r = await api("PUT", "/api/parametres/controles", T.zt_medecin, { actif: false }); ok(r.status === 403, "seul l'administrateur change l'interrupteur (403 pour le médecin)");
  r = await api("PUT", "/api/parametres/controles", ADMIN, {}); ok(r.status === 400, "corps invalide refusé (400)");
  r = await api("PUT", "/api/parametres/controles", ADMIN, { actif: false }); ok(r.status === 200 && r.json.actif === false && r.json.modifie_par, "contrôles DÉSACTIVÉS par le Super Admin", r.json);
  ok(sql("SELECT valeur FROM Parametre_systeme WHERE cle = 'controles_antifraude'") === "0", "base : Parametre_systeme.controles_antifraude = 0");
  r = await api("GET", "/api/auth/me", ADMIN); ok(r.json.controles_antifraude === false, "/api/auth/me : l'administrateur sait qu'il est en mode supervision");
  // mode supervision : l'administrateur réalise lui-même tout le circuit
  r = await api("PUT", "/api/feuilles/" + SA, ADMIN, Object.assign({}, FA, { quartier: "Quartier-Admin", patientNom: "PIRATE" }));
  ok(r.status === 200 && r.json.quartier === "Quartier-Admin" && r.json.patientNom === "ZTEST Actif", "supervision : l'admin corrige la partie accueil (jamais l'identité de l'assuré)", r.json);
  r = await api("PUT", "/api/feuilles/" + SA, ADMIN, Object.assign({}, FA, { statut: "Validée", prestations: [{ acte: "C", cotation: "6000" }], totalMontant: "6000", totalPart: "4800", signature: "s",
    ordonnance: [{ designation: "Ibuprofène 400mg (boîte de 20)", quantite: "2", posologie: "x" }] }));
  ok(r.status === 200 && r.json.statut === "Validée", "supervision : l'admin VALIDE la feuille", r.json);
  ok(sql("SELECT COUNT(*) FROM Prestation p JOIN Feuille_soins f ON f.id_prestation = p.id_prestation WHERE f.id_feuille = " + SA + " AND p.id_utilisateur = " + MED_ID) === "1", "base : la prestation est attribuée au médecin désigné sur la feuille");
  const shA = (await api("GET", "/api/feuilles/" + SA, ADMIN)).json;
  r = await api("PUT", "/api/feuilles/" + SA, ADMIN, servir(shA, 0, 2, "800"));
  ok(r.status === 200 && r.json.ordonnance[0].statut === "Servi" && r.json.ordonnance[0].livraisons[0].partAssurance === "1280" && r.json.ordonnance[0].livraisons[0].idPharmacien === ADMIN_ID, "supervision : l'admin SERT l'ordonnance (2 × 800 → 1 280 / 320)", r.json.ordonnance && r.json.ordonnance[0]);
  ok(sql("SELECT o.statut FROM Ordonnance o JOIN Feuille_soins f ON f.id_prestation = o.id_prestation WHERE f.id_feuille = " + SA) === "delivree", "base : ordonnance servie par l'admin « delivree »");
  const FB = base("2345678901", "ZTEST Actif"); r = await api("POST", "/api/feuilles", T.zt_agent, FB);
  r = await api("PUT", "/api/feuilles/" + r.json.serverId, T.zt_agent, Object.assign({}, FB, { statut: "Validée" })); ok(r.status === 200 && r.json.statut === "En attente", "supervision : les AUTRES rôles restent soumis aux contrôles (l'accueil ne valide toujours pas)");
  r = await api("GET", "/api/journal/evenements?taille=100&recherche=supervision", ADMIN); ok(r.json.items.some(e => e.action === "feuille.supervision"), "journal : les actions de supervision sont tracées");
  r = await api("GET", "/api/journal/alertes?statut=Nouveau&taille=50", ADMIN); ok(r.json.items.some(e => e.regles.some(x => x.code === "CONTROLES_DESACTIVES")), "journal : la désactivation des contrôles déclenche une alerte de sécurité");
  r = await api("PUT", "/api/parametres/controles", ADMIN, { actif: true }); ok(r.status === 200 && r.json.actif === true, "contrôles RÉACTIVÉS");
  ok(sql("SELECT valeur FROM Parametre_systeme WHERE cle = 'controles_antifraude'") === "1", "base : Parametre_systeme.controles_antifraude = 1");
  const FC = base("2345678901", "ZTEST Actif"); r = await api("POST", "/api/feuilles", T.zt_agent, FC);
  r = await api("PUT", "/api/feuilles/" + r.json.serverId, ADMIN, Object.assign({}, FC, { quartier: "Encore" })); ok(r.status === 403, "contrôles réactivés : l'administrateur est de nouveau bloqué (403)");

  console.log("\n[5] Notifications");
  r = await api("POST", "/api/notifications", ADMIN, { cible_type: "role", cible_valeur: "medecin", titre: "Maintenance", message: "Arrêt à 22h", priorite: "urgente", categorie: "message", accuse_requis: true });
  ok(r.status === 201 && r.json.destinataires === 2 + MED_BASE, "message envoyé à tous les médecins actifs (2 de test + ceux déjà en base)", r.json); const N1 = r.json.id_notification;
  r = await api("POST", "/api/notifications", T.zt_agent, { cible_type: "all", titre: "abc", message: "abc" }); ok(r.status === 403, "l'accueil ne peut pas envoyer");
  r = await api("POST", "/api/notifications", ADMIN, { cible_type: "role", cible_valeur: "roi", titre: "abc", message: "abc" }); ok(r.status === 400, "rôle cible invalide : 400");
  r = await api("POST", "/api/notifications", ADMIN, { cible_type: "etablissement", cible_valeur: String(PHARM), titre: "Pharmacies", message: "Nouvelle grille" }); ok(r.status === 201 && r.json.destinataires === 1, "ciblage par établissement", r.json);
  r = await api("POST", "/api/notifications", ADMIN, { cible_type: "user", cible_valeur: String(AGENT_ID), titre: "Bonjour", message: "Message perso" }); ok(r.status === 201 && r.json.destinataires === 1, "ciblage d'un utilisateur");
  r = await api("GET", "/api/notifications", T.zt_medecin);
  const mine = r.json.find(n => n.id_notification === N1);
  ok(r.status === 200 && mine && mine.priorite === "urgente" && mine.accuse_requis === true && mine.lu === false && mine.accuse === false && mine.expediteur_nom && /Z$/.test(mine.date_envoi), "le médecin reçoit le message (non lu, accusé requis)", mine);
  r = await api("PUT", "/api/notifications/" + N1 + "/lu", T.zt_medecin); ok(r.status === 200, "marqué lu");
  r = await api("PUT", "/api/notifications/" + N1 + "/accuse", T.zt_medecin); ok(r.status === 200, "accusé de réception");
  r = await api("GET", "/api/notifications", T.zt_medecin); ok(r.json.find(n => n.id_notification === N1).lu && r.json.find(n => n.id_notification === N1).accuse, "lecture et accusé enregistrés en base");
  r = await api("PUT", "/api/notifications/" + N1 + "/lu", T.zt_agent); ok(r.status === 404, "on ne marque pas le message d'un autre");
  r = await api("GET", "/api/notifications/envoyees?page=1&taille=8", ADMIN);
  const env = r.json.items && r.json.items.find(n => n.id_notification === N1);
  ok(r.status === 200 && env && env.destinataires === 2 + MED_BASE && env.lus === 1 && env.accuses === 1 && /Rôle/.test(env.cible_libelle), "suivi des messages envoyés (tous les médecins destinataires, 1 lu, 1 accusé)", env);
  r = await api("GET", "/api/notifications/envoyees", T.zt_medecin); ok(r.status === 403, "le médecin ne voit pas les messages envoyés");

  console.log("\n[6] Sécurité de la session");
  r = await api("POST", "/api/auth/refresh", T.zt_agent); ok(r.status === 200 && r.json.token && r.json.token !== T.zt_agent, "POST /api/auth/refresh : nouveau jeton", r.json);
  const NEWT = r.json.token;
  r = await api("GET", "/api/auth/me", T.zt_agent); ok(r.status === 401, "l'ancien jeton est révoqué après renouvellement");
  r = await api("GET", "/api/auth/me", NEWT); ok(r.status === 200, "le nouveau jeton fonctionne");
  r = await api("POST", "/api/auth/logout", NEWT); ok(r.status === 200, "déconnexion");
  r = await api("GET", "/api/auth/me", NEWT); ok(r.status === 401, "après déconnexion le jeton est refusé (révocation réelle)");
  for (let i = 0; i < 5; i++) await login("zt_fantome", "mauvais");
  r = await login("zt_fantome", "mauvais"); ok(r.status === 429, "6e essai raté sur un même identifiant : blocage temporaire (429)");
  r = await api("PUT", "/api/auth/change-password", T.zt_caisse, { ancien: "faux", nouveau: "abcd1234" }); ok(r.status === 401, "changement de mot de passe : ancien incorrect");
  r = await api("PUT", "/api/auth/change-password", T.zt_caisse, { ancien: PW2, nouveau: "abcd1234" }); ok(r.status === 200 && r.json.token && r.json.user.doit_changer_mdp === false, "changement volontaire de mot de passe : jeton neuf renvoyé", r.json);
  r = await api("GET", "/api/auth/me", T.zt_caisse); ok(r.status === 401, "après un changement de mot de passe, l'ancien jeton est invalidé");
  r = await login("zt_caisse", "abcd1234"); ok(r.status === 200, "connexion avec le nouveau mot de passe");
  const opt = await fetch(BASE + "/api/feuilles", { method: "OPTIONS", headers: { Origin: "http://localhost:5500", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,content-type" } });
  ok(opt.status === 204 && opt.headers.get("access-control-allow-origin") === "*" && /PUT/.test(opt.headers.get("access-control-allow-methods")) && /Authorization/i.test(opt.headers.get("access-control-allow-headers")), "CORS : pré-vérification OPTIONS acceptée");
  r = await fetch(BASE + "/api/feuilles", { headers: { Origin: "http://x.y" } }); ok(r.headers.get("access-control-allow-origin") === "*", "CORS : en-tête sur les réponses (même les 401)");

  console.log("\n[7] Journal d'audit");
  r = await api("GET", "/api/journal/connexions?taille=50", ADMIN);
  ok(r.status === 200 && r.json.items.length >= 8 && r.json.items.some(i => i.resultat === "echec") && r.json.items.some(i => i.resultat === "succes") && r.json.resume.echecs_30j >= 3 && r.json.resume.connexions_aujourdhui >= 5, "connexions : réussies et échecs tracés côté serveur", r.json.resume);
  r = await api("GET", "/api/journal/connexions?resultat=echec&recherche=zt_fantome", ADMIN); ok(r.json.total >= 5 && r.json.items.every(i => i.resultat === "echec"), "filtre échecs + recherche");
  r = await api("GET", "/api/journal/alertes?statut=Nouveau&taille=20", ADMIN);
  const al = r.json.items.find(e => e.regles.some(x => x.code === "LOGIN_ECHECS_REPETES"));
  ok(r.status === 200 && r.json.total >= 1 && al && al.score >= 50 && ["ALERTE", "CRITIQUE"].includes(al.severite) && r.json.a_examiner >= 1, "alerte calculée par le serveur : échecs de connexion répétés", al && { score: al.score, sev: al.severite });
  r = await api("GET", "/api/notifications", ADMIN);
  ok(r.json.some(n => n.categorie === "securite" && /Activité inhabituelle|Alerte critique/.test(n.titre)), "l'administrateur reçoit la notification de sécurité");
  r = await api("PUT", "/api/journal/alertes/" + al.id + "/revue", ADMIN, { statut: "Faux positif", note: "test" }); ok(r.status === 200, "revue d'une alerte");
  r = await api("GET", "/api/journal/alertes?statut=Faux%20positif", ADMIN); ok(r.json.items.some(e => e.id === al.id && e.revuePar && e.statutRevue === "Faux positif"), "revue enregistrée (Faux positif, par qui, quand)");
  r = await api("PUT", "/api/journal/alertes/" + al.id + "/revue", T.zt_medecin, { statut: "Vu" }); ok(r.status === 403, "le médecin ne peut pas examiner les alertes");
  r = await api("GET", "/api/journal/evenements?taille=100&categorie=CONSULTATION", ADMIN);
  ok(r.status === 200 && r.json.items.some(e => e.action === "feuille.valider" && e.acteur.nom && e.ressource.nag && /\*\*\*/.test(e.ressource.nag) && e.contexte.ip !== undefined && e.hash && e.hashPrec !== undefined), "activité : validation tracée (acteur, NAG masqué, IP, empreinte)", r.json.items[0]);
  r = await api("GET", "/api/journal/evenements?taille=100&categorie=PHARMACIE", ADMIN); ok(r.json.items.filter(e => e.action === "pharma.servir").length >= 2, "activité : délivrances tracées");
  r = await api("GET", "/api/journal/evenements?taille=100&categorie=PAIEMENT", ADMIN); ok(r.json.items.some(e => e.action === "paiement.enregistrer" && e.resultat === "SUCCES") && r.json.items.some(e => e.action === "paiement.enregistrer" && e.resultat === "REFUSE"), "activité : paiements réussis et refusés");
  r = await api("GET", "/api/journal/evenements?taille=100&recherche=suspendu", ADMIN); ok(r.json.items.some(e => e.resultat === "REFUSE" && /suspendu/i.test(e.message)), "activité : refus « assuré suspendu » tracés");
  r = await api("GET", "/api/journal/evenements?taille=100&categorie=SECURITE", ADMIN); ok(r.json.items.some(e => e.action === "security.acces.refuse") && r.json.items.some(e => e.action === "security.token.invalide"), "activité : 403 et jetons invalides tracés par le filtre", r.json.items.map(e => e.action));
  r = await api("POST", "/api/journal/evenements", T.zt_medecin, { evenements: [
    { horodatage: new Date().toISOString(), sessionId: "s1", categorie: "ASSURE", action: "patient.rechercher", libelle: "Recherche d'un assuré", resultat: "SUCCES", ressource: { type: "Patient", id: "1", libelle: "ZTEST", nag: "234 *** *** 1" }, contexte: { vue: "medecin", appareil: "Chrome · Windows" } },
    { action: "utilisateur.creer", categorie: "ADMIN" }, { action: "vue.ouvrir", categorie: "NAVIGATION", libelle: "Ouverture d'une page" }] });
  ok(r.status === 201 && r.json.acceptes === 2 && r.json.ignores === 1, "événements de l'interface reçus (les actions déjà tracées par le serveur sont ignorées)", r.json);
  r = await api("GET", "/api/journal/evenements?taille=20&recherche=patient.rechercher", ADMIN); ok(r.json.items.length >= 1 && r.json.items[0].acteur.login === "zt_medecin" && r.json.items[0].origine === "ui", "l'acteur d'un événement de l'interface vient du jeton");
  r = await api("GET", "/api/journal/resume", ADMIN); ok(r.json.evenements_aujourdhui > 30 && r.json.utilisateurs_actifs_24h >= 5, "résumé du journal", r.json);
  r = await api("GET", "/api/journal/integrite", ADMIN); ok(r.status === 200 && r.json.ok === true && r.json.verifies > 30, "intégrité : chaîne d'empreintes intacte", r.json);
  const AG2 = (await login("zt_agent", PW2)).json.token;
  r = await api("GET", "/api/journal/evenements", AG2); ok(r.status === 403, "le journal est réservé (403 pour l'accueil)");
  const tent = sql("UPDATE Journal_evenement SET action='falsifie' WHERE id_evenement = (SELECT MIN(id_evenement) FROM Journal_evenement)");
  ok(/interdit|modifiable/i.test(tent) || tent.includes("51001"), "la base refuse la falsification d'un événement (déclencheur)", tent.slice(0, 120));
  const tent2 = sql("DELETE FROM Journal_evenement WHERE id_evenement = (SELECT MIN(id_evenement) FROM Journal_evenement)");
  ok(/interdit|ajout seul/i.test(tent2) || tent2.includes("51000"), "la base refuse la suppression d'un événement", tent2.slice(0, 120));

  console.log("\n[8] Photos");
  r = await fetch(BASE + "/media/patients/lionel.jpg"); ok(r.status === 401, "photo sans jeton : 401");
  r = await fetch(BASE + "/media/patients/lionel.jpg?token=" + ADMIN); ok(r.status === 200 && r.headers.get("content-type") === "image/jpeg", "photo avec jeton : 200 image/jpeg");
  r = await fetch(BASE + "/media/..%5C..%5Cdb%5CDatabase.java?token=" + ADMIN); ok(r.status === 404, "sortie du dossier media impossible");

  console.log("\n[9] Profils : plusieurs profils (rôles) par compte, ajout et retrait par l'administrateur");
  r = await api("GET", "/api/utilisateurs/" + MED_ID, ADMIN);
  ok(r.json.role === "medecin" && r.json.profil_principal === "medecin" && JSON.stringify(r.json.profils) === '["medecin"]', "un compte ordinaire a un seul profil : son rôle", r.json);
  r = await api("GET", "/api/utilisateurs", ADMIN); ok(r.status === 200 && r.json.every(u => Array.isArray(u.profils) && u.profils.includes(u.role)), "liste des comptes : chacun porte ses profils, principal inclus");
  r = await api("POST", "/api/utilisateurs/" + MED_ID + "/profils", AG2, { profil: "pharmacien" }); ok(r.status === 403, "l'accueil ne peut pas donner de profil (403)");
  r = await api("POST", "/api/utilisateurs/" + MED_ID + "/profils", ADMIN, { profil: "roi" }); ok(r.status === 400, "profil inconnu refusé (400)");
  r = await api("POST", "/api/utilisateurs/999999/profils", ADMIN, { profil: "pharmacien" }); ok(r.status === 404, "compte inconnu : 404");
  r = await api("POST", "/api/utilisateurs/" + MED_ID + "/profils", ADMIN, { profil: "pharmacien" });
  ok(r.status === 201 && JSON.stringify(r.json.profils) === '["medecin","pharmacien"]' && r.json.role === "medecin", "AJOUT du profil « pharmacien » au médecin", r.json);
  ok(sql("SELECT COUNT(*) FROM Utilisateur_profil WHERE id_utilisateur = " + MED_ID) === "2", "base : Utilisateur_profil contient les 2 profils");
  r = await api("POST", "/api/utilisateurs/" + MED_ID + "/profils", ADMIN, { profil: "pharmacien" }); ok(r.status === 409, "profil déjà porté : 409");
  r = await api("GET", "/api/journal/alertes?statut=Nouveau&taille=50", ADMIN); ok(r.json.items.some(e => e.regles.some(x => x.code === "PROFILS_INCOMPATIBLES")), "journal : cumul médecin + pharmacien signalé (risque de fraude)");
  // ouvrir une session avec un profil précis
  r = await api("POST", "/api/auth/login", null, { username: "zt_medecin", mot_de_passe: PW2, profil: "pharmacien" });
  ok(r.status === 200 && r.json.user.role === "pharmacien" && r.json.user.profil_principal === "medecin" && r.json.user.profils.length === 2, "connexion avec le profil « pharmacien » : profil actif, principal et liste renvoyés", r.json.user);
  r = await api("POST", "/api/auth/login", null, { username: "zt_medecin", mot_de_passe: PW2, profil: "agent_accueil" }); ok(r.status === 403, "connexion avec un profil que le compte ne porte pas : 403");
  r = await api("POST", "/api/auth/login", null, { username: "zt_medecin", mot_de_passe: PW2 }); ok(r.status === 200 && r.json.user.role === "medecin", "connexion sans préciser : profil principal");
  let MEDTOK = r.json.token;
  // changer de profil actif en cours de session
  r = await api("POST", "/api/auth/profil", MEDTOK, { profil: "agent_accueil" }); ok(r.status === 403, "changer pour un profil non porté : 403");
  r = await api("POST", "/api/auth/profil", MEDTOK, { profil: "pharmacien" });
  ok(r.status === 200 && r.json.user.role === "pharmacien" && r.json.token && r.json.token !== MEDTOK, "changement de profil actif : nouveau jeton, rôle « pharmacien »", r.json.user);
  r = await api("GET", "/api/auth/me", MEDTOK); ok(r.status === 401, "l'ancien jeton (profil médecin) est révoqué");
  r = await api("POST", "/api/auth/login", null, { username: "zt_medecin", mot_de_passe: PW2, profil: "pharmacien" }); const PHTOK2 = r.json.token;
  r = await api("GET", "/api/auth/me", PHTOK2);
  ok(r.status === 200 && r.json.permissions.includes("feuille.delivrer") && !r.json.permissions.includes("feuille.valider"), "les droits suivent le profil actif (pharmacien : délivrer, pas valider)", r.json.permissions);
  r = await api("GET", "/api/feuilles?servi_par_moi=1", PHTOK2); ok(r.status === 200, "l'interface pharmacien est ouverte avec ce profil");
  r = await api("POST", "/api/auth/refresh", PHTOK2); ok(r.status === 200 && r.json.user.role === "pharmacien", "le renouvellement du jeton conserve le profil actif");
  // le profil est retiré : ses sessions tombent
  const PHTOK3 = r.json.token;
  r = await api("DELETE", "/api/utilisateurs/" + MED_ID + "/profils/pharmacien", ADMIN);
  ok(r.status === 200 && JSON.stringify(r.json.profils) === '["medecin"]', "RETRAIT du profil « pharmacien »", r.json);
  r = await api("GET", "/api/auth/me", PHTOK3); ok(r.status === 401, "retirer un profil ferme les sessions ouvertes du compte");
  r = await api("DELETE", "/api/utilisateurs/" + MED_ID + "/profils/pharmacien", ADMIN); ok(r.status === 404, "retirer un profil non porté : 404");
  r = await api("DELETE", "/api/utilisateurs/" + MED_ID + "/profils/medecin", ADMIN); ok(r.status === 409 && /au moins un profil/.test(r.json.error), "on ne retire pas le dernier profil d'un compte (409)", r.json);
  r = await api("PUT", "/api/utilisateurs/" + MED_ID + "/profils/principal", ADMIN, { profil: "pharmacien" }); ok(r.status === 409, "profil principal : le compte doit déjà le porter (409)");
  T.zt_medecin = (await login("zt_medecin", PW2)).json.token;
  // un profil « medecin » ajouté à un autre compte : il entre dans l'annuaire des médecins
  r = await api("POST", "/api/utilisateurs/" + AGENT_ID + "/profils", ADMIN, { profil: "medecin" }); ok(r.status === 201, "profil « medecin » donné à l'agent d'accueil");
  r = await api("GET", "/api/medecins", AG2); ok(r.status === 200 && r.json.some(m => m.id_utilisateur === AGENT_ID), "annuaire des médecins : un compte qui porte le profil « medecin » y figure", r.json);
  r = await api("POST", "/api/notifications", ADMIN, { cible_type: "role", cible_valeur: "medecin", titre: "Profils", message: "Test profils", priorite: "info", categorie: "message" });
  ok(r.status === 201 && r.json.destinataires === 3 + MED_BASE, "message adressé au rôle « medecin » : reçu par tout compte qui porte ce profil (3 de test + ceux déjà en base)", r.json);
  r = await api("DELETE", "/api/utilisateurs/" + AGENT_ID + "/profils/medecin", ADMIN); ok(r.status === 200 && JSON.stringify(r.json.profils) === '["agent_accueil"]', "profil retiré");
  r = await api("GET", "/api/medecins", T.zt_medecin); ok(!r.json.some(m => m.id_utilisateur === AGENT_ID), "l'annuaire ne le liste plus");
  // profil principal
  r = await api("PUT", "/api/utilisateurs/" + MULTI_ID + "/profils/principal", ADMIN, { profil: "caissier_structure" });
  ok(r.status === 200 && r.json.role === "caissier_structure" && JSON.stringify(r.json.profils) === '["caissier_structure","agent_accueil"]', "profil principal changé (le second devient premier)", r.json);
  r = await api("DELETE", "/api/utilisateurs/" + MULTI_ID + "/profils/caissier_structure", ADMIN);
  ok(r.status === 200 && r.json.role === "agent_accueil" && JSON.stringify(r.json.profils) === '["agent_accueil"]', "retirer le profil principal promeut l'autre profil", r.json);
  ok(sql("SELECT role FROM Utilisateur WHERE id_utilisateur = " + MULTI_ID) === "agent_accueil", "base : Utilisateur.role suit le nouveau profil principal");
  // PUT { role } = REMPLACER le profil principal (comportement historique)
  r = await api("PUT", "/api/utilisateurs/" + DG_ID, ADMIN, { role: "caissier_structure" });
  ok(r.status === 200 && r.json.role === "caissier_structure" && JSON.stringify(r.json.profils) === '["caissier_structure"]', "PUT { role } remplace le profil principal (l'ancien est retiré)", r.json);
  ok(sql("SELECT COUNT(*) FROM Utilisateur_profil WHERE id_utilisateur = " + DG_ID + " AND profil = 'directeur_structure'") === "0", "base : l'ancien profil n'est plus porté");
  // garde-fous sur le profil administrateur
  r = await api("POST", "/api/utilisateurs/" + ADMIN2_ID + "/profils", ADMIN, { profil: "caissier_structure" }); ok(r.status === 201, "second administrateur : un profil de plus");
  r = await api("DELETE", "/api/utilisateurs/" + ADMIN2_ID + "/profils/administrateur", T.zt_admin2); ok(r.status === 409 && /propre profil administrateur/.test(r.json.error), "on ne se retire pas son propre profil administrateur (409)", r.json);
  r = await api("DELETE", "/api/utilisateurs/" + ADMIN_ID + "/profils/administrateur", ADMIN); ok(r.status === 409, "idem pour le compte admin (dernier profil, 409)");
  r = await api("DELETE", "/api/utilisateurs/" + ADMIN2_ID + "/profils/administrateur", ADMIN);
  ok(r.status === 200 && r.json.role === "caissier_structure" && JSON.stringify(r.json.profils) === '["caissier_structure"]', "un autre administrateur peut lui retirer le profil (il reste un admin actif)", r.json);
  r = await api("GET", "/api/auth/me", T.zt_admin2); ok(r.status === 401, "ses sessions d'administrateur sont fermées");
  r = await api("GET", "/api/journal/evenements?taille=100&categorie=ADMIN", ADMIN);
  ok(r.json.items.some(e => e.action === "utilisateur.profil.ajouter") && r.json.items.some(e => e.action === "utilisateur.profil.retirer") && r.json.items.some(e => e.action === "utilisateur.profil.principal"), "journal : ajouts, retraits et changements de profil principal tracés", r.json.items.map(e => e.action).slice(0, 12));
  r = await api("GET", "/api/journal/evenements?taille=100&categorie=AUTH", ADMIN); ok(r.json.items.some(e => e.action === "auth.profil.changer") && r.json.items.some(e => e.action === "auth.mdp.initial"), "journal : changement de profil actif et premier mot de passe tracés");
  r = await api("PUT", "/api/parametres/controles", ADMIN, { actif: true }); ok(r.status === 200 && r.json.actif === true, "(sécurité du test) contrôles anti-fraude laissés ACTIFS");
  r = await api("GET", "/api/journal/integrite", ADMIN); ok(r.status === 200 && r.json.ok === true, "intégrité du journal après tous les tests", r.json);

  const fails = res.filter(x => !x).length;
  console.log(`\n==== ${res.length - fails}/${res.length} OK ====`);
  console.log("IDS " + JSON.stringify({ HOSP, PHARM, P1, P2, P3 }));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("ERREUR", e); process.exit(2); });

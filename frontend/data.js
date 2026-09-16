/* Données fictives (mock) — aucune connexion backend.
   Sert uniquement à simuler la recherche d'un assuré par matricule
   et la liste des utilisateurs de l'application. */

const ASSURES = [
  {
    matricule: "1234567890",
    nom: "OBAME",
    prenom: "Jean-Pierre",
    sexe: "M",
    dateNaissance: "14/03/1985",
    situation: "Assuré",
    fonds: "Fonds Secteur Public",
    employeur: "Ministère de la Santé",
    telephone: "077 12 34 56",
    ayantsDroit: [
      { matricule: "1234567891", nom: "OBAME NGUEMA", prenom: "Marie", sexe: "F", lien: "Épouse", dateNaissance: "02/07/1988" },
      { matricule: "1234567892", nom: "OBAME", prenom: "Junior", sexe: "M", lien: "Enfant", dateNaissance: "19/11/2014" }
    ]
  },
  {
    matricule: "2345678901",
    nom: "MOUSSAVOU",
    prenom: "Sylvie",
    sexe: "F",
    dateNaissance: "27/09/1990",
    situation: "Assuré",
    fonds: "Fonds Secteur Privé",
    employeur: "SOBRAGA",
    telephone: "066 22 33 44",
    ayantsDroit: [
      { matricule: "2345678902", nom: "MOUSSAVOU", prenom: "Emma", sexe: "F", lien: "Enfant", dateNaissance: "05/01/2018" }
    ]
  },
  {
    matricule: "3456789012",
    nom: "NGUEMA ELLA",
    prenom: "Patrick",
    sexe: "M",
    dateNaissance: "11/12/1975",
    situation: "Assuré",
    fonds: "Fonds Garantie Sociale",
    employeur: "Retraité",
    telephone: "074 55 66 77",
    ayantsDroit: []
  },
  {
    matricule: "4567890123",
    nom: "ONDO",
    prenom: "Chantal",
    sexe: "F",
    dateNaissance: "03/05/1995",
    situation: "Assuré",
    fonds: "Fonds Secteur Privé",
    employeur: "Total Gabon",
    telephone: "062 88 99 00",
    ayantsDroit: [
      { matricule: "4567890124", nom: "ONDO", prenom: "Kevin", sexe: "M", lien: "Enfant", dateNaissance: "22/08/2020" },
      { matricule: "4567890125", nom: "ONDO", prenom: "Sarah", sexe: "F", lien: "Enfant", dateNaissance: "14/02/2022" }
    ]
  },
  {
    matricule: "5678901234",
    nom: "MBOUMBA",
    prenom: "Guy Roger",
    sexe: "M",
    dateNaissance: "30/06/1968",
    situation: "Assuré",
    fonds: "Fonds Secteur Public",
    employeur: "Ministère de l'Intérieur",
    telephone: "077 44 55 66",
    ayantsDroit: []
  }
];

const MEDECINS = [
  { id: 1, nom: "NZAMBA", prenom: "Serge", code: "MED-00123", etablissement: "CHU de Libreville", type: "Généraliste" },
  { id: 2, nom: "AKUE", prenom: "Rosine", code: "MED-00456", etablissement: "Polyclinique El Rapha", type: "Spécialiste" },
  { id: 3, nom: "OYANE", prenom: "Franck", code: "MED-00789", etablissement: "Centre Médical de Melen", type: "Généraliste" },
  { id: 4, nom: "BIYOGHE", prenom: "Nadège", code: "MED-01011", etablissement: "Hôpital d'Instruction des Armées", type: "Spécialiste" },
  { id: 5, nom: "MOUNGUENGUI", prenom: "Paul", code: "MED-01345", etablissement: "Clinique Sainte-Marie", type: "Autre" }
];

const USERS_SEED = [
  { id: 1, nom: "NDONG", prenom: "Alice", email: "a.ndong@cnamgs.ga", role: "Super Admin", statut: "Actif" },
  { id: 2, nom: "IBINGA", prenom: "Steevy", email: "s.ibinga@cnamgs.ga", role: "Agent hospitalier", statut: "Actif" },
  { id: 3, nom: "Dr. AKUE", prenom: "Rosine", email: "r.akue@cnamgs.ga", role: "Médecin", statut: "Actif" },
  { id: 4, nom: "MEZUI", prenom: "Bertrand", email: "b.mezui@cnamgs.ga", role: "DG", statut: "Inactif" },
  { id: 5, nom: "ESSONO", prenom: "Pierrette", email: "p.essono@cnamgs.ga", role: "Pharmacie", statut: "Actif", etablissement: "Pharmacie du Centre" },
  { id: 6, nom: "MOUELE", prenom: "Judicaël", email: "j.mouele@cnamgs.ga", role: "Pharmacie", statut: "Actif", etablissement: "Pharmacie Awendjé" },
  { id: 7, nom: "NZIGOU", prenom: "Sandrine", email: "s.nzigou@cnamgs.ga", role: "Pharmacie", statut: "Actif", etablissement: "Pharmacie Nzeng-Ayong" },
  { id: 8, nom: "OBIANG", prenom: "Léa", email: "l.obiang@cnamgs.ga", role: "Caisse", statut: "Actif" }
];

/* Catalogue fictif des médicaments, avec un tarif de référence fixe
   (utilisé par l'espace Pharmacien pour calculer part assurance / part
   patient — le médecin ne prescrit que la désignation et la quantité). */
const MEDICAMENTS = [
  { designation: "Paracétamol 500mg (boîte de 16)", prix: 800 },
  { designation: "Amoxicilline 500mg (boîte de 12)", prix: 2500 },
  { designation: "Ibuprofène 400mg (boîte de 20)", prix: 1500 },
  { designation: "Oméprazole 20mg (boîte de 14)", prix: 3200 },
  { designation: "Metformine 850mg (boîte de 30)", prix: 2800 },
  { designation: "Amlodipine 5mg (boîte de 30)", prix: 3500 },
  { designation: "Salbutamol spray (100 doses)", prix: 4200 },
  { designation: "Sérum physiologique (10 unidoses)", prix: 1200 }
];

/* --------------------------------------------------------------------------
   Jeu de données fictif pour le tableau de bord (courbes d'évolution,
   répartition consultations/examens, dernières opérations médicales).
   Ces entrées suivent exactement la même structure que celles créées par
   l'application (voir submitAgentFeuille / submitMedecinValidation dans
   app.js) afin que le tableau de bord puisse être branché directement sur
   state.historique, sans logique spécifique.
   -------------------------------------------------------------------------- */

const PRESTATIONS_CONSULTATION = [
  "Consultation générale",
  "Consultation de suivi",
  "Consultation spécialisée",
  "Consultation prénatale"
];
const PRESTATIONS_EXAMEN = [
  "Radiographie thorax",
  "Échographie abdominale",
  "Analyse de sang",
  "Scanner cérébral",
  "IRM genou",
  "Électrocardiogramme"
];

function pad2(n) { return String(n).padStart(2, "0"); }
function dateFRFromOffset(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
}

/* [ jours dans le passé, type, index assuré, index médecin, montant, ticket modérateur, statut ] */
const HISTORIQUE_SEED_PLAN = [
  [0, "Consultation", 0, 0, 15000, 3000, "En attente"],
  [0, "Examen", 2, 1, 45000, 9000, "En attente"],
  [1, "Consultation", 1, 2, 12000, 0, "Validée"],
  [1, "Consultation", 3, 0, 15000, 3000, "Validée"],
  [2, "Examen", 4, 3, 60000, 12000, "Validée"],
  [2, "Consultation", 0, 1, 18000, 3600, "Validée"],
  [3, "Examen", 1, 4, 30000, 6000, "Validée"],
  [3, "Consultation", 2, 2, 15000, 0, "Validée"],
  [4, "Consultation", 3, 0, 15000, 3000, "Validée"],
  [5, "Examen", 4, 1, 52000, 10400, "Validée"],
  [5, "Consultation", 0, 3, 20000, 4000, "Validée"],
  [6, "Examen", 1, 4, 38000, 7600, "Validée"],
  [7, "Consultation", 2, 0, 15000, 3000, "Validée"],
  [8, "Consultation", 3, 2, 17000, 0, "Validée"],
  [8, "Examen", 4, 3, 41000, 8200, "Validée"],
  [9, "Consultation", 0, 1, 15000, 3000, "Validée"],
  [10, "Examen", 1, 4, 55000, 11000, "Validée"],
  [11, "Consultation", 2, 2, 16000, 3200, "Validée"],
  [12, "Consultation", 3, 0, 15000, 0, "Validée"],
  [13, "Examen", 4, 1, 47000, 9400, "Validée"],
  [14, "Consultation", 0, 3, 15000, 3000, "Validée"],
  [15, "Examen", 1, 4, 33000, 6600, "Validée"],
  [17, "Consultation", 2, 0, 15000, 3000, "Validée"],
  [18, "Consultation", 3, 2, 19000, 0, "Validée"],
  [19, "Examen", 4, 1, 58000, 11600, "Validée"],
  [20, "Consultation", 0, 3, 15000, 3000, "Validée"],
  [21, "Examen", 1, 4, 36000, 7200, "Validée"],
  [23, "Consultation", 2, 0, 15000, 3000, "Validée"],
  [25, "Consultation", 3, 2, 21000, 0, "Validée"],
  [26, "Examen", 4, 1, 49000, 9800, "Validée"],
  [28, "Consultation", 0, 3, 15000, 3000, "Validée"],
  [29, "Examen", 1, 4, 44000, 8800, "Validée"]
];

function buildHistoriqueSeed() {
  const entries = HISTORIQUE_SEED_PLAN.map((row, i) => {
    const [daysAgo, type, assureIdx, medecinIdx, montant, tm, statut] = row;
    const assure = ASSURES[assureIdx];
    const medecin = MEDECINS[medecinIdx];
    const isExamen = type === "Examen";
    const designation = isExamen
      ? PRESTATIONS_EXAMEN[i % PRESTATIONS_EXAMEN.length]
      : PRESTATIONS_CONSULTATION[i % PRESTATIONS_CONSULTATION.length];
    const part = montant - tm;
    const numero = "F" + new Date().getFullYear() + "-" + String(10000 + i).padStart(5, "0");
    const date = dateFRFromOffset(daysAgo);
    const prestations = statut === "Validée"
      ? [{ designation: designation, qte: "1", montant: String(montant), tm: String(tm), part: String(part), valide: String(part) }]
      : [];

    return {
      id: 1700000000000 + i,
      numero: numero,
      date: date,
      type: type,
      patientNom: assure.prenom + " " + assure.nom,
      dateNaissance: assure.dateNaissance,
      matricule: assure.matricule,
      estAssure: true,
      fonds: assure.fonds,
      ticketModerateur: tm === 0 ? "Exonéré" : "Plein",
      medecin: "Dr. " + medecin.prenom + " " + medecin.nom,
      medecinEtab: medecin.etablissement,
      medecinCode: medecin.code,
      medecinType: medecin.type,
      accidentTiers: "Non",
      grossesse: "Non",
      statut: statut,
      prestations: prestations,
      prestaDate: date,
      prestaDomicile: "Non",
      prestaCode: "",
      totalMontant: statut === "Validée" ? String(montant) : "0",
      totalTm: statut === "Validée" ? String(tm) : "0",
      totalPart: statut === "Validée" ? String(part) : "0",
      signature: statut === "Validée" ? medecin.nom : ""
    };
  });
  // HISTORIQUE_SEED_PLAN est déjà trié du plus récent (0 jour) au plus ancien (29 jours),
  // comme state.historique où les nouvelles feuilles sont ajoutées en tête (unshift).
  return entries;
}

const HISTORIQUE_SEED = buildHistoriqueSeed();

/* Ordonnances de démonstration pour l'espace Pharmacien, greffées sur deux
   consultations déjà validées (index 2 et 3 de HISTORIQUE_SEED_PLAN). */
HISTORIQUE_SEED[2].ordonnance = [
  {
    designation: MEDICAMENTS[0].designation, quantite: "1", posologie: "1 comprimé matin et soir, 5 jours",
    statut: "Servi", servicePar: "Pharmacie Awendjé", dateService: dateFRFromOffset(3),
    prixUnitaire: String(MEDICAMENTS[0].prix),
    partAssurance: String(MEDICAMENTS[0].prix),
    partPatient: "0"
  },
  { designation: MEDICAMENTS[2].designation, quantite: "1", posologie: "1 comprimé au coucher, 3 jours", statut: "Non servi", servicePar: "", dateService: "", prixUnitaire: "", partAssurance: "", partPatient: "" }
];
HISTORIQUE_SEED[3].ordonnance = [
  {
    designation: MEDICAMENTS[1].designation, quantite: "1", posologie: "1 comprimé 3 fois par jour, 7 jours",
    statut: "Servi", servicePar: "Pharmacie du Centre", dateService: dateFRFromOffset(1),
    prixUnitaire: String(MEDICAMENTS[1].prix),
    partAssurance: String(Math.round(MEDICAMENTS[1].prix * 0.8)),
    partPatient: String(Math.round(MEDICAMENTS[1].prix * 0.2))
  },
  { designation: MEDICAMENTS[3].designation, quantite: "1", posologie: "1 comprimé par jour, 14 jours", statut: "Non servi", servicePar: "", dateService: "", prixUnitaire: "", partAssurance: "", partPatient: "" }
];

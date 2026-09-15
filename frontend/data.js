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
  { id: 1, nom: "NDONG", prenom: "Alice", email: "a.ndong@cnamgs.ga", role: "Administrateur", statut: "Actif" },
  { id: 2, nom: "IBINGA", prenom: "Steevy", email: "s.ibinga@cnamgs.ga", role: "Agent de guichet", statut: "Actif" },
  { id: 3, nom: "Dr. AKUE", prenom: "Rosine", email: "r.akue@cnamgs.ga", role: "Médecin-conseil", statut: "Actif" },
  { id: 4, nom: "MEZUI", prenom: "Bertrand", email: "b.mezui@cnamgs.ga", role: "Contrôleur", statut: "Inactif" }
];

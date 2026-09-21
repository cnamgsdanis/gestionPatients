package model;

import java.util.List;

/**
 * Un événement du journal d'audit (table Journal_evenement, en ajout seul).
 * Les dates sont en UTC, au format ISO-8601 avec « Z » (ex : 2026-09-19T12:34:56.123Z).
 */
public class JournalEvenement {
    public long    id;
    public String  horodatage;        // ISO UTC, renseigné par le serveur
    public String  origine = "api";   // 'api' = tracé par le serveur, 'ui' = signalé par l'interface
    public String  sessionId;
    public String  correlationId;
    public Integer idUtilisateur;
    public String  login;
    public String  nomAffiche;
    public String  role;
    public Integer idStructure;
    public String  etablissement;
    public String  categorie;         // AUTH, ASSURE, PEC, CONSULTATION, EXAMEN, PHARMACIE, PAIEMENT, ADMIN, ...
    public String  action;            // code stable : auth.login.echec, feuille.valider, ...
    public String  libelle;
    public String  resultat = "SUCCES";   // SUCCES | ECHEC | REFUSE | ANNULE
    public String  message;
    public String  ressourceType;
    public String  ressourceId;
    public String  ressourceLibelle;
    public String  nagMasque;
    public String  avant;             // JSON
    public String  apres;             // JSON
    public String  contexte;          // JSON (page, appareil, ...)
    public String  ip;
    public String  userAgent;
    public String  severite = "INFO"; // INFO | ATTENTION | ALERTE | CRITIQUE
    public int     score;             // 0 à 100
    public String  regles;            // JSON : [{code,label,points}]
    public String  statutRevue = "Nouveau";
    public String  revuePar;
    public String  revueLe;
    public String  revueNote;
    public String  hashPrecedent;
    public String  hash;

    /** Règles de risque déjà connues de l'appelant (ex : prix anormal), fusionnées avec celles du serveur. */
    public transient List<JournalRegle> reglesSupp;

    public JournalEvenement() {}

    /** Règle de détection déclenchée par un événement. */
    public static class JournalRegle {
        public String code;
        public String label;
        public int    points;
        public JournalRegle(String code, String label, int points) {
            this.code = code;
            this.label = label;
            this.points = points;
        }
    }
}

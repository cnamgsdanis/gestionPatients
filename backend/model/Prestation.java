package model;

import java.math.BigDecimal;

/**
 * Modèle représentant une prestation médicale.
 * Une prestation est une consultation, un examen, une pharmacie ou une hospitalisation.
 */
public class Prestation {

    public int        id_prestation;
    public BigDecimal montant;            // DECIMAL(10,2) → BigDecimal (précision monétaire)
    public String     date_prs;           // DATE → String ISO 8601 (yyyy-MM-dd)
    public String     type_prestation;    // 'consultation', 'examen', 'pharmacie', 'hospitalisation'

    public int        id_patient;
    public int        id_utilisateur;     // l'utilisateur (médecin/agent) qui a créé
    public int        id_structure;

    // Champs d'affichage (remplis par le DAO via JOIN)
    public String     patient_nom;        // (prenom + ' ' + nom) du patient
    public String     utilisateur_nom;    // nom de l'utilisateur (médecin/agent)
    public String     structure_nom;      // raison sociale de la structure

    public Prestation() {}
}
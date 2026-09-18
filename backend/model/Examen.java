package model;

/**
 * Modèle représentant un examen médical.
 * Un examen est rattaché à une Prestation de type 'examen'.
 */
public class Examen {

    public int    id_examen;
    public String type_examen;      // ex: "radiographie", "analyse sang"
    public String date_examen;      // ISO 8601 (yyyy-MM-dd)
    public String statut;           // 'en_attente', 'en_cours', 'termine', 'annule'
    public int    id_prestation;

    // Champs d'affichage (remplis par le DAO via JOIN)
    public String patient_nom;
    public String type_prestation;  // pour info

    public Examen() {}
}
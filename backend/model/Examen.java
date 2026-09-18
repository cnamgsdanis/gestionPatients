package model;

/**
 * DTO représentant un examen dans le dossier patient.
 * Composé d'une ligne Prestation (type_prestation = 'examen') et de la ligne
 * Examen qui lui est liée (voir ExamenDAO). Ce modèle regroupe les deux pour
 * l'API, sans exposer cette séparation au frontend.
 */
public class Examen {

    public int     id_examen;          // clé primaire (Examen), 0 = pas encore créé
    public int     id_prestation;      // clé primaire (Prestation), 0 = pas encore créée
    public int     id_patient;
    public int     id_medecin;         // médecin ayant prescrit l'examen
    public String  medecin_nom;        // dénormalisé pour l'affichage (lecture seule, non persisté)
    public int     id_structure;
    public double  montant;
    public String  date_examen;        // AAAA-MM-JJ
    public String  type_examen;
    public String  statut;

    public Examen() {}
}

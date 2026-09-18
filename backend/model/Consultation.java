package model;

/**
 * DTO représentant une consultation dans le dossier patient.
 * Une consultation n'a pas de table dédiée : elle est composée d'une ligne
 * Prestation (type_prestation = 'consultation') et de la ligne Prise_en_charge
 * qui lui est liée (voir ConsultationDAO). Ce modèle regroupe les deux pour
 * l'API, sans exposer cette séparation au frontend.
 */
public class Consultation {

    public int     id_prestation;      // clé primaire (Prestation), 0 = pas encore créée
    public int     id_pec;             // clé primaire (Prise_en_charge), 0 = pas encore créée
    public int     id_patient;
    public int     id_medecin;         // médecin ayant réalisé la consultation
    public String  medecin_nom;        // dénormalisé pour l'affichage (lecture seule, non persisté)
    public int     id_structure;
    public String  date;               // AAAA-MM-JJ, partagée entre date_prs et date_pec
    public double  montant;
    public double  montant_pec;
    public String  numero_de_feuille;
    public String  type_feuille;
    public String  statut;

    public Consultation() {}
}

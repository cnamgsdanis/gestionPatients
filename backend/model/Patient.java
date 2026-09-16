package model;

/**
 * Modèle représentant un patient.
 * Chaque champ correspond à une colonne de la table Patient en base.
 */
public class Patient {

    public int     id_patient;       // clé primaire
    public String  photo_url;        // URL de la photo (peut être null)
    public String  prenom;
    public String  nom;
    public String  sex;              // "M" ou "F"
    public String  contact;          // téléphone (peut être null)
    public boolean statut_assure;    // true = assuré
    public double  fonds;            // montant disponible
    public String  matricule_nag;    // numéro d'assuré

    // Constructeur vide obligatoire pour Gson
    public Patient() {}
}
package model;

/**
 * Modèle représentant un patient.
 * Chaque champ correspond à une colonne de la table Patient en base.
 */
public class Patient {

    public int      id_patient;              // clé primaire
    public String   photo_url;               // URL de la photo (peut être null)
    public String   prenom;
    public String   nom;
    public String   sex;                     // "M" ou "F"
    public String   contact;                 // téléphone (peut être null)
    public String   adresse;                 // adresse (peut être null)
    public String   date_naissance;          // AAAA-MM-JJ (peut être null)
    public boolean  statut_assure;           // true = assuré
    public Integer  fonds;                   // niveau 1, 2, 3 ou 4 (peut être null)
    public Integer  matricule_nag;           // NAG INT, exactement 10 chiffres, chiffres uniquement (ex: 2026000001)
    public Integer  id_assure_principal;     // NULL si patient principal, sinon ID du parent

    // ######################################################################
    // AYANT DROIT / ASSURE PRINCIPAL  (champs calculés, PAS en BDD)
    //
    // Un ENFANT (ayant droit) a id_assure_principal = id du PARENT.
    // Quand on SOIGNE l'enfant, l'assurance utilisée est celle du PARENT.
    //
    //   assure_principal  = fiche du parent (null si ce patient EST le principal)
    //   fonds_couverture  = fonds du parent si ayant droit, sinon son propre fonds
    // ######################################################################
    public Patient  assure_principal;
    public Integer  fonds_couverture;

    // Constructeur vide obligatoire pour Gson
    public Patient() {}
}

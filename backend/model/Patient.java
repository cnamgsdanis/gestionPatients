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
    public boolean  statut_assure;           // true = actif, false = SUSPENDU (aucune prestation possible)
    public String   statut;                  // "actif" | "suspendu" (déduit de statut_assure ; accepté en entrée)
    public String   nature;                  // "Assuré principal" | "Ayant droit" | "Conjoint" (colonne nvarchar(50))
    public Integer  nature_assure;           // 1 assuré principal, 2 ayant droit, 3 conjoint (déduit de « nature »)
    public Integer  fonds;                   // niveau 1, 2, 3 ou 4 (peut être null)
    public String   matricule_nag;           // NAG : NVARCHAR(20), exactement 10 chiffres (CK_Patient_nag_10), ex: 2345678901
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

    /** Libellé canonique de la nature à partir d'un code 1/2/3 ou d'un texte libre ; null si inconnu. */
    public static String natureCanonique(String brut) {
        if (brut == null || brut.isBlank()) return null;
        String t = brut.trim().toLowerCase();
        if (t.equals("1") || t.contains("principal")) return "Assuré principal";
        if (t.equals("2") || t.contains("ayant")) return "Ayant droit";
        if (t.equals("3") || t.contains("conjoint")) return "Conjoint";
        return null;
    }

    /** Code 1/2/3 de la nature, ou null. */
    public static Integer natureCode(String nature) {
        String c = natureCanonique(nature);
        if (c == null) return null;
        return c.equals("Assuré principal") ? 1 : c.equals("Ayant droit") ? 2 : 3;
    }
}

package model;

/**
 * Modèle représentant une structure (hôpital ou pharmacie).
 * Correspond à une ligne de la table Structure.
 */
public class Structure {

    public int     id_structure;      // clé primaire
    public String  raison_sociale;    // nom de la structure
    public String  addresse;          // adresse ( 2 'd' comme en base)
    public String  type_structure;    // 'hopital' ou 'pharmacie'

    // Constructeur vide obligatoire pour Gson
    public Structure() {}

    /** Vrai si la structure est une pharmacie. */
    public boolean estPharmacie() {
        return "pharmacie".equals(type_structure);
    }

    /** Vrai si la structure est un hôpital (structure sanitaire). */
    public boolean estSanitaire() {
        return "hopital".equals(type_structure);
    }
}
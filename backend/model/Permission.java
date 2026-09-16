package model;

/**
 * Modèle représentant une permission.
 * Exemple : { id: 1, code: "patient.creer", description: "Créer un patient" }
 */
public class Permission {

    public int    id_permission;
    public String code;          // ex: "patient.creer"
    public String description;   // ex: "Créer un patient"

    public Permission() {}
}
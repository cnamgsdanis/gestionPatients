package model;

public class Utilisateur {

    public int     id_utilisateur;
    public String  username;
    public String  mot_de_passe;

    public String  nom;
    public String  email;
    public String  telephone;

    public String  role;
    public int     id_structure;
    public String  structure_nom;   //  Nom de la structure (rempli par le DAO)

    public boolean actif;
    public String  date_creation;
    public String  derniere_connexion;

    public Utilisateur() {}

    public static final String[] ROLES_VALIDES = {
        "administrateur", "agent_accueil", "pharmacien",
        "medecin", "directeur_structure", "caissier_structure"
    };

    public Utilisateur sansMotDePasse() {
        Utilisateur c = new Utilisateur();
        c.id_utilisateur     = this.id_utilisateur;
        c.username           = this.username;
        c.mot_de_passe       = null;
        c.nom                = this.nom;
        c.email              = this.email;
        c.telephone          = this.telephone;
        c.role               = this.role;
        c.id_structure       = this.id_structure;
        c.structure_nom      = this.structure_nom;   //  Nom de la structure (rempli par le DAO)
        c.actif              = this.actif;
        c.date_creation      = this.date_creation;
        c.derniere_connexion = this.derniere_connexion;
        return c;
    }
}
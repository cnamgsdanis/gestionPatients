package model;

import java.util.ArrayList;
import java.util.List;

/**
 * Modèle représentant un utilisateur de l'application.
 * Correspond à une ligne de la table Utilisateur (+ ses profils, table Utilisateur_profil).
 *
 * PROFILS : un « profil » est un rôle ; il décide des interfaces (écrans) et des droits. Un compte peut en
 * porter plusieurs. « role » est le PROFIL PRINCIPAL en base (celui de la connexion par défaut) ; dans les réponses
 * de session (login, me, refresh, changement de profil) il contient le profil ACTIF de la session.
 */
public class Utilisateur {

    public int     id_utilisateur;
    public String  username;
    public String  mot_de_passe;    // hash BCrypt en base, en clair uniquement dans les requêtes d'entrée
    public String  prenom;          // facultatif ; s'il est renseigné, « nom » est le nom de famille seul
    public String  nom;
    public String  email;
    public String  telephone;
    public String  role;
    public List<String> profils;    // tous les profils du compte, principal en premier (rempli par le DAO)
    public String  profil_principal;// profil principal en base (renseigné dans les réponses)
    public int     id_structure;
    public String  structure_nom;   // Nom de la structure (rempli par le DAO)
    public String  code_praticien;  // médecins : code sur la feuille de soins
    public String  type_praticien;  // médecins : Généraliste / Spécialiste / Autre
    public boolean actif;
    public boolean doit_changer_mdp;// mot de passe temporaire : à remplacer à la première connexion
    public String  date_creation;
    public String  derniere_connexion;

    public Utilisateur() {}

    public static final String[] ROLES_VALIDES = {
        "administrateur", "agent_accueil", "pharmacien",
        "medecin", "directeur_structure", "caissier_structure"
    };

    public static boolean roleValide(String role) {
        for (String r : ROLES_VALIDES) if (r.equals(role)) return true;
        return false;
    }

    /** Message d'erreur si la liste contient un profil inconnu, sinon null (liste absente = rien à vérifier). */
    public static String erreurProfils(List<String> liste) {
        if (liste == null) return null;
        for (String p : liste) if (!roleValide(p)) return "profil invalide : " + p;
        return null;
    }

    /** Vrai si le compte porte ce profil (le profil principal compte toujours). */
    public boolean aProfil(String profil) {
        if (profil == null) return false;
        if (profil.equals(role)) return true;
        return profils != null && profils.contains(profil);
    }

    /** Nom complet pour l'affichage : « prénom nom ». */
    public String nomComplet() {
        return ((prenom == null ? "" : prenom.trim() + " ") + (nom == null ? "" : nom.trim())).trim();
    }

    /** Copie sans le hash du mot de passe (à renvoyer au client). */
    public Utilisateur sansMotDePasse() {
        Utilisateur c = new Utilisateur();
        c.id_utilisateur     = this.id_utilisateur;
        c.username           = this.username;
        c.mot_de_passe       = null;
        c.prenom             = this.prenom;
        c.nom                = this.nom;
        c.email              = this.email;
        c.telephone          = this.telephone;
        c.role               = this.role;
        c.profils            = this.profils == null ? new ArrayList<>(List.of(this.role)) : new ArrayList<>(this.profils);
        c.profil_principal   = this.profil_principal != null ? this.profil_principal : this.role;
        c.id_structure       = this.id_structure;
        c.structure_nom      = this.structure_nom;
        c.code_praticien     = this.code_praticien;
        c.type_praticien     = this.type_praticien;
        c.actif              = this.actif;
        c.doit_changer_mdp   = this.doit_changer_mdp;
        c.date_creation      = this.date_creation;
        c.derniere_connexion = this.derniere_connexion;
        return c;
    }

    /** Copie pour une SESSION : « role » = le profil actif de la session (« profil_principal » reste celui de la base). */
    public Utilisateur pourSession(String profilActif) {
        Utilisateur c = sansMotDePasse();
        c.profil_principal = this.role;
        c.role = profilActif != null && aProfil(profilActif) ? profilActif : this.role;
        return c;
    }
}

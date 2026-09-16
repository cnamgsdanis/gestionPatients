// ============================================================
// UtilisateurDAO.java — Data Access Object pour Utilisateur
// ------------------------------------------------------------
// Toutes les requêtes SQL concernant les utilisateurs.
// Ne contient AUCUNE logique de hashage (c'est le rôle d'AuthService).
// ============================================================

package dao;

import db.Database;
import model.Utilisateur;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class UtilisateurDAO {

    // ------------------------------------------------------------
    // Recherche un utilisateur par son username.
    // Utilisée principalement par l'authentification.
    // Renvoie null si aucun utilisateur ne porte ce username.
    // ------------------------------------------------------------
    public Utilisateur findByUsername(String username) throws SQLException {

        String sql = "SELECT * FROM Utilisateur WHERE username = ?";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setString(1, username);

            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // Insère un nouvel utilisateur.
    // ⚠️ Le mot de passe DOIT être déjà hashé avant d'appeler
    //    cette méthode. Le DAO ne fait AUCUN hashage.
    // Renvoie l'ID auto-généré.
    // ------------------------------------------------------------
    public int insert(Utilisateur u) throws SQLException {

        String sql = "INSERT INTO Utilisateur " +
                     "(username, mot_de_passe, nom, email, telephone, role, id_structure) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?)";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {

            ps.setString(1, u.username);
            ps.setString(2, u.mot_de_passe);   // doit déjà être hashé !
            ps.setString(3, u.nom);
            ps.setString(4, u.email);
            ps.setString(5, u.telephone);
            ps.setString(6, u.role);
            ps.setInt   (7, u.id_structure);

            ps.executeUpdate();

            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) u.id_utilisateur = keys.getInt(1);
            }
        }
        return u.id_utilisateur;
    }

    // ------------------------------------------------------------
    // Recherche un utilisateur par son ID.
    // ------------------------------------------------------------
    public Utilisateur findById(int id) throws SQLException {

        String sql = "SELECT * FROM Utilisateur WHERE id_utilisateur = ?";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setInt(1, id);

            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // Liste tous les utilisateurs (utile pour l'admin).
    // ------------------------------------------------------------
    public List<Utilisateur> findAll() throws SQLException {

        List<Utilisateur> liste = new ArrayList<>();
        String sql = "SELECT * FROM Utilisateur";

        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {

            while (rs.next()) liste.add(map(rs));
        }
        return liste;
    }

    // ------------------------------------------------------------
    // Met à jour la date de dernière connexion.
    // Appelée après un login réussi.
    // ------------------------------------------------------------
    public void updateDerniereConnexion(int idUtilisateur) throws SQLException {

        String sql = "UPDATE Utilisateur SET derniere_connexion = SYSDATETIME() " +
                     "WHERE id_utilisateur = ?";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setInt(1, idUtilisateur);
            ps.executeUpdate();
        }
    }

    // ------------------------------------------------------------
    // map() : transforme une ligne SQL en objet Utilisateur.
    // ------------------------------------------------------------
    private Utilisateur map(ResultSet rs) throws SQLException {

        Utilisateur u = new Utilisateur();
        u.id_utilisateur     = rs.getInt("id_utilisateur");
        u.username           = rs.getString("username");
        u.mot_de_passe       = rs.getString("mot_de_passe");
        u.nom                = rs.getString("nom");
        u.email              = rs.getString("email");
        u.telephone          = rs.getString("telephone");
        u.role               = rs.getString("role");
        u.id_structure       = rs.getInt("id_structure");
        u.actif              = rs.getBoolean("actif");
        u.date_creation      = rs.getString("date_creation");
        u.derniere_connexion = rs.getString("derniere_connexion");
        return u;
    }
}
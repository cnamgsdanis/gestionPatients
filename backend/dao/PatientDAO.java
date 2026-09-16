// ============================================================
// PatientDAO.java — Data Access Object pour l'entité Patient
// ------------------------------------------------------------
// Cette classe contient TOUTES les requêtes SQL concernant
// les patients : SELECT, INSERT, UPDATE, DELETE.
// Elle ne sait RIEN du HTTP ni du JSON.
// ============================================================

package dao;   // Ce fichier appartient au package "dao"

// Imports internes à notre projet
import db.Database;      // Pour obtenir une connexion à la BD
import model.Patient;    // Le modèle qu'on va manipuler

// Imports JDBC (classes du JDK pour parler à la base)
import java.sql.*;                 // Connection, PreparedStatement, ResultSet, SQLException, etc.
import java.util.ArrayList;        // Pour construire des listes
import java.util.List;             // Interface List

/**
 * DAO pour l'entité Patient.
 */
public class PatientDAO {

    // ------------------------------------------------------------
    // SELECT * FROM Patient
    // Renvoie la liste complète des patients.
    // ------------------------------------------------------------
    public List<Patient> findAll() throws SQLException {

        List<Patient> liste = new ArrayList<>();          // Liste résultat
        String sql = "SELECT * FROM Patient";              // Requête SQL

        // try-with-resources : ferme automatiquement Connection, Statement et ResultSet
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {

            // Parcours chaque ligne du résultat
            while (rs.next()) {
                liste.add(map(rs));   // map() transforme la ligne en objet Patient
            }
        }
        return liste;
    }

    // ------------------------------------------------------------
    // SELECT * FROM Patient WHERE id_patient = ?
    // Renvoie UN patient par son ID, ou null s'il n'existe pas.
    // ------------------------------------------------------------
    public Patient findById(int id) throws SQLException {

        String sql = "SELECT * FROM Patient WHERE id_patient = ?";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setInt(1, id);   // Remplace le 1er "?" par id

            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // INSERT INTO Patient (...) VALUES (...)
    // Insère un patient et renvoie son ID auto-généré.
    // ------------------------------------------------------------
    public int insert(Patient p) throws SQLException {

        String sql = "INSERT INTO Patient " +
                     "(photo_url, prenom, nom, sex, contact, statut_assure, fonds, matricule_nag) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

        // RETURN_GENERATED_KEYS : demande à SQL Server de renvoyer l'ID créé
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {

            // Remplace chaque "?" par la valeur correspondante
            ps.setString (1, p.photo_url);
            ps.setString (2, p.prenom);
            ps.setString (3, p.nom);
            ps.setString (4, p.sex);
            ps.setString (5, p.contact);
            ps.setBoolean(6, p.statut_assure);
            ps.setDouble (7, p.fonds);
            ps.setString (8, p.matricule_nag);

            ps.executeUpdate();   // Exécute l'INSERT

            // Récupère l'ID auto-généré
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) p.id_patient = keys.getInt(1);
            }
        }
        return p.id_patient;
    }

    // ------------------------------------------------------------
    // UPDATE Patient SET ... WHERE id_patient = ?
    // Renvoie true si une ligne a été modifiée, false sinon.
    // ------------------------------------------------------------
    public boolean update(Patient p) throws SQLException {

        String sql = "UPDATE Patient SET photo_url=?, prenom=?, nom=?, sex=?, contact=?, " +
                     "statut_assure=?, fonds=?, matricule_nag=? WHERE id_patient=?";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setString (1, p.photo_url);
            ps.setString (2, p.prenom);
            ps.setString (3, p.nom);
            ps.setString (4, p.sex);
            ps.setString (5, p.contact);
            ps.setBoolean(6, p.statut_assure);
            ps.setDouble (7, p.fonds);
            ps.setString (8, p.matricule_nag);
            ps.setInt    (9, p.id_patient);   // WHERE id_patient = ?

            return ps.executeUpdate() > 0;    // true si au moins 1 ligne modifiée
        }
    }

    // ------------------------------------------------------------
    // DELETE FROM Patient WHERE id_patient = ?
    // Renvoie true si la suppression a réussi.
    // ------------------------------------------------------------
    public boolean delete(int id) throws SQLException {

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM Patient WHERE id_patient=?")) {

            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // map() : transforme la ligne courante d'un ResultSet
    // en un objet Patient. Utilisée par findAll et findById.
    // ------------------------------------------------------------
    private Patient map(ResultSet rs) throws SQLException {

        Patient p = new Patient();
        p.id_patient    = rs.getInt("id_patient");
        p.photo_url     = rs.getString("photo_url");
        p.prenom        = rs.getString("prenom");
        p.nom           = rs.getString("nom");
        p.sex           = rs.getString("sex");
        p.contact       = rs.getString("contact");
        p.statut_assure = rs.getBoolean("statut_assure");
        p.fonds         = rs.getDouble("fonds");
        p.matricule_nag = rs.getString("matricule_nag");
        return p;
    }
}
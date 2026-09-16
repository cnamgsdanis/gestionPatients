package dao;

import db.Database;
import model.Patient;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Patient.
 * Gère notamment le niveau de fonds (1-4) et l'assuré principal.
 */
public class PatientDAO {

    // ------------------------------------------------------------
    // SELECT * FROM Patient
    // ------------------------------------------------------------
    public List<Patient> findAll() throws SQLException {
        List<Patient> liste = new ArrayList<>();
        String sql = "SELECT * FROM Patient";
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) liste.add(map(rs));
        }
        return liste;
    }

    // ------------------------------------------------------------
    // SELECT * FROM Patient WHERE id_patient = ?
    // ------------------------------------------------------------
    public Patient findById(int id) throws SQLException {
        String sql = "SELECT * FROM Patient WHERE id_patient = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // INSERT INTO Patient (...) VALUES (...)
    // ------------------------------------------------------------
    public int insert(Patient p) throws SQLException {

        String sql = "INSERT INTO Patient " +
                     "(photo_url, prenom, nom, sex, contact, " +
                     " statut_assure, fonds, matricule_nag, id_assure_principal) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {

            ps.setString (1, p.photo_url);
            ps.setString (2, p.prenom);
            ps.setString (3, p.nom);
            ps.setString (4, p.sex);
            ps.setString (5, p.contact);
            ps.setBoolean(6, p.statut_assure);
            ps.setObject (7, p.fonds);                 // 🆕 TINYINT, gère null
            ps.setString (8, p.matricule_nag);
            ps.setObject (9, p.id_assure_principal);   // 🆕 INT NULL, gère null

            ps.executeUpdate();

            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) p.id_patient = keys.getInt(1);
            }
        }
        return p.id_patient;
    }

    // ------------------------------------------------------------
    // UPDATE Patient SET ... WHERE id_patient = ?
    // ------------------------------------------------------------
    public boolean update(Patient p) throws SQLException {

        String sql = "UPDATE Patient SET " +
                     "photo_url=?, prenom=?, nom=?, sex=?, contact=?, " +
                     "statut_assure=?, fonds=?, matricule_nag=?, id_assure_principal=? " +
                     "WHERE id_patient=?";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setString (1, p.photo_url);
            ps.setString (2, p.prenom);
            ps.setString (3, p.nom);
            ps.setString (4, p.sex);
            ps.setString (5, p.contact);
            ps.setBoolean(6, p.statut_assure);
            ps.setObject (7, p.fonds);
            ps.setString (8, p.matricule_nag);
            ps.setObject (9, p.id_assure_principal);
            ps.setInt    (10, p.id_patient);

            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // DELETE FROM Patient WHERE id_patient = ?
    // ------------------------------------------------------------
    public boolean delete(int id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM Patient WHERE id_patient=?")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // map() : ResultSet -> Patient
    // ------------------------------------------------------------
    private Patient map(ResultSet rs) throws SQLException {
        Patient p = new Patient();
        p.id_patient          = rs.getInt("id_patient");
        p.photo_url           = rs.getString("photo_url");
        p.prenom              = rs.getString("prenom");
        p.nom                 = rs.getString("nom");
        p.sex                 = rs.getString("sex");
        p.contact             = rs.getString("contact");
        p.statut_assure       = rs.getBoolean("statut_assure");

        //  fonds : int nullable
        int fonds = rs.getInt("fonds");
        p.fonds = rs.wasNull() ? null : fonds;

        p.matricule_nag = rs.getString("matricule_nag");

        //  id_assure_principal : int nullable
        int assure = rs.getInt("id_assure_principal");
        p.id_assure_principal = rs.wasNull() ? null : assure;

        return p;
    }
}
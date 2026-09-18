package dao;

import db.Database;
import model.Patient;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Patient.
 * Gère notamment le niveau de fonds (1-4), l'assuré principal,
 * et le NAG (entier, généré automatiquement).
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

    // ######################################################################
    // TELEPHONE UNIQUE : un numero ne peut pas appartenir a 2 patients
    // ######################################################################
    public Patient findByContact(String contact) throws SQLException {
        if (contact == null || contact.isBlank()) return null;
        String sql = "SELECT * FROM Patient WHERE contact = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, contact.trim());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ######################################################################
    // AYANT DROIT : tous les patients "sous l'aile" d'un assuré principal
    // SELECT * FROM Patient WHERE id_assure_principal = ?
    // Exemple : parent id=1007 → liste des enfants liés à 1007
    // ######################################################################
    public List<Patient> findAyantsDroit(int idAssurePrincipal) throws SQLException {
        List<Patient> liste = new ArrayList<>();
        String sql = "SELECT * FROM Patient WHERE id_assure_principal = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idAssurePrincipal);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) liste.add(map(rs));
            }
        }
        return liste; 
    }

    // ------------------------------------------------------------
    // ENDPOINT FAIT : GET /api/patients/nag/{matricule}
    // NAG = INT, exactement 10 chiffres. Aucun prefixe impose.
    // ------------------------------------------------------------
    public Patient findByNag(int matriculeNag) throws SQLException {
        String sql = "SELECT * FROM Patient WHERE matricule_nag = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, matriculeNag);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // NAG INT : 10 chiffres uniquement, pas de prefixe obligatoire.
    // Plage INT 10 chiffres : 1000000000 .. 2147483647
    // ------------------------------------------------------------
    private int genererNag(Connection c) throws SQLException {
        int minNag = 1_000_000_000;
        int maxNag = Integer.MAX_VALUE;

        String sql = "SELECT MAX(matricule_nag) FROM Patient WHERE matricule_nag >= ?";

        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, minNag);
            try (ResultSet rs = ps.executeQuery()) {
                Integer max = null;
                if (rs.next()) {
                    int v = rs.getInt(1);
                    if (!rs.wasNull()) max = v;
                }
                int prochain = (max == null) ? minNag : max + 1;
                if (prochain > maxNag) {
                    throw new SQLException("Plus de NAG disponible (INT 10 chiffres)");
                }
                return prochain;
            }
        }
    }

    // ------------------------------------------------------------
    // INSERT — NAG généré automatiquement (entier)
    // ------------------------------------------------------------
    public int insert(Patient p) throws SQLException {
        String sql = "INSERT INTO Patient "
                   + "(photo_url, prenom, nom, sex, contact, "
                   + " statut_assure, fonds, matricule_nag, id_assure_principal) "
                   + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {

            int nag = genererNag(c);
            p.matricule_nag = nag;

            ps.setString (1, p.photo_url);
            ps.setString (2, p.prenom);
            ps.setString (3, p.nom);
            ps.setString (4, p.sex);
            ps.setString (5, p.contact);
            ps.setBoolean(6, p.statut_assure);
            ps.setObject (7, p.fonds);
            ps.setInt    (8, nag);
            ps.setObject (9, p.id_assure_principal);

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
        String sql = "UPDATE Patient SET "
                   + "photo_url=?, prenom=?, nom=?, sex=?, contact=?, "
                   + "statut_assure=?, fonds=?, matricule_nag=?, id_assure_principal=? "
                   + "WHERE id_patient=?";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setString (1, p.photo_url);
            ps.setString (2, p.prenom);
            ps.setString (3, p.nom);
            ps.setString (4, p.sex);
            ps.setString (5, p.contact);
            ps.setBoolean(6, p.statut_assure);
            ps.setObject (7, p.fonds);
            ps.setObject (8, p.matricule_nag);
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
        p.id_patient    = rs.getInt("id_patient");
        p.photo_url     = rs.getString("photo_url");
        p.prenom        = rs.getString("prenom");
        p.nom           = rs.getString("nom");
        p.sex           = rs.getString("sex");
        p.contact       = rs.getString("contact");
        p.statut_assure = rs.getBoolean("statut_assure");

        int fonds = rs.getInt("fonds");
        p.fonds = rs.wasNull() ? null : fonds;

        int nag = rs.getInt("matricule_nag");
        p.matricule_nag = rs.wasNull() ? null : nag;

        int assure = rs.getInt("id_assure_principal");
        p.id_assure_principal = rs.wasNull() ? null : assure;

        return p;
    }
}

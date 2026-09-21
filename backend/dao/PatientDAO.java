package dao;

import db.Database;
import model.Patient;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Patient.
 * Gère notamment le niveau de fonds (1-4), l'assuré principal,
 * et le NAG (texte de 10 chiffres, fourni ou généré automatiquement).
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
    // GET /api/patients/nag/{matricule}
    // NAG = NVARCHAR(20), exactement 10 chiffres (CK_Patient_nag_10).
    // ------------------------------------------------------------
    public Patient findByNag(String matriculeNag) throws SQLException {
        String sql = "SELECT * FROM Patient WHERE matricule_nag = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, matriculeNag);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // NAG généré : plus grand NAG numérique existant + 1 (10 chiffres, à partir de 1000000000).
    // ------------------------------------------------------------
    private String genererNag(Connection c) throws SQLException {
        long min = 1_000_000_000L, max = 9_999_999_999L;
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT MAX(CAST(matricule_nag AS BIGINT)) FROM Patient WHERE matricule_nag IS NOT NULL")) {
            long courant = rs.next() ? rs.getLong(1) : 0;
            long prochain = courant < min ? min : courant + 1;
            if (prochain > max) throw new SQLException("Plus de NAG disponible (10 chiffres)");
            return String.valueOf(prochain);
        }
    }

    // ------------------------------------------------------------
    // INSERT — NAG généré automatiquement (entier)
    // ------------------------------------------------------------
    public int insert(Patient p) throws SQLException {
        String sql = "INSERT INTO Patient "
                   + "(photo_url, prenom, nom, sex, contact, adresse, date_naissance, "
                   + " statut_assure, fonds, matricule_nag, id_assure_principal, nature) "
                   + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {

            // NAG fourni (déjà attribué à l'assuré) ou généré
            if (p.matricule_nag == null || p.matricule_nag.isBlank()) p.matricule_nag = genererNag(c);

            ps.setString (1, p.photo_url);
            ps.setString (2, p.prenom);
            ps.setString (3, p.nom);
            ps.setString (4, p.sex);
            ps.setString (5, blankToNull(p.contact));
            ps.setString (6, p.adresse);
            ps.setObject (7, (p.date_naissance != null && !p.date_naissance.isBlank()) ? Date.valueOf(p.date_naissance) : null);
            ps.setBoolean(8, p.statut_assure);
            ps.setObject (9, p.fonds);
            ps.setString (10, p.matricule_nag);
            ps.setObject (11, p.id_assure_principal);
            ps.setString (12, p.nature);

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
                   + "photo_url=?, prenom=?, nom=?, sex=?, contact=?, adresse=?, date_naissance=?, "
                   + "statut_assure=?, fonds=?, matricule_nag=?, id_assure_principal=?, nature=? "
                   + "WHERE id_patient=?";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setString (1, p.photo_url);
            ps.setString (2, p.prenom);
            ps.setString (3, p.nom);
            ps.setString (4, p.sex);
            ps.setString (5, blankToNull(p.contact));
            ps.setString (6, p.adresse);
            ps.setObject (7, (p.date_naissance != null && !p.date_naissance.isBlank()) ? Date.valueOf(p.date_naissance) : null);
            ps.setBoolean(8, p.statut_assure);
            ps.setObject (9, p.fonds);
            ps.setString (10, p.matricule_nag);
            ps.setObject (11, p.id_assure_principal);
            ps.setString (12, p.nature);
            ps.setInt    (13, p.id_patient);

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

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
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
        p.adresse             = rs.getString("adresse");
        Date dateNaissance    = rs.getDate("date_naissance");
        p.date_naissance      = dateNaissance == null ? null : dateNaissance.toString();
        p.statut_assure       = rs.getBoolean("statut_assure");

        int fonds = rs.getInt("fonds");
        p.fonds = rs.wasNull() ? null : fonds;

        p.matricule_nag = rs.getString("matricule_nag");
        p.nature = rs.getString("nature");
        p.nature_assure = Patient.natureCode(p.nature);
        p.statut = p.statut_assure ? "actif" : "suspendu";

        int assure = rs.getInt("id_assure_principal");
        p.id_assure_principal = rs.wasNull() ? null : assure;

        return p;
    }
}

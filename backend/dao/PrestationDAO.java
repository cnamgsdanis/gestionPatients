package dao;

import db.Database;
import model.Prestation;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Prestation.
 * Inclut un JOIN pour récupérer les noms (patient, utilisateur, structure).
 */
public class PrestationDAO {

    // SELECT de base avec les 3 JOIN
    private static final String SELECT_BASE =
        "SELECT p.*, " +
        "  (pa.prenom + ' ' + pa.nom) AS patient_nom, " +
        "  u.nom AS utilisateur_nom, " +
        "  s.raison_sociale AS structure_nom " +
        "FROM Prestation p " +
        "LEFT JOIN Patient     pa ON pa.id_patient     = p.id_patient " +
        "LEFT JOIN Utilisateur u  ON u.id_utilisateur  = p.id_utilisateur " +
        "LEFT JOIN Structure   s  ON s.id_structure    = p.id_structure ";

    // ------------------------------------------------------------
    // Liste avec filtres optionnels :
    //   - id_patient
    //   - id_utilisateur
    //   - id_structure
    //   - type_prestation
    //   - date_debut / date_fin
    // ------------------------------------------------------------
    public List<Prestation> findAll(Integer idPatient, Integer idUtilisateur,
                                    Integer idStructure, String type,
                                    String dateDebut, String dateFin) throws SQLException {

        StringBuilder sql = new StringBuilder(SELECT_BASE);
        List<Object> params = new ArrayList<>();
        List<String> where = new ArrayList<>();

        if (idPatient     != null) { where.add("p.id_patient = ?");      params.add(idPatient); }
        if (idUtilisateur != null) { where.add("p.id_utilisateur = ?");  params.add(idUtilisateur); }
        if (idStructure   != null) { where.add("p.id_structure = ?");    params.add(idStructure); }
        if (type != null && !type.isBlank()) { where.add("p.type_prestation = ?"); params.add(type); }
        if (dateDebut != null && !dateDebut.isBlank()) { where.add("p.date_prs >= ?"); params.add(dateDebut); }
        if (dateFin   != null && !dateFin.isBlank())   { where.add("p.date_prs <= ?"); params.add(dateFin); }

        if (!where.isEmpty()) sql.append("WHERE ").append(String.join(" AND ", where));
        sql.append(" ORDER BY p.date_prs DESC, p.id_prestation DESC");

        List<Prestation> liste = new ArrayList<>();
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql.toString())) {
            for (int i = 0; i < params.size(); i++) ps.setObject(i + 1, params.get(i));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) liste.add(map(rs));
            }
        }
        return liste;
    }

    // ------------------------------------------------------------
    // Recherche par ID
    // ------------------------------------------------------------
    public Prestation findById(int id) throws SQLException {
        String sql = SELECT_BASE + "WHERE p.id_prestation = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // Insertion
    // ------------------------------------------------------------
    public int insert(Prestation p) throws SQLException {
        String sql = "INSERT INTO Prestation " +
                     "(montant, date_prs, type_prestation, id_patient, id_utilisateur, id_structure) " +
                     "VALUES (?, ?, ?, ?, ?, ?)";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setBigDecimal(1, p.montant);
            ps.setString    (2, p.date_prs);
            ps.setString    (3, p.type_prestation);
            ps.setInt       (4, p.id_patient);
            ps.setInt       (5, p.id_utilisateur);
            ps.setInt       (6, p.id_structure);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) p.id_prestation = keys.getInt(1);
            }
        }
        return p.id_prestation;
    }

    // ------------------------------------------------------------
    // Modification
    // ------------------------------------------------------------
    public boolean update(Prestation p) throws SQLException {
        String sql = "UPDATE Prestation SET " +
                     "montant = ?, date_prs = ?, type_prestation = ?, " +
                     "id_patient = ?, id_utilisateur = ?, id_structure = ? " +
                     "WHERE id_prestation = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setBigDecimal(1, p.montant);
            ps.setString    (2, p.date_prs);
            ps.setString    (3, p.type_prestation);
            ps.setInt       (4, p.id_patient);
            ps.setInt       (5, p.id_utilisateur);
            ps.setInt       (6, p.id_structure);
            ps.setInt       (7, p.id_prestation);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // Suppression
    // ------------------------------------------------------------
    public boolean delete(int id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(
                "DELETE FROM Prestation WHERE id_prestation = ?")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // map() : ResultSet -> Prestation
    // ------------------------------------------------------------
    private Prestation map(ResultSet rs) throws SQLException {
        Prestation p = new Prestation();
        p.id_prestation   = rs.getInt("id_prestation");
        p.montant         = rs.getBigDecimal("montant");
        p.date_prs        = rs.getString("date_prs");
        p.type_prestation = rs.getString("type_prestation");
        p.id_patient      = rs.getInt("id_patient");
        p.id_utilisateur  = rs.getInt("id_utilisateur");
        p.id_structure    = rs.getInt("id_structure");

        // Champs du JOIN (tolérés absents selon la requête)
        try { p.patient_nom     = rs.getString("patient_nom"); }     catch (SQLException ignored) {}
        try { p.utilisateur_nom = rs.getString("utilisateur_nom"); } catch (SQLException ignored) {}
        try { p.structure_nom   = rs.getString("structure_nom"); }   catch (SQLException ignored) {}

        return p;
    }
}
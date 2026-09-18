package dao;

import db.Database;
import model.Examen;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Examen.
 */
public class ExamenDAO {

    private static final String SELECT_BASE =
        "SELECT e.*, " +
        "  (p.prenom + ' ' + p.nom) AS patient_nom, " +
        "  pr.type_prestation " +
        "FROM Examen e " +
        "LEFT JOIN Prestation pr ON pr.id_prestation = e.id_prestation " +
        "LEFT JOIN Patient    p  ON p.id_patient       = pr.id_patient ";

    // ------------------------------------------------------------
    // Liste avec filtres optionnels
    // ------------------------------------------------------------
    public List<Examen> findAll(Integer idPrestation, String statut) throws SQLException {

        StringBuilder sql = new StringBuilder(SELECT_BASE);
        List<Object> params = new ArrayList<>();
        List<String> where = new ArrayList<>();

        if (idPrestation != null) { where.add("e.id_prestation = ?"); params.add(idPrestation); }
        if (statut != null && !statut.isBlank()) { where.add("e.statut = ?"); params.add(statut); }

        if (!where.isEmpty()) sql.append("WHERE ").append(String.join(" AND ", where));
        sql.append(" ORDER BY e.date_examen DESC, e.id_examen DESC");

        List<Examen> liste = new ArrayList<>();
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
    public Examen findById(int id) throws SQLException {
        String sql = SELECT_BASE + "WHERE e.id_examen = ?";
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
    public int insert(Examen e) throws SQLException {
        String sql = "INSERT INTO Examen (type_examen, date_examen, statut, id_prestation) " +
                     "VALUES (?, ?, ?, ?)";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, e.type_examen);
            ps.setString(2, e.date_examen);
            ps.setString(3, e.statut);
            ps.setInt   (4, e.id_prestation);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) e.id_examen = keys.getInt(1);
            }
        }
        return e.id_examen;
    }

    // ------------------------------------------------------------
    // Modification
    // ------------------------------------------------------------
    public boolean update(Examen e) throws SQLException {
        String sql = "UPDATE Examen SET type_examen = ?, date_examen = ?, " +
                     "statut = ?, id_prestation = ? WHERE id_examen = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, e.type_examen);
            ps.setString(2, e.date_examen);
            ps.setString(3, e.statut);
            ps.setInt   (4, e.id_prestation);
            ps.setInt   (5, e.id_examen);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // Suppression
    // ------------------------------------------------------------
    public boolean delete(int id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(
                "DELETE FROM Examen WHERE id_examen = ?")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }

    private Examen map(ResultSet rs) throws SQLException {
        Examen e = new Examen();
        e.id_examen     = rs.getInt("id_examen");
        e.type_examen   = rs.getString("type_examen");
        e.date_examen   = rs.getString("date_examen");
        e.statut        = rs.getString("statut");
        e.id_prestation = rs.getInt("id_prestation");
        try { e.patient_nom     = rs.getString("patient_nom"); }     catch (SQLException ignored) {}
        try { e.type_prestation = rs.getString("type_prestation"); } catch (SQLException ignored) {}
        return e;
    }
}
package dao;

import db.Database;
import model.Medicament;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.math.BigDecimal;

public class MedicamentDAO {

    private static final String SELECT_BASE = "SELECT m.*, s.raison_sociale AS structure_nom " +
            "FROM Medicaments m " +
            "LEFT JOIN Structure s ON s.id_structure = m.id_structure ";

    public List<Medicament> findAll() throws SQLException {
        List<Medicament> liste = new ArrayList<>();
        String sql = SELECT_BASE + "ORDER BY m.nom_medicament";
        try (Connection c = Database.getConnection();
                Statement st = c.createStatement();
                ResultSet rs = st.executeQuery(sql)) {
            while (rs.next())
                liste.add(map(rs));
        }
        return liste;
    }

    public List<Medicament> findByIdStructure(int idStructure) throws SQLException {
        List<Medicament> liste = new ArrayList<>();
        String sql = SELECT_BASE + "WHERE m.id_structure = ? ORDER BY m.nom_medicament";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idStructure);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next())
                    liste.add(map(rs));
            }
        }
        return liste;
    }

    public Medicament findById(int id) throws SQLException {
        String sql = SELECT_BASE + "WHERE m.id_medicament = ?";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    public int insert(Medicament m) throws SQLException {
        String sql = "INSERT INTO Medicaments (nom_medicament, dosage, quantite, prix, id_structure) " +
                "VALUES (?, ?, ?, ?, ?)";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, m.nom_medicament);
            ps.setString(2, m.dosage);
            ps.setInt(3, m.quantite);
            ps.setBigDecimal(4, m.prix == null ? java.math.BigDecimal.ZERO : m.prix);
            ps.setInt(5, m.id_structure);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next())
                    m.id_medicament = keys.getInt(1);
            }
        }
        return m.id_medicament;
    }

    public boolean update(Medicament m) throws SQLException {
        String sql = "UPDATE Medicaments SET nom_medicament = ?, dosage = ?, " +
                "quantite = ?, prix = ?, id_structure = ? WHERE id_medicament = ?";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, m.nom_medicament);
            ps.setString(2, m.dosage);
            ps.setInt(3, m.quantite);
            ps.setBigDecimal(4, m.prix == null ? java.math.BigDecimal.ZERO : m.prix);
            ps.setInt(5, m.id_structure);
            ps.setInt(6, m.id_medicament);
            return ps.executeUpdate() > 0;
        }
    }

    public boolean delete(int id) throws SQLException {
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "DELETE FROM Medicaments WHERE id_medicament = ?")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // Décrémente le stock après délivrance d'une ordonnance.
    // ------------------------------------------------------------
    public boolean decrementerStock(int idMedicament, int quantite) throws SQLException {
        String sql = "UPDATE Medicaments SET quantite = quantite - ? " +
                "WHERE id_medicament = ? AND quantite >= ?";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, quantite);
            ps.setInt(2, idMedicament);
            ps.setInt(3, quantite);
            return ps.executeUpdate() > 0;
        }
    }

    private Medicament map(ResultSet rs) throws SQLException {
        Medicament m = new Medicament();
        m.id_medicament = rs.getInt("id_medicament");
        m.nom_medicament = rs.getString("nom_medicament");
        m.dosage = rs.getString("dosage");
        m.quantite = rs.getInt("quantite");
        m.prix = rs.getBigDecimal("prix");
        m.id_structure = rs.getInt("id_structure");
        try {
            m.structure_nom = rs.getString("structure_nom");
        } catch (SQLException ignored) {
        }
        return m;
    }

    /** Renvoie le prix unitaire d'un médicament (ou ZERO s'il n'existe pas). */
    public java.math.BigDecimal getPrix(int idMedicament) throws SQLException {
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT prix FROM Medicaments WHERE id_medicament = ?")) {
            ps.setInt(1, idMedicament);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    java.math.BigDecimal p = rs.getBigDecimal("prix");
                    return p == null ? java.math.BigDecimal.ZERO : p;
                }
            }
        }
        return java.math.BigDecimal.ZERO;
    }
}
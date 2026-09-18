package dao;

import db.Database;
import model.Structure;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Structure (hôpitaux et pharmacies).
 */
public class StructureDAO {

    // ------------------------------------------------------------
    // SELECT * FROM Structure
    // Liste toutes les structures.
    // ------------------------------------------------------------
    public List<Structure> findAll() throws SQLException {
        List<Structure> liste = new ArrayList<>();
        String sql = "SELECT * FROM Structure ORDER BY raison_sociale";
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) liste.add(map(rs));
        }
        return liste;
    }

    // ------------------------------------------------------------
    // SELECT * FROM Structure WHERE id_structure = ?
    // ------------------------------------------------------------
    public Structure findById(int id) throws SQLException {
        String sql = "SELECT * FROM Structure WHERE id_structure = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // SELECT * FROM Structure WHERE raison_sociale LIKE ?
    // Recherche par nom (recherche partielle).
    // ------------------------------------------------------------
    public List<Structure> findByRaisonSociale(String raison) throws SQLException {
        List<Structure> liste = new ArrayList<>();
        String sql = "SELECT * FROM Structure WHERE raison_sociale LIKE ? ORDER BY raison_sociale";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, "%" + raison + "%");
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) liste.add(map(rs));
            }
        }
        return liste;
    }

    // ------------------------------------------------------------
    // SELECT * FROM Structure WHERE type_structure = ?
    // Filtre par type : 'hopital' ou 'pharmacie'.
    // ------------------------------------------------------------
    public List<Structure> findByType(String type) throws SQLException {
        List<Structure> liste = new ArrayList<>();
        String sql = "SELECT * FROM Structure WHERE type_structure = ? ORDER BY raison_sociale";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, type);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) liste.add(map(rs));
            }
        }
        return liste;
    }

    // ------------------------------------------------------------
    // INSERT INTO Structure ...
    // ------------------------------------------------------------
    public int insert(Structure s) throws SQLException {
        String sql = "INSERT INTO Structure (raison_sociale, addresse, type_structure) " +
                     "VALUES (?, ?, ?)";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, s.raison_sociale);
            ps.setString(2, s.addresse);
            ps.setString(3, s.type_structure);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) s.id_structure = keys.getInt(1);
            }
        }
        return s.id_structure;
    }

    // ------------------------------------------------------------
    // UPDATE Structure SET ... WHERE id_structure = ?
    // ------------------------------------------------------------
    public boolean update(Structure s) throws SQLException {
        String sql = "UPDATE Structure SET raison_sociale = ?, addresse = ?, type_structure = ? " +
                     "WHERE id_structure = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, s.raison_sociale);
            ps.setString(2, s.addresse);
            ps.setString(3, s.type_structure);
            ps.setInt   (4, s.id_structure);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // DELETE FROM Structure WHERE id_structure = ?
    //  Peut échouer si des utilisateurs/medicaments y sont rattachés (FK).
    // ------------------------------------------------------------
    public boolean delete(int id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(
                "DELETE FROM Structure WHERE id_structure = ?")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // map() : ResultSet -> Structure
    // ------------------------------------------------------------
    private Structure map(ResultSet rs) throws SQLException {
        Structure s = new Structure();
        s.id_structure   = rs.getInt("id_structure");
        s.raison_sociale = rs.getString("raison_sociale");
        s.addresse       = rs.getString("addresse");
        s.type_structure = rs.getString("type_structure");
        return s;
    }
}
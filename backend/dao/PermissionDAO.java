package dao;

import db.Database;
import model.Permission;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour les permissions et la table de liaison RolePermission.
 */
public class PermissionDAO {

    // ------------------------------------------------------------
    // Liste TOUTES les permissions existantes
    // ------------------------------------------------------------
    public List<Permission> findAll() throws SQLException {
        List<Permission> liste = new ArrayList<>();
        String sql = "SELECT * FROM Permission ORDER BY code";
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) liste.add(map(rs));
        }
        return liste;
    }

    // ------------------------------------------------------------
    // Renvoie les CODES de toutes les permissions d'un rôle.
    // Utilisé pour construire le cache en mémoire.
    // ------------------------------------------------------------
    public List<String> findCodesByRole(String role) throws SQLException {
        List<String> codes = new ArrayList<>();
        String sql = "SELECT p.code " +
                     "FROM RolePermission rp " +
                     "JOIN Permission p ON p.id_permission = rp.id_permission " +
                     "WHERE rp.role = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, role);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) codes.add(rs.getString("code"));
            }
        }
        return codes;
    }

    // ------------------------------------------------------------
    // Cherche une permission par son code.
    // ------------------------------------------------------------
    public Permission findByCode(String code) throws SQLException {
        String sql = "SELECT * FROM Permission WHERE code = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, code);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // Ajoute une permission à un rôle.
    // ------------------------------------------------------------
    public boolean addToRole(String role, int idPermission) throws SQLException {
        String sql = "INSERT INTO RolePermission (role, id_permission) VALUES (?, ?)";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, role);
            ps.setInt   (2, idPermission);
            return ps.executeUpdate() > 0;
        } catch (SQLIntegrityConstraintViolationException e) {
            // Déjà existant → on considère que c'est OK
            return true;
        }
    }

    // ------------------------------------------------------------
    // Retire une permission à un rôle.
    // ------------------------------------------------------------
    public boolean removeFromRole(String role, int idPermission) throws SQLException {
        String sql = "DELETE FROM RolePermission WHERE role = ? AND id_permission = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, role);
            ps.setInt   (2, idPermission);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // map() : ResultSet -> Permission
    // ------------------------------------------------------------
    private Permission map(ResultSet rs) throws SQLException {
        Permission p = new Permission();
        p.id_permission = rs.getInt("id_permission");
        p.code          = rs.getString("code");
        p.description   = rs.getString("description");
        return p;
    }
}
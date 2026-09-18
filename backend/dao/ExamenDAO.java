package dao;

import db.Database;
import model.Examen;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Examen (composée de Prestation + Examen, voir
 * model.Examen). Volontairement pas de méthode delete() : un examen ne peut
 * être que créé, lu ou modifié (voir la spécification du module Dossier
 * Patient — pas de suppression).
 */
public class ExamenDAO {

    private static final String SELECT_BASE =
        "SELECT p.id_prestation, p.montant, p.id_patient, p.id_utilisateur, p.id_structure, " +
        "       e.id_examen, e.type_examen, e.date_examen, e.statut, " +
        "       u.nom AS medecin_nom " +
        "FROM Prestation p " +
        "JOIN Examen e ON e.id_prestation = p.id_prestation " +
        "JOIN Utilisateur u ON u.id_utilisateur = p.id_utilisateur " +
        "WHERE p.type_prestation = 'examen' ";

    public List<Examen> findAllByPatient(int idPatient) throws SQLException {
        List<Examen> liste = new ArrayList<>();
        String sql = SELECT_BASE + "AND p.id_patient = ? ORDER BY e.date_examen DESC, e.id_examen DESC";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idPatient);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) liste.add(map(rs));
            }
        }
        return liste;
    }

    public Examen findById(int idExamen) throws SQLException {
        String sql = SELECT_BASE + "AND e.id_examen = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idExamen);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // Création : insère la Prestation puis l'Examen lié, dans une même
    // transaction (les deux lignes ou aucune).
    // ------------------------------------------------------------
    public Examen insert(Examen ex) throws SQLException {
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                String sqlP = "INSERT INTO Prestation (montant, date_prs, type_prestation, id_patient, id_utilisateur, id_structure) " +
                              "VALUES (?, ?, 'examen', ?, ?, ?)";
                try (PreparedStatement ps = c.prepareStatement(sqlP, Statement.RETURN_GENERATED_KEYS)) {
                    ps.setDouble(1, ex.montant);
                    ps.setDate(2, Date.valueOf(ex.date_examen));
                    ps.setInt(3, ex.id_patient);
                    ps.setInt(4, ex.id_medecin);
                    ps.setInt(5, ex.id_structure);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) ex.id_prestation = keys.getInt(1);
                    }
                }

                String sqlE = "INSERT INTO Examen (type_examen, date_examen, statut, id_prestation) VALUES (?, ?, ?, ?)";
                try (PreparedStatement ps = c.prepareStatement(sqlE, Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, ex.type_examen);
                    ps.setDate(2, Date.valueOf(ex.date_examen));
                    ps.setString(3, ex.statut);
                    ps.setInt(4, ex.id_prestation);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) ex.id_examen = keys.getInt(1);
                    }
                }

                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        }
        return ex;
    }

    // ------------------------------------------------------------
    // Modification : met à jour la Prestation puis l'Examen lié.
    // Le médecin, le patient et le type de prestation ne sont pas modifiables
    // ici (un examen reste rattaché à son auteur et à son patient).
    // ------------------------------------------------------------
    public boolean update(Examen ex) throws SQLException {
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            boolean ok;
            try {
                String sqlP = "UPDATE Prestation SET montant = ? WHERE id_prestation = ?";
                try (PreparedStatement ps = c.prepareStatement(sqlP)) {
                    ps.setDouble(1, ex.montant);
                    ps.setInt(2, ex.id_prestation);
                    ok = ps.executeUpdate() > 0;
                }

                String sqlE = "UPDATE Examen SET type_examen = ?, date_examen = ?, statut = ? WHERE id_examen = ?";
                try (PreparedStatement ps = c.prepareStatement(sqlE)) {
                    ps.setString(1, ex.type_examen);
                    ps.setDate(2, Date.valueOf(ex.date_examen));
                    ps.setString(3, ex.statut);
                    ps.setInt(4, ex.id_examen);
                    ok = ps.executeUpdate() > 0 && ok;
                }

                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
            return ok;
        }
    }

    private Examen map(ResultSet rs) throws SQLException {
        Examen ex = new Examen();
        ex.id_examen     = rs.getInt("id_examen");
        ex.id_prestation = rs.getInt("id_prestation");
        ex.id_patient     = rs.getInt("id_patient");
        ex.id_medecin     = rs.getInt("id_utilisateur");
        ex.id_structure   = rs.getInt("id_structure");
        ex.montant        = rs.getDouble("montant");
        ex.date_examen     = rs.getDate("date_examen").toString();
        ex.type_examen     = rs.getString("type_examen");
        ex.statut          = rs.getString("statut");
        ex.medecin_nom     = rs.getString("medecin_nom");
        return ex;
    }
}

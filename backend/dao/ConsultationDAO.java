package dao;

import db.Database;
import model.Consultation;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Consultation (composée de Prestation + Prise_en_charge,
 * voir model.Consultation). Volontairement pas de méthode delete() : une
 * consultation ne peut être que créée, lue ou modifiée (voir la spécification
 * du module Dossier Patient — pas de suppression).
 */
public class ConsultationDAO {

    private static final String SELECT_BASE =
        "SELECT p.id_prestation, p.montant, p.date_prs, p.id_patient, p.id_utilisateur, p.id_structure, " +
        "       pec.id_pec, pec.montant_pec, pec.numero_de_feuille, pec.type_feuille, pec.statut, " +
        "       u.nom AS medecin_nom " +
        "FROM Prestation p " +
        "JOIN Prise_en_charge pec ON pec.id_prestation = p.id_prestation " +
        "JOIN Utilisateur u ON u.id_utilisateur = p.id_utilisateur " +
        "WHERE p.type_prestation = 'consultation' ";

    public List<Consultation> findAllByPatient(int idPatient) throws SQLException {
        List<Consultation> liste = new ArrayList<>();
        String sql = SELECT_BASE + "AND p.id_patient = ? ORDER BY p.date_prs DESC, p.id_prestation DESC";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idPatient);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) liste.add(map(rs));
            }
        }
        return liste;
    }

    public Consultation findById(int idPrestation) throws SQLException {
        String sql = SELECT_BASE + "AND p.id_prestation = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idPrestation);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // Création : insère la Prestation puis la Prise_en_charge liée,
    // dans une même transaction (les deux lignes ou aucune).
    // ------------------------------------------------------------
    public Consultation insert(Consultation cons) throws SQLException {
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                String sqlP = "INSERT INTO Prestation (montant, date_prs, type_prestation, id_patient, id_utilisateur, id_structure) " +
                              "VALUES (?, ?, 'consultation', ?, ?, ?)";
                try (PreparedStatement ps = c.prepareStatement(sqlP, Statement.RETURN_GENERATED_KEYS)) {
                    ps.setDouble(1, cons.montant);
                    ps.setDate(2, Date.valueOf(cons.date));
                    ps.setInt(3, cons.id_patient);
                    ps.setInt(4, cons.id_medecin);
                    ps.setInt(5, cons.id_structure);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) cons.id_prestation = keys.getInt(1);
                    }
                }

                String sqlPec = "INSERT INTO Prise_en_charge (montant_pec, date_pec, numero_de_feuille, type_feuille, id_acteur, statut, id_prestation) " +
                                "VALUES (?, ?, ?, ?, ?, ?, ?)";
                try (PreparedStatement ps = c.prepareStatement(sqlPec, Statement.RETURN_GENERATED_KEYS)) {
                    ps.setDouble(1, cons.montant_pec);
                    ps.setDate(2, Date.valueOf(cons.date));
                    ps.setString(3, cons.numero_de_feuille);
                    ps.setString(4, cons.type_feuille);
                    ps.setInt(5, cons.id_medecin);
                    ps.setString(6, cons.statut);
                    ps.setInt(7, cons.id_prestation);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) cons.id_pec = keys.getInt(1);
                    }
                }

                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        }
        return cons;
    }

    // ------------------------------------------------------------
    // Modification : met à jour la Prestation puis la Prise_en_charge liée.
    // Le médecin, le patient et le type de prestation ne sont pas modifiables
    // ici (une consultation reste rattachée à son auteur et à son patient).
    // ------------------------------------------------------------
    public boolean update(Consultation cons) throws SQLException {
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            boolean ok;
            try {
                String sqlP = "UPDATE Prestation SET montant = ?, date_prs = ? WHERE id_prestation = ?";
                try (PreparedStatement ps = c.prepareStatement(sqlP)) {
                    ps.setDouble(1, cons.montant);
                    ps.setDate(2, Date.valueOf(cons.date));
                    ps.setInt(3, cons.id_prestation);
                    ok = ps.executeUpdate() > 0;
                }

                String sqlPec = "UPDATE Prise_en_charge SET montant_pec = ?, date_pec = ?, numero_de_feuille = ?, type_feuille = ?, statut = ? WHERE id_prestation = ?";
                try (PreparedStatement ps = c.prepareStatement(sqlPec)) {
                    ps.setDouble(1, cons.montant_pec);
                    ps.setDate(2, Date.valueOf(cons.date));
                    ps.setString(3, cons.numero_de_feuille);
                    ps.setString(4, cons.type_feuille);
                    ps.setString(5, cons.statut);
                    ps.setInt(6, cons.id_prestation);
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

    private Consultation map(ResultSet rs) throws SQLException {
        Consultation cons = new Consultation();
        cons.id_prestation    = rs.getInt("id_prestation");
        cons.montant          = rs.getDouble("montant");
        cons.date             = rs.getDate("date_prs").toString();
        cons.id_patient       = rs.getInt("id_patient");
        cons.id_medecin       = rs.getInt("id_utilisateur");
        cons.id_structure     = rs.getInt("id_structure");
        cons.id_pec           = rs.getInt("id_pec");
        cons.montant_pec      = rs.getDouble("montant_pec");
        cons.numero_de_feuille = rs.getString("numero_de_feuille");
        cons.type_feuille     = rs.getString("type_feuille");
        cons.statut           = rs.getString("statut");
        cons.medecin_nom      = rs.getString("medecin_nom");
        return cons;
    }
}

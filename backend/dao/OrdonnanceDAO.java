package dao;

import db.Database;
import model.Ordonnance;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO pour l'entité Ordonnance.
 */
public class OrdonnanceDAO {

    // SELECT avec JOIN pour récupérer patient_nom et medecin_nom
    private static final String SELECT_BASE = "SELECT o.*, " +
            "  (p.prenom + ' ' + p.nom) AS patient_nom, " +
            "  u.nom AS medecin_nom " +
            "FROM Ordonnance o " +
            "LEFT JOIN Prestation pr ON pr.id_prestation = o.id_prestation " +
            "LEFT JOIN Patient    p  ON p.id_patient       = pr.id_patient " +
            "LEFT JOIN Utilisateur u ON u.id_utilisateur   = o.id_utilisateur ";

    // ------------------------------------------------------------
    // Liste avec filtres optionnels.
    // ------------------------------------------------------------
    public List<Ordonnance> findAll(Integer idPatient, Integer idMedecin, String statut) throws SQLException {

        StringBuilder sql = new StringBuilder(SELECT_BASE);
        List<Object> params = new ArrayList<>();
        List<String> where = new ArrayList<>();

        if (idPatient != null) {
            where.add("pr.id_patient = ?");
            params.add(idPatient);
        }
        if (idMedecin != null) {
            where.add("o.id_utilisateur = ?");
            params.add(idMedecin);
        }
        if (statut != null && !statut.isBlank()) {
            where.add("o.statut = ?");
            params.add(statut);
        }

        if (!where.isEmpty())
            sql.append("WHERE ").append(String.join(" AND ", where));
        sql.append(" ORDER BY o.date_ordonnance DESC, o.id_ordonnance DESC");

        List<Ordonnance> liste = new ArrayList<>();
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql.toString())) {
            for (int i = 0; i < params.size(); i++)
                ps.setObject(i + 1, params.get(i));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next())
                    liste.add(map(rs));
            }
        }
        return liste;
    }

    // ------------------------------------------------------------
    // Recherche par ID
    // ------------------------------------------------------------
    public Ordonnance findById(int id) throws SQLException {
        String sql = SELECT_BASE + "WHERE o.id_ordonnance = ?";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // Recherche par code de retrait
    // ------------------------------------------------------------
    public Ordonnance findByCodeRetrait(String code) throws SQLException {
        String sql = SELECT_BASE + "WHERE o.code_retrait = ?";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, code);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // Insertion
    // ------------------------------------------------------------
    public int insert(Ordonnance o) throws SQLException {
        String sql = "INSERT INTO Ordonnance " +
                "(date_ordonnance, statut, signature_medecin, cachet_medecin, " +
                " signature_patient, code_retrait, id_prestation, id_utilisateur) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, o.date_ordonnance);
            ps.setString(2, o.statut);
            ps.setString(3, o.signature_medecin);
            ps.setString(4, o.cachet_medecin);
            ps.setString(5, o.signature_patient);
            ps.setString(6, o.code_retrait);
            ps.setInt(7, o.id_prestation);
            ps.setInt(8, o.id_utilisateur);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next())
                    o.id_ordonnance = keys.getInt(1);
            }
        }
        return o.id_ordonnance;
    }

    // ------------------------------------------------------------
    // Modification complète
    // ------------------------------------------------------------
    public boolean update(Ordonnance o) throws SQLException {
        String sql = "UPDATE Ordonnance SET " +
                "date_ordonnance = ?, statut = ?, signature_medecin = ?, " +
                "cachet_medecin = ?, signature_patient = ?, code_retrait = ?, " +
                "id_prestation = ?, id_utilisateur = ? " +
                "WHERE id_ordonnance = ?";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, o.date_ordonnance);
            ps.setString(2, o.statut);
            ps.setString(3, o.signature_medecin);
            ps.setString(4, o.cachet_medecin);
            ps.setString(5, o.signature_patient);
            ps.setString(6, o.code_retrait);
            ps.setInt(7, o.id_prestation);
            ps.setInt(8, o.id_utilisateur);
            ps.setInt(9, o.id_ordonnance);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // Mise à jour d'un champ unique (utilisé par signer/cachet/delivrer)
    // ------------------------------------------------------------
    public boolean updateChamp(int id, String colonne, String valeur) throws SQLException {

        // Liste blanche pour éviter l'injection SQL
        List<String> autorisees = List.of(
                "statut", "signature_medecin", "cachet_medecin",
                "signature_patient", "code_retrait");
        if (!autorisees.contains(colonne)) {
            throw new IllegalArgumentException("Colonne non autorisee : " + colonne);
        }

        String sql = "UPDATE Ordonnance SET " + colonne + " = ? WHERE id_ordonnance = ?";
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, valeur);
            ps.setInt(2, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // Suppression (physique)
    // ------------------------------------------------------------
    public boolean delete(int id) throws SQLException {
        try (Connection c = Database.getConnection();
                PreparedStatement ps = c.prepareStatement(
                        "DELETE FROM Ordonnance WHERE id_ordonnance = ?")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ============================================================
    // Insère l'ordonnance ET ses médicaments dans UNE SEULE TRANSACTION.
    // Si une étape échoue, tout est annulé (rollback).
    // ============================================================
    public int insertAvecMedicaments(Ordonnance o) throws SQLException {

        String sqlOrd = "INSERT INTO Ordonnance " +
                "(date_ordonnance, statut, signature_medecin, cachet_medecin, " +
                " signature_patient, code_retrait, id_prestation, id_utilisateur) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

        String sqlPresc = "INSERT INTO Prescription " +
                "(id_ordonnance, id_medicament, posologie, quantite_prescrite) " +
                "VALUES (?, ?, ?, ?)";

        Connection c = null;

        try {
            c = Database.getConnection();
            c.setAutoCommit(false); // Désactive l'auto-commit

            // 1. Insérer l'ordonnance
            int idOrdonnance;
            try (PreparedStatement ps = c.prepareStatement(sqlOrd, Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, o.date_ordonnance);
                ps.setString(2, o.statut);
                ps.setString(3, o.signature_medecin);
                ps.setString(4, o.cachet_medecin);
                ps.setString(5, o.signature_patient);
                ps.setString(6, o.code_retrait);
                ps.setInt(7, o.id_prestation);
                ps.setInt(8, o.id_utilisateur);
                ps.executeUpdate();

                try (ResultSet keys = ps.getGeneratedKeys()) {
                    keys.next();
                    idOrdonnance = keys.getInt(1);
                }
            }
            o.id_ordonnance = idOrdonnance;

            // 2. Insérer les médicaments (si fournis)
            if (o.medicaments != null && !o.medicaments.isEmpty()) {
                try (PreparedStatement ps = c.prepareStatement(sqlPresc)) {
                    for (model.Prescription p : o.medicaments) {
                        if (p.id_medicament <= 0)
                            continue;

                        ps.setInt(1, idOrdonnance);
                        ps.setInt(2, p.id_medicament);
                        ps.setString(3, p.posologie);
                        ps.setInt(4, p.quantite_prescrite > 0 ? p.quantite_prescrite : 1);
                        ps.addBatch();
                    }
                    ps.executeBatch();
                }
            }

            // 3. Commit : tout est validé en une seule fois
            c.commit();
            return idOrdonnance;

        } catch (SQLException e) {
            // En cas d'erreur, on annule TOUT
            if (c != null) {
                try {
                    c.rollback();
                } catch (SQLException ignored) {
                }
            }
            throw e;

        } finally {
            if (c != null) {
                try {
                    c.setAutoCommit(true);
                    c.close();
                } catch (SQLException ignored) {
                }
            }
        }
    }

    // ------------------------------------------------------------
    // map() : ResultSet -> Ordonnance
    // ------------------------------------------------------------
    private Ordonnance map(ResultSet rs) throws SQLException {
        Ordonnance o = new Ordonnance();
        o.id_ordonnance = rs.getInt("id_ordonnance");
        o.date_ordonnance = rs.getString("date_ordonnance");
        o.statut = rs.getString("statut");
        o.signature_medecin = rs.getString("signature_medecin");
        o.cachet_medecin = rs.getString("cachet_medecin");
        o.signature_patient = rs.getString("signature_patient");
        o.code_retrait = rs.getString("code_retrait");
        o.id_prestation = rs.getInt("id_prestation");
        o.id_utilisateur = rs.getInt("id_utilisateur");

        // Champs d'affichage (peuvent être null si pas de JOIN)
        try {
            o.patient_nom = rs.getString("patient_nom");
        } catch (SQLException ignored) {
        }
        try {
            o.medecin_nom = rs.getString("medecin_nom");
        } catch (SQLException ignored) {
        }
        int idPharma = rs.getInt("id_prestation_pharmacie");
        o.id_prestation_pharmacie = rs.wasNull() ? null : idPharma;
        return o;
    }
}
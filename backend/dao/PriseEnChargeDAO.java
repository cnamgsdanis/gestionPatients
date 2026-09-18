package dao;

import db.Database;
import model.PriseEnCharge;

import java.sql.*;

/**
 * DAO pour l'entité PriseEnCharge (PEC).
 */
public class PriseEnChargeDAO {

    public PriseEnCharge findByPrestation(int idPrestation) throws SQLException {
        String sql = "SELECT * FROM Prise_en_charge WHERE id_prestation = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idPrestation);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    public PriseEnCharge findById(int id) throws SQLException {
        String sql = "SELECT * FROM Prise_en_charge WHERE id_pec = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    public int insert(PriseEnCharge p) throws SQLException {
        String sql = "INSERT INTO Prise_en_charge " +
                     "(montant_pec, date_pec, numero_de_feuille, type_feuille, " +
                     " id_acteur, statut, id_prestation) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?)";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setBigDecimal(1, p.montant_pec);
            ps.setString    (2, p.date_pec);
            ps.setString    (3, p.numero_de_feuille);
            ps.setString    (4, p.type_feuille);
            ps.setInt       (5, p.id_acteur);
            ps.setString    (6, p.statut);
            ps.setInt       (7, p.id_prestation);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) p.id_pec = keys.getInt(1);
            }
        }
        return p.id_pec;
    }

    public boolean updateStatut(int idPec, String statut) throws SQLException {
        String sql = "UPDATE Prise_en_charge SET statut = ? WHERE id_pec = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, statut);
            ps.setInt   (2, idPec);
            return ps.executeUpdate() > 0;
        }
    }

    public boolean delete(int id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(
                "DELETE FROM Prise_en_charge WHERE id_pec = ?")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }


    // ------------------------------------------------------------
// Liste avec filtres optionnels
// ------------------------------------------------------------
public java.util.List<PriseEnCharge> findAll(String statut, Integer idPrestation) throws SQLException {

    StringBuilder sql = new StringBuilder(
        "SELECT pec.*, " +
        "  (pa.prenom + ' ' + pa.nom) AS patient_nom, " +
        "  u.nom AS acteur_nom, " +
        "  pr.montant AS montant_prestation " +
        "FROM Prise_en_charge pec " +
        "LEFT JOIN Prestation  pr ON pr.id_prestation  = pec.id_prestation " +
        "LEFT JOIN Patient     pa ON pa.id_patient     = pr.id_patient " +
        "LEFT JOIN Utilisateur u  ON u.id_utilisateur  = pec.id_acteur "
    );
    java.util.List<Object> params = new java.util.ArrayList<>();
    java.util.List<String> where = new java.util.ArrayList<>();

    if (statut != null && !statut.isBlank()) { where.add("pec.statut = ?"); params.add(statut); }
    if (idPrestation != null) { where.add("pec.id_prestation = ?"); params.add(idPrestation); }

    if (!where.isEmpty()) sql.append("WHERE ").append(String.join(" AND ", where));
    sql.append(" ORDER BY pec.date_pec DESC, pec.id_pec DESC");

    java.util.List<PriseEnCharge> liste = new java.util.ArrayList<>();
    try (Connection c = Database.getConnection();
         PreparedStatement ps = c.prepareStatement(sql.toString())) {
        for (int i = 0; i < params.size(); i++) ps.setObject(i + 1, params.get(i));
        try (ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                PriseEnCharge p = map(rs);
                try {
                    p.patient_nom = rs.getString("patient_nom");
                    p.acteur_nom  = rs.getString("acteur_nom");
                    java.math.BigDecimal mp = rs.getBigDecimal("montant_prestation");
                    if (mp != null) p.part_patient = mp.subtract(p.montant_pec);
                } catch (SQLException ignored) {}
                liste.add(p);
            }
        }
    }
    return liste;
}

    private PriseEnCharge map(ResultSet rs) throws SQLException {
        PriseEnCharge p = new PriseEnCharge();
        p.id_pec             = rs.getInt("id_pec");
        p.montant_pec        = rs.getBigDecimal("montant_pec");
        p.date_pec           = rs.getString("date_pec");
        p.numero_de_feuille  = rs.getString("numero_de_feuille");
        p.type_feuille       = rs.getString("type_feuille");
        p.id_acteur          = rs.getInt("id_acteur");
        p.statut             = rs.getString("statut");
        p.id_prestation      = rs.getInt("id_prestation");
        return p;
    }
}
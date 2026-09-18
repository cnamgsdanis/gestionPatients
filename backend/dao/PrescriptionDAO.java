package dao;

import db.Database;
import model.Prescription;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class PrescriptionDAO {

    /** Liste les prescriptions d'une ordonnance AVEC info médicament + stock. */
    public List<Prescription> findByOrdonnance(int idOrdonnance) throws SQLException {
        List<Prescription> liste = new ArrayList<>();
        String sql =
            "SELECT p.*, m.nom_medicament, m.dosage, m.prix, m.quantite AS stock_disponible " +
            "FROM Prescription p " +
            "JOIN Medicaments m ON m.id_medicament = p.id_medicament " +
            "WHERE p.id_ordonnance = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idOrdonnance);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) liste.add(map(rs));
            }
        }
        return liste;
    }

    /** Ajoute ou met à jour une ligne de prescription. */
    public void upsert(Prescription p) throws SQLException {
        String sql = "MERGE Prescription AS target " +
                     "USING (SELECT ? AS id_ordonnance, ? AS id_medicament) AS src " +
                     "ON target.id_ordonnance = src.id_ordonnance " +
                     " AND target.id_medicament = src.id_medicament " +
                     "WHEN MATCHED THEN UPDATE SET " +
                     "  posologie = ?, quantite_prescrite = ? " +
                     "WHEN NOT MATCHED THEN INSERT " +
                     "  (id_ordonnance, id_medicament, posologie, quantite_prescrite, statut_delivrance) " +
                     "  VALUES (?, ?, ?, ?, 'en_attente');";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt   (1, p.id_ordonnance);
            ps.setInt   (2, p.id_medicament);
            ps.setString(3, p.posologie);
            ps.setInt   (4, p.quantite_prescrite);
            ps.setInt   (5, p.id_ordonnance);
            ps.setInt   (6, p.id_medicament);
            ps.setString(7, p.posologie);
            ps.setInt   (8, p.quantite_prescrite);
            ps.executeUpdate();
        }
    }

    /**  Marque un médicament comme délivré (total ou partiel). */
    public void marquerDelivre(int idOrdonnance, int idMedicament,
                               int quantiteDelivree, String statut) throws SQLException {
        String sql = "UPDATE Prescription SET quantite_delivree = ?, statut_delivrance = ? " +
                     "WHERE id_ordonnance = ? AND id_medicament = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt   (1, quantiteDelivree);
            ps.setString(2, statut);
            ps.setInt   (3, idOrdonnance);
            ps.setInt   (4, idMedicament);
            ps.executeUpdate();
        }
    }

    public boolean delete(int idOrdonnance, int idMedicament) throws SQLException {
        String sql = "DELETE FROM Prescription WHERE id_ordonnance = ? AND id_medicament = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idOrdonnance);
            ps.setInt(2, idMedicament);
            return ps.executeUpdate() > 0;
        }
    }

    private Prescription map(ResultSet rs) throws SQLException {
        Prescription p = new Prescription();
        p.id_ordonnance     = rs.getInt("id_ordonnance");
        p.id_medicament     = rs.getInt("id_medicament");
        p.posologie         = rs.getString("posologie");
        p.quantite_prescrite = rs.getInt("quantite_prescrite");

        //  Colonnes nullables
        int qd = rs.getInt("quantite_delivree");
        p.quantite_delivree = rs.wasNull() ? null : qd;
        p.statut_delivrance = rs.getString("statut_delivrance");

        // Champs du JOIN
        p.nom_medicament   = rs.getString("nom_medicament");
        p.dosage           = rs.getString("dosage");
        p.prix_unitaire    = rs.getBigDecimal("prix");
        p.stock_disponible = rs.getInt("stock_disponible");
        return p;
    }
}
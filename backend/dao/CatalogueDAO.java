package dao;

import db.Database;

import java.math.BigDecimal;
import java.sql.*;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Catalogue des médicaments (désignations + prix de référence) proposé aux médecins.
 * Sources : table Catalogue_medicament + désignations présentes dans le stock des pharmacies (Medicaments).
 */
public class CatalogueDAO {

    /** Catalogue actif = Catalogue_medicament + stock des pharmacies (sans doublon). */
    public List<Map<String, Object>> liste() throws SQLException {
        String sql =
            "SELECT id_catalogue, designation, prix_reference FROM Catalogue_medicament WHERE actif = 1 " +
            "UNION ALL " +
            "SELECT NULL, d.designation, d.prix FROM (" +
            "  SELECT LTRIM(RTRIM(nom_medicament + ISNULL(' ' + dosage, ''))) AS designation, MIN(prix) AS prix FROM Medicaments GROUP BY LTRIM(RTRIM(nom_medicament + ISNULL(' ' + dosage, '')))" +
            ") d WHERE d.designation NOT IN (SELECT designation FROM Catalogue_medicament) " +
            "ORDER BY 2";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = Database.getConnection(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                Map<String, Object> m = new LinkedHashMap<>();
                int id = rs.getInt(1);
                m.put("id_catalogue", rs.wasNull() ? null : id);
                m.put("designation", rs.getString(2));
                m.put("prix_reference", rs.getBigDecimal(3));
                out.add(m);
            }
        }
        return out;
    }

    /** Prix de référence d'une désignation, ou null si inconnue. */
    public BigDecimal prixReference(String designation) throws SQLException {
        if (designation == null) return null;
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT prix_reference FROM Catalogue_medicament WHERE designation = ? AND actif = 1")) {
            ps.setString(1, designation.trim());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getBigDecimal(1) : null;
            }
        }
    }

    public int inserer(String designation, BigDecimal prix) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("INSERT INTO Catalogue_medicament (designation, prix_reference) VALUES (?, ?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, designation.trim());
            ps.setBigDecimal(2, prix);
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                return k.next() ? k.getInt(1) : 0;
            }
        }
    }

    public boolean modifier(int id, String designation, BigDecimal prix) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE Catalogue_medicament SET designation = ?, prix_reference = ?, actif = 1 WHERE id_catalogue = ?")) {
            ps.setString(1, designation.trim());
            ps.setBigDecimal(2, prix);
            ps.setInt(3, id);
            return ps.executeUpdate() > 0;
        }
    }

    /** Retire du catalogue (actif = 0) : les anciennes ordonnances gardent leur désignation. */
    public boolean retirer(int id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE Catalogue_medicament SET actif = 0 WHERE id_catalogue = ?")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }
}

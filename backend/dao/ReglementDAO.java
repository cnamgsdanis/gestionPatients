package dao;

import db.Database;

import java.math.BigDecimal;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Accès à Reglement (paiements et avances aux hôpitaux et pharmacies) et calcul des montants dus.
 */
public class ReglementDAO {

    public List<Map<String, Object>> lister() throws SQLException {
        String sql = "SELECT id_reglement, kind, structure_nom, montant, type_reglement, note, date_reglement FROM Reglement ORDER BY id_reglement DESC";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = Database.getConnection(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) out.add(map(rs));
        }
        return out;
    }

    public Map<String, Object> trouver(int id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT id_reglement, kind, structure_nom, montant, type_reglement, note, date_reglement FROM Reglement WHERE id_reglement = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    /** id_structure d'une structure du type voulu (hopital | pharmacie), retrouvée par sa raison sociale ; null si inconnue. */
    public Integer trouverStructure(String kind, String raisonSociale) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT id_structure FROM Structure WHERE type_structure = ? AND raison_sociale = ?")) {
            ps.setString(1, kind);
            ps.setString(2, raisonSociale.trim());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : null;
            }
        }
    }

    /**
     * Montant dû à la structure par la CNAMGS :
     *   hôpital   = somme des prises en charge validées (consultations et examens de ses médecins)
     *   pharmacie = somme des parts assurance de SES livraisons (Ordonnance_delivrance : une livraison partielle
     *               est due à la pharmacie qui l'a faite, même si une autre sert le reste)
     */
    public BigDecimal du(String kind, int idStructure) throws SQLException {
        String sql = kind.equals("hopital")
            ? "SELECT COALESCE(SUM(pec.montant_pec), 0) FROM Prise_en_charge pec JOIN Prestation p ON p.id_prestation = pec.id_prestation " +
              "WHERE p.id_structure = ? AND pec.statut = 'validee' AND p.type_prestation IN ('consultation', 'examen')"
            : "SELECT COALESCE(SUM(part_assurance), 0) FROM Ordonnance_delivrance WHERE id_structure_pharmacie = ?";
        return somme(sql, idStructure);
    }

    /** Total déjà versé (règlements et avances). */
    public BigDecimal paye(int idStructure) throws SQLException {
        return somme("SELECT COALESCE(SUM(montant), 0) FROM Reglement WHERE id_structure = ?", idStructure);
    }

    private BigDecimal somme(String sql, int idStructure) throws SQLException {
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idStructure);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getBigDecimal(1) : BigDecimal.ZERO;
            }
        }
    }

    public int inserer(String kind, int idStructure, String structureNom, BigDecimal montant, String type, String note, int idUtilisateur) throws SQLException {
        String sql = "INSERT INTO Reglement (kind, id_structure, structure_nom, montant, type_reglement, note, date_reglement, id_utilisateur) VALUES (?,?,?,?,?,?,?,?)";
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, kind);
            ps.setInt(2, idStructure);
            ps.setString(3, structureNom);
            ps.setBigDecimal(4, montant);
            ps.setString(5, type);
            ps.setString(6, note == null || note.isBlank() ? null : (note.length() > 300 ? note.substring(0, 300) : note));
            ps.setObject(7, LocalDateTime.now());
            ps.setInt(8, idUtilisateur);
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                return k.next() ? k.getInt(1) : 0;
            }
        }
    }

    private Map<String, Object> map(ResultSet rs) throws SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id_reglement", rs.getInt("id_reglement"));
        m.put("kind", rs.getString("kind"));
        m.put("structure", rs.getString("structure_nom"));
        m.put("montant", rs.getBigDecimal("montant"));
        m.put("type", rs.getString("type_reglement"));
        m.put("note", rs.getString("note") == null ? "" : rs.getString("note"));
        LocalDateTime d = rs.getObject("date_reglement", LocalDateTime.class);
        m.put("date", d == null ? null : d.toLocalDate().toString());
        return m;
    }
}

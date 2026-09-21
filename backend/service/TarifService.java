package service;

import db.Database;
import java.math.BigDecimal;
import java.sql.*;
import java.util.HashMap;
import java.util.Map;

/**
 * Service qui fournit les tarifs fixes (consultation, hospitalisation).
 * Table Tarif(type_prestation, code_acte, libelle, montant_tarif, id_structure).
 *
 * Correctif v5 : l'ancienne version lisait une colonne « montant » qui n'existe pas
 * (la colonne s'appelle « montant_tarif » et il y a un tarif par structure).
 * Ici : tarif le plus bas défini pour le type (un même acte a normalement le même tarif partout).
 */
public class TarifService {

    private static final Map<String, BigDecimal> TARIFS = new HashMap<>();

    public static void init() {
        reload();
        System.out.println("[TarifService] " + TARIFS.size() + " tarif(s) charge(s).");
    }

    public static synchronized void reload() {
        TARIFS.clear();
        String sql = "SELECT type_prestation, MIN(montant_tarif) AS montant_tarif FROM Tarif GROUP BY type_prestation";
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                TARIFS.put(rs.getString("type_prestation"), rs.getBigDecimal("montant_tarif"));
            }
        } catch (SQLException e) {
            System.err.println("[TarifService] Erreur : " + e.getMessage());
        }
    }

    /** Renvoie le tarif fixe, ou null si non défini. */
    public static BigDecimal getTarif(String typePrestation) {
        return TARIFS.get(typePrestation);
    }
}

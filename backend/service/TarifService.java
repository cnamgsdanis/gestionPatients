package service;

import db.Database;

import java.math.BigDecimal;
import java.sql.*;
import java.util.HashMap;
import java.util.Map;

/**
 * Service qui fournit les tarifs fixes (consultation, hospitalisation).
 */
public class TarifService {

    private static final Map<String, BigDecimal> TARIFS = new HashMap<>();

    public static void init() {
        reload();
        System.out.println("[TarifService] " + TARIFS.size() + " tarif(s) charge(s).");
    }

    public static void reload() {
        TARIFS.clear();
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT type_prestation, montant FROM Tarif")) {
            while (rs.next()) {
                TARIFS.put(rs.getString("type_prestation"), rs.getBigDecimal("montant"));
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
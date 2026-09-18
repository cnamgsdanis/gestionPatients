package service;

import db.Database;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.*;
import java.util.HashMap;
import java.util.Map;

/**
 * Service qui gère la grille de couverture (fonds patient → % de couverture).
 * Cache en mémoire pour éviter une requête SQL à chaque calcul.
 */
public class CouvertureService {

    private static final Map<Integer, BigDecimal> TAUX = new HashMap<>();

    public static void init() {
        reload();
        System.out.println("[CouvertureService] Grille chargee : " + TAUX.size() + " niveaux.");
    }

    public static void reload() {
        TAUX.clear();
        String sql = "SELECT fonds, taux_pourcent FROM TauxCouverture";
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                TAUX.put(rs.getInt("fonds"), rs.getBigDecimal("taux_pourcent"));
            }
        } catch (SQLException e) {
            System.err.println("[CouvertureService] Erreur : " + e.getMessage());
        }
    }

    public static BigDecimal getTaux(Integer fonds) {
        if (fonds == null) return BigDecimal.ZERO;
        return TAUX.getOrDefault(fonds, BigDecimal.ZERO);
    }

    /** montant_pec = montant × taux / 100 */
    public static BigDecimal calculerMontantPec(BigDecimal montant, Integer fonds) {
        if (montant == null) return BigDecimal.ZERO;
        return montant.multiply(getTaux(fonds))
                      .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    /** part_patient = montant - montant_pec */
    public static BigDecimal calculerPartPatient(BigDecimal montant, Integer fonds) {
        if (montant == null) return BigDecimal.ZERO;
        return montant.subtract(calculerMontantPec(montant, fonds));
    }
}
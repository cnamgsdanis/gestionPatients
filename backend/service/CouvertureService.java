package service;

import db.Database;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.*;
import java.util.HashMap;
import java.util.Map;

/**
 * Service qui gère la grille de couverture : (fonds du patient, type de prestation) → % de prise en charge.
 * Table TauxCouverture(fonds, type_prestation, pourcentage_pec), clé unique (fonds, type_prestation).
 * Cache en mémoire pour éviter une requête SQL à chaque calcul.
 *
 * Correctif v5 : l'ancienne version lisait une colonne « taux_pourcent » qui n'existe pas
 * (la table définit « pourcentage_pec » ET un taux par type de prestation) : la grille restait vide
 * et tous les montants pris en charge valaient 0.
 */
public class CouvertureService {

    private static final Map<String, BigDecimal> TAUX = new HashMap<>();

    public static void init() {
        reload();
        System.out.println("[CouvertureService] Grille chargee : " + TAUX.size() + " taux (fonds x type).");
    }

    public static synchronized void reload() {
        TAUX.clear();
        String sql = "SELECT fonds, type_prestation, pourcentage_pec FROM TauxCouverture";
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                TAUX.put(cle(rs.getInt("fonds"), rs.getString("type_prestation")), rs.getBigDecimal("pourcentage_pec"));
            }
        } catch (SQLException e) {
            System.err.println("[CouvertureService] Erreur : " + e.getMessage());
        }
    }

    private static String cle(int fonds, String type) {
        return fonds + "|" + type;
    }

    /** Taux (en %) pour ce fonds et ce type de prestation ; 0 si non défini. */
    public static BigDecimal getTaux(Integer fonds, String typePrestation) {
        if (fonds == null || typePrestation == null) return BigDecimal.ZERO;
        return TAUX.getOrDefault(cle(fonds, typePrestation), BigDecimal.ZERO);
    }

    /** montant_pec = montant × taux / 100 */
    public static BigDecimal calculerMontantPec(BigDecimal montant, Integer fonds, String typePrestation) {
        if (montant == null) return BigDecimal.ZERO;
        return montant.multiply(getTaux(fonds, typePrestation))
                      .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    /** part_patient = montant - montant_pec */
    public static BigDecimal calculerPartPatient(BigDecimal montant, Integer fonds, String typePrestation) {
        if (montant == null) return BigDecimal.ZERO;
        return montant.subtract(calculerMontantPec(montant, fonds, typePrestation));
    }

    // Anciennes signatures (sans type) : conservées, calculées sur le type « consultation ».
    public static BigDecimal getTaux(Integer fonds) { return getTaux(fonds, "consultation"); }
    public static BigDecimal calculerMontantPec(BigDecimal montant, Integer fonds) { return calculerMontantPec(montant, fonds, "consultation"); }
    public static BigDecimal calculerPartPatient(BigDecimal montant, Integer fonds) { return calculerPartPatient(montant, fonds, "consultation"); }
}

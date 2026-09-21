// ============================================================
// ControleService.java — Interrupteur des CONTRÔLES ANTI-FRAUDE
// ------------------------------------------------------------
// Réglage « controles_antifraude » de la table Parametre_systeme (1 = actifs, 0 = désactivés).
//
// ACTIFS (par défaut) : le serveur applique tous ses garde-fous — chaque rôle ne fait que son étape
//   (accueil : réception ; médecin : partie médicale et validation ; pharmacien : délivrance),
//   l'administrateur ne modifie pas les feuilles.
// DÉSACTIVÉS (« mode supervision », réservé à l'administrateur) : l'administrateur peut réaliser lui-même
//   TOUTES les étapes du circuit (corriger l'accueil, remplir et valider, servir) pour observer le processus.
//   Les autres rôles restent soumis aux contrôles habituels.
//
// Ce que l'interrupteur NE désactive PAS : l'authentification et les droits de chaque route, le refus d'un
// assuré suspendu, l'intégrité des données (feuille validée non modifiable, ligne servie non annulable, quantité
// servie ≤ quantité prescrite), les montants recalculés par le serveur, le journal d'audit.
// Chaque changement d'état et chaque action faite en mode supervision sont journalisés.
// ============================================================
package service;

import db.Database;
import io.jsonwebtoken.Claims;
import security.AuthGuard;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

public final class ControleService {

    private static final String CLE = "controles_antifraude";
    private static final long TTL_MS = 2000;
    private static volatile Boolean cache;
    private static volatile long cacheDate;

    private ControleService() {}

    /** Vrai si les contrôles sont actifs (défaut : vrai, y compris si la base est illisible — on ne relâche jamais par erreur). */
    public static boolean actifs() {
        long now = System.currentTimeMillis();
        Boolean v = cache;
        if (v != null && now - cacheDate < TTL_MS) return v;
        boolean actif = true;
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT valeur FROM Parametre_systeme WHERE cle = ?")) {
            ps.setString(1, CLE);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) actif = !"0".equals(rs.getString(1));
            }
        } catch (SQLException e) {
            System.err.println("[Controles] Lecture impossible, contrôles maintenus actifs : " + e.getMessage());
        }
        cache = actif;
        cacheDate = now;
        return actif;
    }

    /** Administrateur ET contrôles désactivés : il peut réaliser toutes les étapes du circuit. */
    public static boolean adminSuperviseur(Claims cl) {
        return cl != null && "administrateur".equals(AuthGuard.getRole(cl)) && !actifs();
    }

    /** { actif, modifie_par, modifie_le } */
    public static Map<String, Object> etat() throws SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("actif", actifs());
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(
                 "SELECT p.modifie_le, LTRIM(RTRIM(COALESCE(u.prenom + ' ', '') + u.nom)) AS par " +
                 "FROM Parametre_systeme p LEFT JOIN Utilisateur u ON u.id_utilisateur = p.modifie_par WHERE p.cle = ?")) {
            ps.setString(1, CLE);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    LocalDateTime t = rs.getObject("modifie_le", LocalDateTime.class);
                    m.put("modifie_par", rs.getString("par"));
                    m.put("modifie_le", t == null ? null : t.atZone(ZoneId.systemDefault()).toInstant().toString());
                }
            }
        }
        return m;
    }

    /** Enregistre le nouvel état (créé au besoin) et invalide le cache. */
    public static void definir(boolean actif, int idUtilisateur) throws SQLException {
        String sql = "MERGE Parametre_systeme AS t USING (SELECT ? AS cle) AS s ON t.cle = s.cle " +
                     "WHEN MATCHED THEN UPDATE SET valeur = ?, modifie_par = ?, modifie_le = SYSDATETIME() " +
                     "WHEN NOT MATCHED THEN INSERT (cle, valeur, modifie_par) VALUES (?, ?, ?);";
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, CLE);
            ps.setString(2, actif ? "1" : "0");
            ps.setInt(3, idUtilisateur);
            ps.setString(4, CLE);
            ps.setString(5, actif ? "1" : "0");
            ps.setInt(6, idUtilisateur);
            ps.executeUpdate();
        }
        cache = actif;
        cacheDate = System.currentTimeMillis();
    }
}

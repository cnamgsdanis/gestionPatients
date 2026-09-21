package dao;

import db.Database;

import java.sql.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Accès aux tables Notification et Notification_destinataire.
 * Dates en UTC (ISO-8601 avec « Z » dans les réponses).
 */
public class NotificationDAO {

    // ------------------------------------------------------------
    // Création d'un message et de ses destinataires
    // ------------------------------------------------------------
    public int creer(Connection c, Integer idExpediteur, String cibleType, String cibleValeur, String titre, String message,
                     String priorite, String categorie, boolean accuseRequis, LocalDateTime expireUtc) throws SQLException {
        String sql = "INSERT INTO Notification (id_expediteur, cible_type, cible_valeur, titre, message, priorite, categorie, date_envoi, expire_le, accuse_requis) " +
                     "VALUES (?,?,?,?,?,?,?,?,?,?)";
        try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setObject(1, idExpediteur);
            ps.setString(2, cibleType);
            ps.setString(3, cibleValeur);
            ps.setString(4, titre);
            ps.setString(5, message);
            ps.setString(6, priorite);
            ps.setString(7, categorie);
            ps.setObject(8, LocalDateTime.now(ZoneOffset.UTC));
            ps.setObject(9, expireUtc);
            ps.setBoolean(10, accuseRequis);
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                return k.next() ? k.getInt(1) : 0;
            }
        }
    }

    public void ajouterDestinataires(Connection c, int idNotification, List<Integer> idsUtilisateurs) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO Notification_destinataire (id_notification, id_utilisateur) VALUES (?, ?)")) {
            for (Integer id : idsUtilisateurs) {
                ps.setInt(1, idNotification);
                ps.setInt(2, id);
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    /** Comptes ACTIFS visés par une cible (all / role / etablissement / user), sans l'expéditeur. */
    public List<Integer> resoudreDestinataires(Connection c, String type, String valeur, Integer exclure) throws SQLException {
        String sql = "SELECT id_utilisateur FROM Utilisateur WHERE actif = 1";
        Object param = null;
        switch (type) {
            // un compte reçoit les messages adressés à N'IMPORTE LEQUEL de ses profils
            case "role" -> { sql += " AND (role = ? OR EXISTS (SELECT 1 FROM Utilisateur_profil p WHERE p.id_utilisateur = Utilisateur.id_utilisateur AND p.profil = ?))"; param = valeur; }
            case "etablissement" -> { sql += " AND id_structure = ?"; param = parseInt(valeur); }
            case "user" -> { sql += " AND id_utilisateur = ?"; param = parseInt(valeur); }
            default -> { /* all */ }
        }
        if (exclure != null) sql += " AND id_utilisateur <> " + exclure.intValue();
        List<Integer> ids = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            if (param != null) {
                ps.setObject(1, param);
                if (type.equals("role")) ps.setObject(2, param);
            }
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) ids.add(rs.getInt(1));
            }
        }
        return ids;
    }

    public List<Integer> administrateursActifs(Connection c) throws SQLException {
        List<Integer> ids = new ArrayList<>();
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT id_utilisateur FROM Utilisateur WHERE actif = 1 AND (role = 'administrateur' OR " +
                 "EXISTS (SELECT 1 FROM Utilisateur_profil p WHERE p.id_utilisateur = Utilisateur.id_utilisateur AND p.profil = 'administrateur'))")) {
            while (rs.next()) ids.add(rs.getInt(1));
        }
        return ids;
    }

    // ------------------------------------------------------------
    // Mes messages (non expirés)
    // ------------------------------------------------------------
    public List<Map<String, Object>> mesNotifications(int idUtilisateur) throws SQLException {
        String sql = "SELECT TOP 200 n.id_notification, n.titre, n.message, n.priorite, n.categorie, n.date_envoi, n.expire_le, n.accuse_requis, " +
                     "d.lu_le, d.accuse_le, e.nom AS exp_nom, e.role AS exp_role " +
                     "FROM Notification_destinataire d " +
                     "JOIN Notification n ON n.id_notification = d.id_notification " +
                     "LEFT JOIN Utilisateur e ON e.id_utilisateur = n.id_expediteur " +
                     "WHERE d.id_utilisateur = ? AND (n.expire_le IS NULL OR n.expire_le > SYSUTCDATETIME()) " +
                     "ORDER BY n.date_envoi DESC, n.id_notification DESC";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idUtilisateur);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id_notification", rs.getInt("id_notification"));
                    m.put("expediteur_nom", rs.getString("exp_nom") == null ? "Système" : rs.getString("exp_nom"));
                    m.put("expediteur_role", rs.getString("exp_role") == null ? "" : rs.getString("exp_role"));
                    m.put("titre", rs.getString("titre"));
                    m.put("message", rs.getString("message"));
                    m.put("priorite", rs.getString("priorite"));
                    m.put("categorie", rs.getString("categorie"));
                    m.put("date_envoi", iso(rs, "date_envoi"));
                    m.put("expire_le", iso(rs, "expire_le"));
                    m.put("accuse_requis", rs.getBoolean("accuse_requis"));
                    m.put("lu", rs.getObject("lu_le") != null);
                    m.put("accuse", rs.getObject("accuse_le") != null);
                    out.add(m);
                }
            }
        }
        return out;
    }

    public boolean marquerLu(int idNotification, int idUtilisateur) throws SQLException {
        return maj("UPDATE Notification_destinataire SET lu_le = COALESCE(lu_le, SYSUTCDATETIME()) WHERE id_notification = ? AND id_utilisateur = ?",
            idNotification, idUtilisateur);
    }

    /** L'accusé de réception marque aussi le message comme lu. */
    public boolean marquerAccuse(int idNotification, int idUtilisateur) throws SQLException {
        return maj("UPDATE Notification_destinataire SET lu_le = COALESCE(lu_le, SYSUTCDATETIME()), accuse_le = COALESCE(accuse_le, SYSUTCDATETIME()) " +
                   "WHERE id_notification = ? AND id_utilisateur = ?", idNotification, idUtilisateur);
    }

    private boolean maj(String sql, int a, int b) throws SQLException {
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, a);
            ps.setInt(2, b);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // Messages envoyés, avec suivi de lecture (administrateur)
    // ------------------------------------------------------------
    public int totalEnvoyees() throws SQLException {
        try (Connection c = Database.getConnection(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM Notification")) {
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    public List<Map<String, Object>> envoyees(int page, int taille) throws SQLException {
        String sql = "SELECT n.id_notification, n.cible_type, n.cible_valeur, n.titre, n.message, n.priorite, n.categorie, n.date_envoi, n.accuse_requis, " +
                     "e.nom AS exp_nom, e.role AS exp_role, s.raison_sociale AS cible_structure, cu.nom AS cible_user, " +
                     "(SELECT COUNT(*) FROM Notification_destinataire d WHERE d.id_notification = n.id_notification) AS nb_dest, " +
                     "(SELECT COUNT(*) FROM Notification_destinataire d WHERE d.id_notification = n.id_notification AND d.lu_le IS NOT NULL) AS nb_lus, " +
                     "(SELECT COUNT(*) FROM Notification_destinataire d WHERE d.id_notification = n.id_notification AND d.accuse_le IS NOT NULL) AS nb_accuses " +
                     "FROM Notification n " +
                     "LEFT JOIN Utilisateur e ON e.id_utilisateur = n.id_expediteur " +
                     "LEFT JOIN Structure s ON n.cible_type = 'etablissement' AND CAST(s.id_structure AS NVARCHAR(20)) = n.cible_valeur " +
                     "LEFT JOIN Utilisateur cu ON n.cible_type = 'user' AND CAST(cu.id_utilisateur AS NVARCHAR(20)) = n.cible_valeur " +
                     "ORDER BY n.date_envoi DESC, n.id_notification DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, (Math.max(1, page) - 1) * taille);
            ps.setInt(2, taille);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String type = rs.getString("cible_type");
                    String libelle = switch (type) {
                        case "role" -> "Rôle : " + rs.getString("cible_valeur");
                        case "etablissement" -> "Établissement : " + nz(rs.getString("cible_structure"), rs.getString("cible_valeur"));
                        case "user" -> nz(rs.getString("cible_user"), "Utilisateur " + rs.getString("cible_valeur"));
                        default -> "Tous les utilisateurs";
                    };
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id_notification", rs.getInt("id_notification"));
                    m.put("expediteur_nom", rs.getString("exp_nom") == null ? "Système" : rs.getString("exp_nom"));
                    m.put("expediteur_role", rs.getString("exp_role") == null ? "" : rs.getString("exp_role"));
                    m.put("cible_type", type);
                    m.put("cible_libelle", libelle);
                    m.put("titre", rs.getString("titre"));
                    m.put("message", rs.getString("message"));
                    m.put("priorite", rs.getString("priorite"));
                    m.put("categorie", rs.getString("categorie"));
                    m.put("date_envoi", iso(rs, "date_envoi"));
                    m.put("accuse_requis", rs.getBoolean("accuse_requis"));
                    m.put("destinataires", rs.getInt("nb_dest"));
                    m.put("lus", rs.getInt("nb_lus"));
                    m.put("accuses", rs.getInt("nb_accuses"));
                    out.add(m);
                }
            }
        }
        return out;
    }

    private static String nz(String a, String b) { return a != null ? a : b; }

    private static Integer parseInt(String s) {
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return -1; }
    }

    private static String iso(ResultSet rs, String col) throws SQLException {
        LocalDateTime t = rs.getObject(col, LocalDateTime.class);
        return t == null ? null : t.toInstant(ZoneOffset.UTC).toString();
    }
}

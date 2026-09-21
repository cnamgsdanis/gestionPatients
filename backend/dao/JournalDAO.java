package dao;

import db.Database;
import model.JournalEvenement;

import java.sql.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Accès à Journal_evenement (journal d'audit en ajout seul).
 * Toutes les dates sont stockées en UTC (DATETIME2(3)).
 */
public class JournalDAO {

    /** Critères de recherche des listes (tous facultatifs). */
    public static class Filtre {
        public String recherche, categorie, resultat, severite, role, statutRevue;
        public String du, au;            // AAAA-MM-JJ (dates locales du serveur)
        public boolean seulementConnexions;
        public int scoreMin = 0;
        public int page = 1, taille = 12;
    }

    private static final String COLS =
        "id_evenement, horodatage, origine, session_id, correlation_id, id_utilisateur, login, nom_affiche, role, id_structure, " +
        "etablissement, categorie, action, libelle, resultat, message, ressource_type, ressource_id, ressource_libelle, nag_masque, " +
        "avant, apres, contexte, ip, user_agent, severite, score, regles, statut_revue, revue_par, revue_le, revue_note, hash_precedent, hash";

    // ------------------------------------------------------------
    // Écriture
    // ------------------------------------------------------------
    public String dernierHash(Connection c) throws SQLException {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT TOP 1 hash FROM Journal_evenement ORDER BY id_evenement DESC")) {
            return rs.next() ? rs.getString(1) : null;
        }
    }

    public long inserer(Connection c, JournalEvenement e, LocalDateTime horodatageUtc) throws SQLException {
        String sql = "INSERT INTO Journal_evenement (horodatage, origine, session_id, correlation_id, id_utilisateur, login, nom_affiche, role, " +
            "id_structure, etablissement, categorie, action, libelle, resultat, message, ressource_type, ressource_id, ressource_libelle, " +
            "nag_masque, avant, apres, contexte, ip, user_agent, severite, score, regles, statut_revue, hash_precedent, hash) " +
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            int i = 1;
            ps.setObject(i++, horodatageUtc);
            ps.setString(i++, e.origine);
            ps.setString(i++, cut(e.sessionId, 60));
            ps.setString(i++, cut(e.correlationId, 60));
            ps.setObject(i++, e.idUtilisateur);
            ps.setString(i++, cut(e.login, 50));
            ps.setString(i++, cut(e.nomAffiche, 150));
            ps.setString(i++, cut(e.role, 30));
            ps.setObject(i++, e.idStructure);
            ps.setString(i++, cut(e.etablissement, 150));
            ps.setString(i++, cut(e.categorie, 40));
            ps.setString(i++, cut(e.action, 80));
            ps.setString(i++, cut(e.libelle, 300));
            ps.setString(i++, cut(e.resultat, 10));
            ps.setString(i++, cut(e.message, 500));
            ps.setString(i++, cut(e.ressourceType, 40));
            ps.setString(i++, cut(e.ressourceId, 60));
            ps.setString(i++, cut(e.ressourceLibelle, 200));
            ps.setString(i++, cut(e.nagMasque, 20));
            ps.setString(i++, e.avant);
            ps.setString(i++, e.apres);
            ps.setString(i++, e.contexte);
            ps.setString(i++, cut(e.ip, 60));
            ps.setString(i++, cut(e.userAgent, 300));
            ps.setString(i++, e.severite);
            ps.setInt(i++, e.score);
            ps.setString(i++, e.regles);
            ps.setString(i++, e.statutRevue);
            ps.setString(i++, e.hashPrecedent);
            ps.setString(i++, e.hash);
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                return k.next() ? k.getLong(1) : 0;
            }
        }
    }

    // ------------------------------------------------------------
    // Compteurs pour les règles de détection (fenêtres glissantes)
    // ------------------------------------------------------------
    public int echecsLogin(Connection c, String login, int minutes) throws SQLException {
        return compter(c, "SELECT COUNT(*) FROM Journal_evenement WHERE action = 'auth.login.echec' AND login = ? AND horodatage >= DATEADD(MINUTE, ?, SYSUTCDATETIME())",
            login, -minutes);
    }

    /** Nombre de comptes différents en échec depuis cette adresse (le compte courant compte pour 1). */
    public int comptesEnEchecParIp(Connection c, String ip, int minutes, String loginCourant) throws SQLException {
        int autres = compter(c, "SELECT COUNT(DISTINCT login) FROM Journal_evenement WHERE action = 'auth.login.echec' AND ip = ? AND login <> ? AND horodatage >= DATEADD(MINUTE, ?, SYSUTCDATETIME())",
            ip, loginCourant == null ? "" : loginCourant, -minutes);
        return autres + 1;
    }

    public int evenementsDepuisSecondes(Connection c, int idUtilisateur, int secondes) throws SQLException {
        return compter(c, "SELECT COUNT(*) FROM Journal_evenement WHERE id_utilisateur = ? AND horodatage >= DATEADD(SECOND, ?, SYSUTCDATETIME())",
            idUtilisateur, -secondes);
    }

    public int assuresDistinctsDepuis(Connection c, int idUtilisateur, int minutes) throws SQLException {
        return compter(c, "SELECT COUNT(DISTINCT nag_masque) FROM Journal_evenement WHERE id_utilisateur = ? AND nag_masque IS NOT NULL AND nag_masque <> '' " +
            "AND action IN ('patient.rechercher','dossier.ouvrir','pharma.rechercher') AND horodatage >= DATEADD(MINUTE, ?, SYSUTCDATETIME())",
            idUtilisateur, -minutes);
    }

    public int actionsDepuis(Connection c, int idUtilisateur, String prefixeAction, int minutes) throws SQLException {
        return compter(c, "SELECT COUNT(*) FROM Journal_evenement WHERE id_utilisateur = ? AND action LIKE ? AND horodatage >= DATEADD(MINUTE, ?, SYSUTCDATETIME())",
            idUtilisateur, prefixeAction + "%", -minutes);
    }

    private int compter(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    // ------------------------------------------------------------
    // Lecture (listes paginées)
    // ------------------------------------------------------------
    private String where(Filtre f, List<Object> p) {
        StringBuilder w = new StringBuilder(" WHERE 1=1");
        if (f.seulementConnexions) w.append(" AND action IN ('auth.login.succes','auth.login.echec')");
        if (f.scoreMin > 0) { w.append(" AND score >= ?"); p.add(f.scoreMin); }
        if (notBlank(f.categorie)) { w.append(" AND categorie = ?"); p.add(f.categorie); }
        if (notBlank(f.resultat)) { w.append(" AND resultat = ?"); p.add(f.resultat); }
        if (notBlank(f.severite)) { w.append(" AND severite = ?"); p.add(f.severite); }
        if (notBlank(f.role)) { w.append(" AND role = ?"); p.add(f.role); }
        if (notBlank(f.statutRevue)) { w.append(" AND statut_revue = ?"); p.add(f.statutRevue); }
        if (notBlank(f.du)) { w.append(" AND horodatage >= ?"); p.add(debutJourUtc(f.du)); }
        if (notBlank(f.au)) { w.append(" AND horodatage < ?"); p.add(debutJourUtc(f.au).plusDays(1)); }
        if (notBlank(f.recherche)) {
            w.append(" AND (login LIKE ? OR nom_affiche LIKE ? OR action LIKE ? OR libelle LIKE ? OR ressource_libelle LIKE ? OR message LIKE ?)");
            String q = "%" + f.recherche.trim() + "%";
            for (int i = 0; i < 6; i++) p.add(q);
        }
        return w.toString();
    }

    public int total(Filtre f) throws SQLException {
        List<Object> p = new ArrayList<>();
        String sql = "SELECT COUNT(*) FROM Journal_evenement" + where(f, p);
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < p.size(); i++) ps.setObject(i + 1, p.get(i));
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    public List<JournalEvenement> lister(Filtre f) throws SQLException {
        List<Object> p = new ArrayList<>();
        String sql = "SELECT " + COLS + " FROM Journal_evenement" + where(f, p) +
            " ORDER BY id_evenement DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY";
        p.add((Math.max(1, f.page) - 1) * f.taille);
        p.add(f.taille);
        List<JournalEvenement> out = new ArrayList<>();
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < p.size(); i++) ps.setObject(i + 1, p.get(i));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(map(rs));
            }
        }
        return out;
    }

    public JournalEvenement trouver(long id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT " + COLS + " FROM Journal_evenement WHERE id_evenement = ?")) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    // ------------------------------------------------------------
    // Résumés
    // ------------------------------------------------------------
    public Map<String, Object> resumeConnexions() throws SQLException {
        LocalDateTime jour = debutJourUtc(LocalDate.now().toString());
        Map<String, Object> m = new LinkedHashMap<>();
        try (Connection c = Database.getConnection()) {
            m.put("connexions_aujourdhui", compterAvec(c, "SELECT COUNT(*) FROM Journal_evenement WHERE action = 'auth.login.succes' AND horodatage >= ?", jour));
            m.put("utilisateurs_uniques_30j", compter(c, "SELECT COUNT(DISTINCT login) FROM Journal_evenement WHERE action = 'auth.login.succes' AND horodatage >= DATEADD(DAY, -30, SYSUTCDATETIME())"));
            m.put("echecs_30j", compter(c, "SELECT COUNT(*) FROM Journal_evenement WHERE action = 'auth.login.echec' AND horodatage >= DATEADD(DAY, -30, SYSUTCDATETIME())"));
            try (Statement st = c.createStatement();
                 ResultSet rs = st.executeQuery("SELECT TOP 1 horodatage FROM Journal_evenement WHERE action = 'auth.login.succes' ORDER BY id_evenement DESC")) {
                m.put("derniere_connexion", rs.next() ? rs.getObject(1, LocalDateTime.class).toInstant(ZoneOffset.UTC).toString() : null);
            }
        }
        return m;
    }

    public Map<String, Object> resumeJournal() throws SQLException {
        LocalDateTime jour = debutJourUtc(LocalDate.now().toString());
        Map<String, Object> m = new LinkedHashMap<>();
        try (Connection c = Database.getConnection()) {
            m.put("evenements_aujourdhui", compterAvec(c, "SELECT COUNT(*) FROM Journal_evenement WHERE horodatage >= ?", jour));
            m.put("utilisateurs_actifs_24h", compter(c, "SELECT COUNT(DISTINCT id_utilisateur) FROM Journal_evenement WHERE id_utilisateur IS NOT NULL AND horodatage >= DATEADD(HOUR, -24, SYSUTCDATETIME())"));
            m.put("alertes_a_examiner", compter(c, "SELECT COUNT(*) FROM Journal_evenement WHERE score >= 25 AND statut_revue = 'Nouveau'"));
        }
        return m;
    }

    public int alertesANouveau() throws SQLException {
        try (Connection c = Database.getConnection()) {
            return compter(c, "SELECT COUNT(*) FROM Journal_evenement WHERE score >= 25 AND statut_revue = 'Nouveau'");
        }
    }

    // ------------------------------------------------------------
    // Revue d'une alerte (seules colonnes modifiables : revue_*)
    // ------------------------------------------------------------
    public boolean revue(long id, String statut, String par, String note) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE Journal_evenement SET statut_revue = ?, revue_par = ?, revue_le = ?, revue_note = ? WHERE id_evenement = ?")) {
            ps.setString(1, statut);
            ps.setString(2, cut(par, 150));
            ps.setObject(3, LocalDateTime.now(ZoneOffset.UTC));
            ps.setString(4, cut(note, 500));
            ps.setLong(5, id);
            return ps.executeUpdate() > 0;
        }
    }

    /** Tous les événements dans l'ordre (vérification d'intégrité). Le curseur est fermé par l'appelant. */
    public List<JournalEvenement> tous(Connection c) throws SQLException {
        List<JournalEvenement> out = new ArrayList<>();
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT " + COLS + " FROM Journal_evenement ORDER BY id_evenement")) {
            while (rs.next()) out.add(map(rs));
        }
        return out;
    }

    // ------------------------------------------------------------
    // Outils
    // ------------------------------------------------------------
    private int compterAvec(Connection c, String sql, Object param) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setObject(1, param);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    private int compter(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    /** Début (00:00, heure du serveur) du jour AAAA-MM-JJ, converti en UTC. */
    public static LocalDateTime debutJourUtc(String aaaaMmJj) {
        LocalDate d;
        try {
            d = LocalDate.parse(aaaaMmJj.trim());
        } catch (Exception e) {
            d = LocalDate.now();
        }
        return d.atStartOfDay(ZoneId.systemDefault()).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    private static String cut(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String iso(ResultSet rs, String col) throws SQLException {
        LocalDateTime t = rs.getObject(col, LocalDateTime.class);
        return t == null ? null : t.toInstant(ZoneOffset.UTC).toString();
    }

    private JournalEvenement map(ResultSet rs) throws SQLException {
        JournalEvenement e = new JournalEvenement();
        e.id = rs.getLong("id_evenement");
        e.horodatage = iso(rs, "horodatage");
        e.origine = rs.getString("origine");
        e.sessionId = rs.getString("session_id");
        e.correlationId = rs.getString("correlation_id");
        int u = rs.getInt("id_utilisateur");
        e.idUtilisateur = rs.wasNull() ? null : u;
        e.login = rs.getString("login");
        e.nomAffiche = rs.getString("nom_affiche");
        e.role = rs.getString("role");
        int s = rs.getInt("id_structure");
        e.idStructure = rs.wasNull() ? null : s;
        e.etablissement = rs.getString("etablissement");
        e.categorie = rs.getString("categorie");
        e.action = rs.getString("action");
        e.libelle = rs.getString("libelle");
        e.resultat = rs.getString("resultat");
        e.message = rs.getString("message");
        e.ressourceType = rs.getString("ressource_type");
        e.ressourceId = rs.getString("ressource_id");
        e.ressourceLibelle = rs.getString("ressource_libelle");
        e.nagMasque = rs.getString("nag_masque");
        e.avant = rs.getString("avant");
        e.apres = rs.getString("apres");
        e.contexte = rs.getString("contexte");
        e.ip = rs.getString("ip");
        e.userAgent = rs.getString("user_agent");
        e.severite = rs.getString("severite");
        e.score = rs.getInt("score");
        e.regles = rs.getString("regles");
        e.statutRevue = rs.getString("statut_revue");
        e.revuePar = rs.getString("revue_par");
        e.revueLe = iso(rs, "revue_le");
        e.revueNote = rs.getString("revue_note");
        e.hashPrecedent = rs.getString("hash_precedent");
        e.hash = rs.getString("hash");
        return e;
    }
}

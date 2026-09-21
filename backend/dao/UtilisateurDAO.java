package dao;

import db.Database;
import model.Utilisateur;

import java.sql.*;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * DAO (Data Access Object) pour la table Utilisateur et ses profils (table Utilisateur_profil).
 * Ne contient QUE du SQL : aucune logique métier, aucun HTTP.
 *
 * Profils : Utilisateur.role est le profil PRINCIPAL ; il figure toujours dans Utilisateur_profil, qui liste
 * tous les profils du compte (voir migration_v7_profils_et_mdp_initial.sql).
 */
public class UtilisateurDAO {

    private static final String SELECT =
        "SELECT u.*, s.raison_sociale AS structure_nom FROM Utilisateur u LEFT JOIN Structure s ON s.id_structure = u.id_structure ";

    /** Le compte a-t-il ce profil ? (le profil principal compte toujours) — pour les filtres SQL. */
    private static final String A_PROFIL =
        "(u.role = ? OR EXISTS (SELECT 1 FROM Utilisateur_profil p WHERE p.id_utilisateur = u.id_utilisateur AND p.profil = ?))";

    // ------------------------------------------------------------
    // Recherche par username (utilisé au login)
    // ------------------------------------------------------------
    public Utilisateur findByUsername(String username) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(SELECT + "WHERE u.username = ?")) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Utilisateur u = map(rs);
                attacherProfils(c, List.of(u));
                return u;
            }
        }
    }

    // ------------------------------------------------------------
    // INSERT : le mot de passe doit DÉJÀ être hashé.
    // Le compte, son profil principal et ses éventuels profils supplémentaires (u.profils) sont créés ensemble.
    // ------------------------------------------------------------
    public int insert(Utilisateur u) throws SQLException {
        String sql = "INSERT INTO Utilisateur " +
                     "(username, mot_de_passe, prenom, nom, email, telephone, role, id_structure, code_praticien, type_praticien, doit_changer_mdp) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, u.username);
                    ps.setString(2, u.mot_de_passe);
                    ps.setString(3, blankToNull(u.prenom));
                    ps.setString(4, u.nom);
                    ps.setString(5, blankToNull(u.email));
                    ps.setString(6, blankToNull(u.telephone));
                    ps.setString(7, u.role);
                    ps.setInt   (8, u.id_structure);
                    ps.setString(9, blankToNull(u.code_praticien));
                    ps.setString(10, blankToNull(u.type_praticien));
                    ps.setBoolean(11, u.doit_changer_mdp);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (keys.next()) u.id_utilisateur = keys.getInt(1);
                    }
                }
                Set<String> profils = new LinkedHashSet<>();
                profils.add(u.role);
                if (u.profils != null) profils.addAll(u.profils);
                for (String p : profils) ajouterProfil(c, u.id_utilisateur, p);
                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        }
        return u.id_utilisateur;
    }

    public Utilisateur findById(int id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(SELECT + "WHERE u.id_utilisateur = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Utilisateur u = map(rs);
                attacherProfils(c, List.of(u));
                return u;
            }
        }
    }

    public List<Utilisateur> findAll() throws SQLException {
        List<Utilisateur> liste = new ArrayList<>();
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(SELECT + "ORDER BY u.id_utilisateur")) {
            while (rs.next()) liste.add(map(rs));
            attacherProfils(c, liste);
        }
        return liste;
    }

    /** Médecins actifs (annuaire de l'accueil et de l'espace médecin) : tout compte portant le profil « medecin ». */
    public List<Utilisateur> findMedecinsActifs() throws SQLException {
        List<Utilisateur> liste = new ArrayList<>();
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(SELECT + "WHERE u.actif = 1 AND " + A_PROFIL + " ORDER BY u.nom, u.prenom")) {
            ps.setString(1, "medecin");
            ps.setString(2, "medecin");
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) liste.add(map(rs));
            }
            attacherProfils(c, liste);
        }
        return liste;
    }

    public int compter() throws SQLException {
        try (Connection c = Database.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM Utilisateur")) {
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    /** Comptes actifs portant le profil administrateur (principal ou supplémentaire). */
    public int compterAdministrateursActifs() throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM Utilisateur u WHERE u.actif = 1 AND " + A_PROFIL)) {
            ps.setString(1, "administrateur");
            ps.setString(2, "administrateur");
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    public void updateDerniereConnexion(int idUtilisateur) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE Utilisateur SET derniere_connexion = SYSDATETIME() WHERE id_utilisateur = ?")) {
            ps.setInt(1, idUtilisateur);
            ps.executeUpdate();
        }
    }

    /** Change le mot de passe (hash) et remet le drapeau « à changer » à 0 : c'est l'utilisateur qui a choisi ce mot de passe. */
    public boolean updatePassword(int id, String hash) throws SQLException {
        return updatePassword(id, hash, false);
    }

    /** doitChanger = true : mot de passe TEMPORAIRE (réinitialisation par un administrateur), à remplacer à la prochaine connexion. */
    public boolean updatePassword(int id, String hash, boolean doitChanger) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE Utilisateur SET mot_de_passe = ?, doit_changer_mdp = ? WHERE id_utilisateur = ?")) {
            ps.setString(1, hash);
            ps.setBoolean(2, doitChanger);
            ps.setInt   (3, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // UPDATE : tous les champs modifiables (le mot de passe a sa propre route)
    // ------------------------------------------------------------
    public boolean update(Utilisateur u) throws SQLException {
        String sql = "UPDATE Utilisateur SET prenom = ?, nom = ?, email = ?, telephone = ?, role = ?, id_structure = ?, " +
                     "code_praticien = ?, type_praticien = ?, actif = ? WHERE id_utilisateur = ?";
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString (1, blankToNull(u.prenom));
            ps.setString (2, u.nom);
            ps.setString (3, blankToNull(u.email));
            ps.setString (4, blankToNull(u.telephone));
            ps.setString (5, u.role);
            ps.setInt    (6, u.id_structure);
            ps.setString (7, blankToNull(u.code_praticien));
            ps.setString (8, blankToNull(u.type_praticien));
            ps.setBoolean(9, u.actif);
            ps.setInt    (10, u.id_utilisateur);
            return ps.executeUpdate() > 0;
        }
    }

    public boolean delete(int id) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM Utilisateur WHERE id_utilisateur = ?")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        }
    }

    public boolean setActif(int id, boolean actif) throws SQLException {
        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE Utilisateur SET actif = ? WHERE id_utilisateur = ?")) {
            ps.setBoolean(1, actif);
            ps.setInt    (2, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------
    // PROFILS
    // ------------------------------------------------------------

    /** Ajoute un profil au compte. @return false s'il le portait déjà. */
    public boolean ajouterProfil(int idUtilisateur, String profil) throws SQLException {
        try (Connection c = Database.getConnection()) {
            return ajouterProfil(c, idUtilisateur, profil);
        }
    }

    private boolean ajouterProfil(Connection c, int idUtilisateur, String profil) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO Utilisateur_profil (id_utilisateur, profil) SELECT ?, ? " +
                "WHERE NOT EXISTS (SELECT 1 FROM Utilisateur_profil WHERE id_utilisateur = ? AND profil = ?)")) {
            ps.setInt(1, idUtilisateur);
            ps.setString(2, profil);
            ps.setInt(3, idUtilisateur);
            ps.setString(4, profil);
            return ps.executeUpdate() > 0;
        }
    }

    /**
     * Retire un profil du compte. Si c'est le profil principal, le plus ancien des profils restants le devient.
     * @return le nouveau profil principal si le principal a changé, sinon null
     */
    public String retirerProfil(int idUtilisateur, String profil) throws SQLException {
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                String principal;
                try (PreparedStatement ps = c.prepareStatement("SELECT role FROM Utilisateur WHERE id_utilisateur = ?")) {
                    ps.setInt(1, idUtilisateur);
                    try (ResultSet rs = ps.executeQuery()) {
                        principal = rs.next() ? rs.getString(1) : null;
                    }
                }
                try (PreparedStatement ps = c.prepareStatement("DELETE FROM Utilisateur_profil WHERE id_utilisateur = ? AND profil = ?")) {
                    ps.setInt(1, idUtilisateur);
                    ps.setString(2, profil);
                    ps.executeUpdate();
                }
                String nouveau = null;
                if (profil.equals(principal)) {
                    try (PreparedStatement ps = c.prepareStatement(
                            "SELECT TOP 1 profil FROM Utilisateur_profil WHERE id_utilisateur = ? ORDER BY date_ajout, profil")) {
                        ps.setInt(1, idUtilisateur);
                        try (ResultSet rs = ps.executeQuery()) {
                            if (rs.next()) nouveau = rs.getString(1);
                        }
                    }
                    if (nouveau != null) {
                        try (PreparedStatement ps = c.prepareStatement("UPDATE Utilisateur SET role = ? WHERE id_utilisateur = ?")) {
                            ps.setString(1, nouveau);
                            ps.setInt(2, idUtilisateur);
                            ps.executeUpdate();
                        }
                    }
                }
                c.commit();
                return nouveau;
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        }
    }

    /** Définit le profil principal (le compte doit déjà le porter : il est ajouté sinon). */
    public void definirProfilPrincipal(int idUtilisateur, String profil) throws SQLException {
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                ajouterProfil(c, idUtilisateur, profil);
                try (PreparedStatement ps = c.prepareStatement("UPDATE Utilisateur SET role = ? WHERE id_utilisateur = ?")) {
                    ps.setString(1, profil);
                    ps.setInt(2, idUtilisateur);
                    ps.executeUpdate();
                }
                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        }
    }

    /**
     * PUT /api/utilisateurs/{id} avec un nouveau « role » : le profil principal est REMPLACÉ (l'ancien est retiré, le
     * nouveau ajouté) ; les autres profils du compte ne changent pas. À appeler après update().
     */
    public void remplacerProfilPrincipal(int idUtilisateur, String ancien, String nouveau) throws SQLException {
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                ajouterProfil(c, idUtilisateur, nouveau);
                if (ancien != null && !ancien.equals(nouveau)) {
                    try (PreparedStatement ps = c.prepareStatement("DELETE FROM Utilisateur_profil WHERE id_utilisateur = ? AND profil = ?")) {
                        ps.setInt(1, idUtilisateur);
                        ps.setString(2, ancien);
                        ps.executeUpdate();
                    }
                }
                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        }
    }

    /** Remplit u.profils (principal en premier, puis par ancienneté) pour chaque compte de la liste. */
    private void attacherProfils(Connection c, List<Utilisateur> liste) throws SQLException {
        if (liste.isEmpty()) return;
        java.util.Map<Integer, List<String>> parCompte = new java.util.HashMap<>();
        boolean tous = liste.size() > 500;
        StringBuilder in = new StringBuilder();
        if (!tous) for (int i = 0; i < liste.size(); i++) in.append(i == 0 ? "?" : ",?");
        String sql = "SELECT id_utilisateur, profil FROM Utilisateur_profil " + (tous ? "" : "WHERE id_utilisateur IN (" + in + ") ") + "ORDER BY date_ajout, profil";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            if (!tous) for (int i = 0; i < liste.size(); i++) ps.setInt(i + 1, liste.get(i).id_utilisateur);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) parCompte.computeIfAbsent(rs.getInt(1), k -> new ArrayList<>()).add(rs.getString(2));
            }
        }
        for (Utilisateur u : liste) {
            Set<String> ordre = new LinkedHashSet<>();
            ordre.add(u.role);                                    // le principal d'abord, même si la table ne le liste pas
            List<String> autres = parCompte.get(u.id_utilisateur);
            if (autres != null) ordre.addAll(autres);
            u.profils = new ArrayList<>(ordre);
        }
    }

    // ------------------------------------------------------------
    // ResultSet → Utilisateur
    // ------------------------------------------------------------
    private Utilisateur map(ResultSet rs) throws SQLException {
        Utilisateur u = new Utilisateur();
        u.id_utilisateur     = rs.getInt("id_utilisateur");
        u.username           = rs.getString("username");
        u.mot_de_passe       = rs.getString("mot_de_passe");
        u.prenom             = rs.getString("prenom");
        u.nom                = rs.getString("nom");
        u.email              = rs.getString("email");
        u.telephone          = rs.getString("telephone");
        u.role               = rs.getString("role");
        u.profil_principal   = u.role;
        u.id_structure       = rs.getInt("id_structure");
        u.structure_nom      = rs.getString("structure_nom");
        u.code_praticien     = rs.getString("code_praticien");
        u.type_praticien     = rs.getString("type_praticien");
        u.actif              = rs.getBoolean("actif");
        u.doit_changer_mdp   = rs.getBoolean("doit_changer_mdp");
        u.date_creation      = iso(rs, "date_creation");
        u.derniere_connexion = iso(rs, "derniere_connexion");
        return u;
    }

    /** DATETIME2 (heure du serveur) → ISO-8601 UTC avec « Z », lisible par tous les navigateurs. */
    private static String iso(ResultSet rs, String col) throws SQLException {
        java.time.LocalDateTime t = rs.getObject(col, java.time.LocalDateTime.class);
        return t == null ? null : t.atZone(java.time.ZoneId.systemDefault()).toInstant().toString();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

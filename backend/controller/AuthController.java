// ============================================================
// AuthController.java — Contrôleur HTTP d'authentification
// ------------------------------------------------------------
// Routes :
//    POST /api/auth/register         → créer un compte (utilisateur.creer ;
//                                      libre UNIQUEMENT pour le tout premier compte)
//    POST /api/auth/login            → se connecter → { token, expires_in, user }
//                                      (facultatif : "profil" pour ouvrir la session avec un profil précis du compte)
//    POST /api/auth/logout           → se déconnecter (le jeton est révoqué)
//    POST /api/auth/refresh          → nouveau jeton tant que le compte est actif (le profil actif est conservé)
//    POST /api/auth/profil           → changer de PROFIL ACTIF { "profil": "..." } → nouveau jeton
//    GET  /api/auth/me               → { user, permissions[] } du compte connecté (profil actif de la session)
//    PUT  /api/auth/change-password  → changer SON mot de passe → { message, token, expires_in, user }
//    POST /api/auth/reset-password   → réinitialisation par un administrateur (mot de passe TEMPORAIRE)
// ------------------------------------------------------------
// Ne connaît NI le SQL NI BCrypt : délègue au DAO et au Service.
// Chaque connexion (réussie ou non) est journalisée avec l'adresse IP.
//
// PROFILS : un compte peut porter plusieurs profils (rôles). Le jeton contient le profil ACTIF de la session
// (claim « role ») : c'est lui qui décide des droits et des écrans. « user.role » = profil actif,
// « user.profil_principal » = celui de la base, « user.profils » = tous ceux du compte.
//
// MOT DE PASSE TEMPORAIRE : un compte créé (ou réinitialisé) par un administrateur a doit_changer_mdp = true.
// Son jeton porte « chgmdp » : AuthGuard refuse tout sauf /api/auth/{change-password, me, logout, refresh}
// (403, code MDP_A_CHANGER) jusqu'à ce que l'utilisateur choisisse son mot de passe.
// ============================================================
package controller;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import dao.StructureDAO;
import dao.UtilisateurDAO;
import io.jsonwebtoken.Claims;
import model.JournalEvenement;
import model.JournalEvenement.JournalRegle;
import model.Utilisateur;
import security.AuthGuard;
import service.Audit;
import service.AuthService;
import service.ControleService;
import service.JournalService;
import service.JwtService;
import service.PermissionService;
import service.Http;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class AuthController {

    private final UtilisateurDAO dao = new UtilisateurDAO();
    private final StructureDAO structureDao = new StructureDAO();
    private final AuthService service = new AuthService();
    private final JwtService jwtService = new JwtService();

    // Blocage temporaire : 5 échecs en 10 minutes sur un même identifiant → 429 pendant 10 minutes.
    private static final int ECHECS_MAX = 5;
    private static final long FENETRE_MS = 10 * 60_000L;
    private static final Map<String, Deque<Long>> ECHECS = new ConcurrentHashMap<>();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String path = ex.getRequestURI().getPath();
        try {
            if (path.equals("/api/auth/register") && method.equals("POST")) register(ex);
            else if (path.equals("/api/auth/login") && method.equals("POST")) login(ex);
            else if (path.equals("/api/auth/logout") && method.equals("POST")) logout(ex);
            else if (path.equals("/api/auth/refresh") && method.equals("POST")) refresh(ex);
            else if (path.equals("/api/auth/profil") && method.equals("POST")) changerProfil(ex);
            else if (path.equals("/api/auth/me") && method.equals("GET")) me(ex);
            else if (path.equals("/api/auth/change-password") && method.equals("PUT")) changePassword(ex);
            else if (path.equals("/api/auth/reset-password") && method.equals("POST")) resetPassword(ex);
            else Http.error(ex, 404, "Route inconnue");
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, e.getMessage());
        }
    }

    // ============================================================
    // POST /api/auth/register
    // ------------------------------------------------------------
    // Tant qu'aucun compte n'existe, le tout premier compte peut être créé
    // sans jeton (il devient administrateur). Ensuite : permission utilisateur.creer.
    // Le mot de passe donné est TEMPORAIRE (sauf pour le tout premier compte) : le titulaire
    // devra le remplacer à sa première connexion.
    // ============================================================
    private void register(HttpExchange ex) throws Exception {
        boolean premier = dao.compter() == 0;
        Claims acteur = null;
        if (!premier) {
            if (!AuthGuard.verifierPermission(ex, "utilisateur.creer")) return;
            acteur = AuthGuard.claimsOuNull(ex);
        }

        Utilisateur u = Http.GSON.fromJson(Http.body(ex), Utilisateur.class);
        if (u == null || u.username == null || u.username.isBlank()) { Http.error(ex, 400, "username obligatoire"); return; }
        u.username = u.username.trim();
        if (u.username.length() > 50 || !u.username.matches("[A-Za-z0-9._@-]+")) {
            Http.error(ex, 400, "username invalide (lettres, chiffres, . _ - @ ; 50 caractères maximum)");
            return;
        }
        if (u.mot_de_passe == null || u.mot_de_passe.length() < 4) { Http.error(ex, 400, "mot de passe trop court (min 4)"); return; }
        if (premier) u.role = "administrateur";
        if (u.role == null || u.role.isBlank()) { Http.error(ex, 400, "role obligatoire"); return; }
        if (!Utilisateur.roleValide(u.role)) { Http.error(ex, 400, "role invalide"); return; }
        String erreurProfils = Utilisateur.erreurProfils(u.profils);
        if (erreurProfils != null) { Http.error(ex, 400, erreurProfils); return; }
        if (u.nom == null || u.nom.isBlank()) { Http.error(ex, 400, "nom obligatoire"); return; }
        if (u.id_structure <= 0) { Http.error(ex, 400, "id_structure obligatoire"); return; }
        if (structureDao.findById(u.id_structure) == null) { Http.error(ex, 400, "Structure introuvable (id_structure=" + u.id_structure + ")"); return; }
        if (u.type_praticien != null && !u.type_praticien.isBlank()
                && !Arrays.asList("Généraliste", "Spécialiste", "Autre").contains(u.type_praticien)) {
            Http.error(ex, 400, "type_praticien : Généraliste, Spécialiste ou Autre");
            return;
        }
        if (dao.findByUsername(u.username) != null) { Http.error(ex, 409, "Cet username est deja pris"); return; }

        u.mot_de_passe = service.hash(u.mot_de_passe);
        u.doit_changer_mdp = !premier;
        int id = dao.insert(u);
        Utilisateur cree = dao.findById(id);

        Audit.ok(ex, acteur, "ADMIN", "utilisateur.creer", "Compte créé", "Utilisateur", id, cree.nomComplet(), null, null,
            Map.of("username", cree.username, "role", cree.role, "profils", cree.profils, "id_structure", cree.id_structure));
        Http.json(ex, 201, cree.sansMotDePasse());
    }

    // ============================================================
    // POST /api/auth/login   { "username", "mot_de_passe", "profil"? }
    // ============================================================
    private void login(HttpExchange ex) throws Exception {
        String brut = Http.body(ex);
        Utilisateur demande = Http.GSON.fromJson(brut, Utilisateur.class);
        if (demande == null || demande.username == null || demande.mot_de_passe == null) {
            Http.error(ex, 400, "username et mot_de_passe obligatoires");
            return;
        }
        String profilDemande = null;
        try {
            JsonObject o = com.google.gson.JsonParser.parseString(brut).getAsJsonObject();
            if (o.has("profil") && !o.get("profil").isJsonNull() && !o.get("profil").getAsString().isBlank()) profilDemande = o.get("profil").getAsString();
        } catch (Exception ignore) { /* pas de profil demandé */ }
        String login = demande.username.trim();

        if (estBloque(login)) {
            journaliserConnexion(ex, null, login, null, false, "Compte temporairement bloqué (trop d'échecs)", null);
            Http.error(ex, 429, "Trop de tentatives échouées. Réessayez dans quelques minutes.");
            return;
        }

        Utilisateur u = dao.findByUsername(login);
        if (u == null) {
            noterEchec(login);
            journaliserConnexion(ex, null, login, null, false, "Identifiant inconnu", null);
            Http.error(ex, 401, "Identifiants invalides");
            return;
        }
        if (!u.actif) {
            journaliserConnexion(ex, u, login, null, false, "Compte désactivé", new JournalRegle("COMPTE_DESACTIVE", "Tentative de connexion sur un compte désactivé", 30));
            Http.error(ex, 403, "Compte desactive");
            return;
        }
        if (!service.verifier(demande.mot_de_passe, u.mot_de_passe)) {
            noterEchec(login);
            journaliserConnexion(ex, u, login, null, false, "Mot de passe incorrect", null);
            Http.error(ex, 401, "Identifiants invalides");
            return;
        }
        if (profilDemande != null && !u.aProfil(profilDemande)) {
            journaliserConnexion(ex, u, login, profilDemande, false, "Profil non porté par ce compte", null);
            Http.error(ex, 403, "Ce compte ne porte pas le profil demandé.");
            return;
        }

        ECHECS.remove(login.toLowerCase());
        JournalRegle dormant = null;
        if (u.derniere_connexion != null) {
            try {
                long jours = Duration.between(Instant.parse(u.derniere_connexion), Instant.now()).toDays();
                if (jours > 60) dormant = new JournalRegle("COMPTE_DORMANT", "Connexion d'un compte inactif depuis " + jours + " jours", 25);
            } catch (Exception ignore) { /* date illisible : pas de règle */ }
        }
        dao.updateDerniereConnexion(u.id_utilisateur);
        String actif = profilDemande != null ? profilDemande : u.role;
        journaliserConnexion(ex, u, login, actif, true, u.doit_changer_mdp ? "Mot de passe temporaire : changement demandé" : null, dormant);

        Http.json(ex, 200, session(u, actif));
    }

    /** Réponse de session : { token, expires_in, user } pour un profil actif donné. */
    private JsonObject session(Utilisateur u, String profilActif) {
        String actif = profilActif != null && u.aProfil(profilActif) ? profilActif : u.role;
        JsonObject rep = new JsonObject();
        rep.addProperty("token", jwtService.genererToken(u, actif));
        rep.addProperty("expires_in", JwtService.dureeSecondes());
        rep.add("user", Http.GSON.toJsonTree(u.pourSession(actif)));
        return rep;
    }

    private void journaliserConnexion(HttpExchange ex, Utilisateur u, String login, String profil, boolean succes, String message, JournalRegle regle) {
        JournalEvenement e = Audit.evt(ex, null, "AUTH", succes ? "auth.login.succes" : "auth.login.echec",
            succes ? "Connexion réussie" : "Échec de connexion");
        e.login = login;
        if (u != null) {
            e.idUtilisateur = u.id_utilisateur;
            e.nomAffiche = u.nomComplet();
            e.role = profil != null ? profil : u.role;
            e.idStructure = u.id_structure;
            e.etablissement = u.structure_nom;
        }
        e.resultat = succes ? "SUCCES" : "ECHEC";
        e.message = message;
        if (regle != null) e.reglesSupp = new ArrayList<>(List.of(regle));
        JournalService.log(e);
    }

    private static boolean estBloque(String login) {
        Deque<Long> d = ECHECS.get(login.toLowerCase());
        if (d == null) return false;
        long limite = System.currentTimeMillis() - FENETRE_MS;
        synchronized (d) {
            while (!d.isEmpty() && d.peekFirst() < limite) d.pollFirst();
            return d.size() >= ECHECS_MAX;
        }
    }

    private static void noterEchec(String login) {
        if (ECHECS.size() > 10000) ECHECS.clear();
        Deque<Long> d = ECHECS.computeIfAbsent(login.toLowerCase(), k -> new ArrayDeque<>());
        synchronized (d) { d.addLast(System.currentTimeMillis()); }
    }

    // ============================================================
    // POST /api/auth/logout — le jeton est révoqué côté serveur
    // ============================================================
    private void logout(HttpExchange ex) throws Exception {
        Claims claims = AuthGuard.verifier(ex);
        if (claims == null) return;
        JwtService.revoquer(claims);
        Http.raw(ex, 200, "{\"message\":\"Deconnecte\"}");
    }

    // ============================================================
    // POST /api/auth/refresh — nouveau jeton (session glissante), même profil actif
    // ============================================================
    private void refresh(HttpExchange ex) throws Exception {
        Claims claims = AuthGuard.verifier(ex);
        if (claims == null) return;
        Utilisateur u = dao.findById(AuthGuard.getIdUtilisateur(claims));
        if (u == null || !u.actif) { Http.error(ex, 403, "Compte desactive ou supprime"); return; }
        JwtService.revoquer(claims);   // l'ancien jeton ne sert plus
        Http.json(ex, 200, session(u, AuthGuard.getRole(claims)));
    }

    // ============================================================
    // POST /api/auth/profil   { "profil": "medecin" } — changer de profil actif
    // Le compte doit porter ce profil. Un nouveau jeton est délivré (l'ancien est révoqué) : les droits et les
    // écrans suivent immédiatement le nouveau profil.
    // ============================================================
    private void changerProfil(HttpExchange ex) throws Exception {
        Claims claims = AuthGuard.verifier(ex);
        if (claims == null) return;
        JsonObject data = bodyObject(ex);
        String profil = data != null && data.has("profil") && !data.get("profil").isJsonNull() ? data.get("profil").getAsString() : "";
        if (!Utilisateur.roleValide(profil)) { Http.error(ex, 400, "profil obligatoire et valide"); return; }

        Utilisateur u = dao.findById(AuthGuard.getIdUtilisateur(claims));
        if (u == null || !u.actif) { Http.error(ex, 403, "Compte desactive ou supprime"); return; }
        if (!u.aProfil(profil)) {
            Audit.refus(ex, claims, "SECURITE", "auth.profil.changer", "Changement de profil refusé", "REFUSE",
                "Profil non porté par ce compte : " + profil, "Utilisateur", u.id_utilisateur, null);
            Http.error(ex, 403, "Ce compte ne porte pas ce profil.");
            return;
        }
        String avant = AuthGuard.getRole(claims);
        JwtService.revoquer(claims);
        if (!avant.equals(profil)) {
            Audit.ok(ex, claims, "AUTH", "auth.profil.changer", "Changement de profil", "Utilisateur", u.id_utilisateur, u.nomComplet(), null,
                Map.of("profil", avant), Map.of("profil", profil));
        }
        Http.json(ex, 200, session(u, profil));
    }

    // ============================================================
    // GET /api/auth/me — le compte connecté, son profil actif et les permissions de ce profil
    // ============================================================
    private void me(HttpExchange ex) throws Exception {
        Claims claims = AuthGuard.verifier(ex);
        if (claims == null) return;
        Utilisateur u = dao.findById(AuthGuard.getIdUtilisateur(claims));
        if (u == null || !u.actif) { Http.error(ex, 403, "Compte desactive ou supprime"); return; }
        String role = AuthGuard.getRole(claims);
        String actif = u.aProfil(role) ? role : u.role;
        JsonObject rep = new JsonObject();
        rep.add("user", Http.GSON.toJsonTree(u.pourSession(actif)));
        rep.add("permissions", Http.GSON.toJsonTree(new TreeSet<>(PermissionService.getCodesByRole(actif))));
        // Interrupteur des contrôles anti-fraude : uniquement pour l'administrateur (il sait alors s'il est en mode supervision)
        if ("administrateur".equals(actif)) rep.addProperty("controles_antifraude", ControleService.actifs());
        Http.json(ex, 200, rep);
    }

    // ============================================================
    // PUT /api/auth/change-password   { "ancien": "...", "nouveau": "..." }
    // ------------------------------------------------------------
    // Le nouveau mot de passe doit différer de l'ancien. Tous les jetons du compte sont invalidés
    // et un jeton neuf est renvoyé (le titulaire reste connecté) ; le drapeau « mot de passe temporaire » tombe.
    // ============================================================
    private void changePassword(HttpExchange ex) throws Exception {
        Claims claims = AuthGuard.verifier(ex);
        if (claims == null) return;
        int idUtilisateur = AuthGuard.getIdUtilisateur(claims);

        JsonObject data = bodyObject(ex);
        if (data == null || !data.has("ancien") || !data.has("nouveau")) { Http.error(ex, 400, "ancien et nouveau obligatoires"); return; }
        String ancien = data.get("ancien").getAsString();
        String nouveau = data.get("nouveau").getAsString();
        if (nouveau.length() < 4) { Http.error(ex, 400, "nouveau mot de passe trop court (min 4)"); return; }

        Utilisateur u = dao.findById(idUtilisateur);
        if (u == null) { Http.error(ex, 404, "Utilisateur introuvable"); return; }
        if (!service.verifier(ancien, u.mot_de_passe)) {
            Audit.refus(ex, claims, "AUTH", "auth.mdp.changer", "Changement de mot de passe refusé", "ECHEC", "Ancien mot de passe incorrect", "Utilisateur", idUtilisateur, null);
            Http.error(ex, 401, "Ancien mot de passe incorrect");
            return;
        }
        if (ancien.equals(nouveau)) { Http.error(ex, 400, "Le nouveau mot de passe doit être différent de l'ancien."); return; }

        boolean premierChoix = u.doit_changer_mdp;
        if (!dao.updatePassword(idUtilisateur, service.hash(nouveau))) { Http.error(ex, 500, "Echec de la mise a jour"); return; }
        JwtService.invaliderUtilisateur(idUtilisateur);   // les autres sessions de ce compte doivent se reconnecter

        Audit.ok(ex, claims, "AUTH", premierChoix ? "auth.mdp.initial" : "auth.mdp.changer",
            premierChoix ? "Mot de passe personnel choisi (première connexion)" : "Mot de passe changé",
            "Utilisateur", idUtilisateur, u.nomComplet(), null, null, null);

        Utilisateur maj = dao.findById(idUtilisateur);
        JsonObject rep = session(maj, AuthGuard.getRole(claims));
        rep.addProperty("message", "Mot de passe modifie");
        Http.json(ex, 200, rep);
    }

    // ============================================================
    // POST /api/auth/reset-password   { "id_utilisateur": X, "nouveau": "..." }
    // Le mot de passe donné est TEMPORAIRE : le titulaire le remplacera à sa prochaine connexion
    // (sauf si l'administrateur réinitialise son propre mot de passe).
    // ============================================================
    private void resetPassword(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "utilisateur.modifier")) return;
        Claims claims = AuthGuard.claimsOuNull(ex);

        JsonObject data = bodyObject(ex);
        if (data == null || !data.has("id_utilisateur") || !data.has("nouveau")) { Http.error(ex, 400, "id_utilisateur et nouveau obligatoires"); return; }
        int idCible = data.get("id_utilisateur").getAsInt();
        String nouveau = data.get("nouveau").getAsString();
        if (nouveau.length() < 4) { Http.error(ex, 400, "nouveau mot de passe trop court (min 4)"); return; }

        Utilisateur cible = dao.findById(idCible);
        if (cible == null) { Http.error(ex, 404, "Utilisateur cible introuvable"); return; }

        boolean temporaire = claims == null || AuthGuard.getIdUtilisateur(claims) != idCible;
        boolean ok = dao.updatePassword(idCible, service.hash(nouveau), temporaire);
        if (ok) {
            JwtService.invaliderUtilisateur(idCible);   // ses jetons actuels ne sont plus acceptés
            ECHECS.remove(cible.username.toLowerCase());
            Audit.ok(ex, claims, "ADMIN", "utilisateur.mdp.reinitialiser", "Mot de passe réinitialisé", "Utilisateur", idCible, cible.nomComplet(), null, null,
                Map.of("mot_de_passe_temporaire", temporaire));
            Http.raw(ex, 200, "{\"message\":\"Mot de passe reinitialise\"}");
        } else {
            Http.error(ex, 500, "Echec de la mise a jour");
        }
    }

    private JsonObject bodyObject(HttpExchange ex) throws IOException {
        var el = Http.jsonBody(ex);
        return el != null && el.isJsonObject() ? el.getAsJsonObject() : null;
    }
}

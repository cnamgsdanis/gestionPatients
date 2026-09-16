// ============================================================
// AuthController.java — Contrôleur HTTP d'authentification
// ------------------------------------------------------------
// Expose deux routes :
//    POST /api/auth/register → créer un compte
//    POST /api/auth/login    → se connecter
// ------------------------------------------------------------
// Ne connaît NI le SQL NI BCrypt : délègue au DAO et au Service.
// ============================================================
package controller;
import com.google.gson.Gson;                             // Conversion JSON ↔ Java
import com.sun.net.httpserver.HttpExchange;              // Représente une requête HTTP
import dao.UtilisateurDAO;                               // Accès BD
import model.Utilisateur;                                // Modèle
import service.AuthService;                              // Hash/vérification

import java.io.*;                                        // Streams
import java.nio.charset.StandardCharsets;                // UTF-8

public class AuthController {

    // ------------------------------------------------------------
    // Dépendances (instanciées une seule fois)
    // ------------------------------------------------------------
    private final UtilisateurDAO dao     = new UtilisateurDAO();
    private final AuthService    service = new AuthService();
    private final Gson           gson    = new Gson();

    /**
     * Point d'entrée unique pour toutes les routes sous /api/auth/*.
     * Appelée automatiquement par le serveur HTTP.
     */
    public void handle(HttpExchange ex) throws IOException {

        String method = ex.getRequestMethod();                // GET / POST / PUT / DELETE
        String path   = ex.getRequestURI().getPath();         // ex: /api/auth/login

        try {
            // ------------------------------------------------------------
            // Route : POST /api/auth/register
            // ------------------------------------------------------------
            if (path.equals("/api/auth/register") && method.equals("POST")) {
                register(ex);
            }
            // ------------------------------------------------------------
            // Route : POST /api/auth/login
            // ------------------------------------------------------------
            else if (path.equals("/api/auth/login") && method.equals("POST")) {
                login(ex);
            }
            // ------------------------------------------------------------
            // Route inconnue → 404
            // ------------------------------------------------------------
            else {
                sendJson(ex, 404, "{\"error\":\"Route inconnue\"}");
            }
        } catch (Exception e) {
            // Toute exception inattendue → 500 + log dans la console
            e.printStackTrace();
            sendJson(ex, 500, "{\"error\":\"" + escape(e.getMessage()) + "\"}");
        }
    }

    // ============================================================
    // POST /api/auth/register
    // ============================================================
    private void register(HttpExchange ex) throws Exception {

        // 1. Lire le corps de la requête (JSON brut)
        String body = readBody(ex);

        // 2. Convertir le JSON en objet Utilisateur
        Utilisateur u = gson.fromJson(body, Utilisateur.class);

        // 3. Validations : on vérifie que les champs essentiels sont présents
        if (u == null || u.username == null || u.username.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"username obligatoire\"}");
            return;
        }
        if (u.mot_de_passe == null || u.mot_de_passe.length() < 4) {
            sendJson(ex, 400, "{\"error\":\"mot de passe trop court (min 4)\"}");
            return;
        }
        if (u.role == null || u.role.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"role obligatoire\"}");
            return;
        }
        if (u.id_structure <= 0) {
            sendJson(ex, 400, "{\"error\":\"id_structure obligatoire\"}");
            return;
        }

        // 4. Vérifier que le username n'est pas déjà utilisé
        if (dao.findByUsername(u.username) != null) {
            sendJson(ex, 409, "{\"error\":\"Cet username est deja pris\"}");
            return;
        }

        // 5. ⚠️ Hashage du mot de passe AVANT insertion en base
        u.mot_de_passe = service.hash(u.mot_de_passe);

        // 6. Insertion en base, récupération de l'ID généré
        int id = dao.insert(u);
        u.id_utilisateur = id;

        // 7. Recharger l'utilisateur depuis la base pour avoir les valeurs exactes
        //    (actif, date_creation... sont remplis par SQL Server avec leurs DEFAULT)
        Utilisateur cree = dao.findById(id);

        // 8. Réponse 201 Created (sans le hash)
        sendJson(ex, 201, gson.toJson(cree.sansMotDePasse()));
    }

    // ============================================================
    // POST /api/auth/login
    // ============================================================
    private void login(HttpExchange ex) throws Exception {

        // 1. Lire et parser le JSON : { "username": "...", "mot_de_passe": "..." }
        String body = readBody(ex);
        Utilisateur demande = gson.fromJson(body, Utilisateur.class);

        if (demande == null || demande.username == null || demande.mot_de_passe == null) {
            sendJson(ex, 400, "{\"error\":\"username et mot_de_passe obligatoires\"}");
            return;
        }

        // 2. Chercher l'utilisateur par son username
        Utilisateur u = dao.findByUsername(demande.username);

        // Si introuvable, on renvoie un message GÉNÉRIQUE pour ne pas
        // révéler si le username existe ou pas (sécurité).
        if (u == null) {
            sendJson(ex, 401, "{\"error\":\"Identifiants invalides\"}");
            return;
        }

        // 3. Vérifier que le compte est actif
        if (!u.actif) {
            sendJson(ex, 403, "{\"error\":\"Compte desactive\"}");
            return;
        }

        // 4. Vérifier le mot de passe (BCrypt compare le clair et le hash)
        if (!service.verifier(demande.mot_de_passe, u.mot_de_passe)) {
            sendJson(ex, 401, "{\"error\":\"Identifiants invalides\"}");
            return;
        }

        // 5. Mettre à jour la date de dernière connexion
        dao.updateDerniereConnexion(u.id_utilisateur);

        // 6. Réponse 200 OK (sans le hash)
        sendJson(ex, 200, gson.toJson(u.sansMotDePasse()));
    }

    // ============================================================
    // Helpers
    // ============================================================

    /** Lit le corps d'une requête HTTP et le retourne sous forme de String. */
    private String readBody(HttpExchange ex) throws IOException {
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(ex.getRequestBody(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String ligne;
            while ((ligne = br.readLine()) != null) sb.append(ligne);
            return sb.toString();
        }
    }

    /** Envoie une réponse JSON avec un code HTTP. */
    private void sendJson(HttpExchange ex, int code, String json) throws IOException {

        // En-tête HTTP : dit au client que la réponse est du JSON UTF-8
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");

        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);

        // Envoie le code HTTP et la taille de la réponse
        ex.sendResponseHeaders(code, bytes.length);

        // Écrit le corps de la réponse
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    /** Échappe les guillemets pour ne pas casser le JSON d'erreur. */
    private String escape(String s) {
        return s == null ? "" : s.replace("\"", "'");
    }
}
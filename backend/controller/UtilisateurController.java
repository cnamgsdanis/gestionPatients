// ============================================================
// UtilisateurController.java — CRUD Utilisateur (permissions)
// ------------------------------------------------------------
// Routes (protégées par permissions) :
//   GET    /api/utilisateurs            → liste         (utilisateur.lire)
//   GET    /api/utilisateurs/{id}       → détail        (utilisateur.lire)
//   PUT    /api/utilisateurs/{id}       → modifier      (utilisateur.modifier)
//   DELETE /api/utilisateurs/{id}       → supprimer     (utilisateur.supprimer)
//   PATCH  /api/utilisateurs/{id}/actif → activer/désac (utilisateur.modifier)
//
//  L'admin peut modifier ces permissions dynamiquement
//    via /api/permissions/* sans recompiler ce fichier.
// ============================================================

package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.UtilisateurDAO;
import model.Utilisateur;
import security.AuthGuard;
import service.AuthService;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class UtilisateurController {

    private final UtilisateurDAO dao  = new UtilisateurDAO();
    private final Gson           gson = new Gson();
    private final AuthService    service = new AuthService();

    // ============================================================
    // Point d'entrée : dispatch selon la méthode et le chemin
    // ============================================================
    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String path   = ex.getRequestURI().getPath();

        try {
            String[] parts = path.split("/");

            // PATCH /api/utilisateurs/{id}/actif
            if (parts.length == 5 && parts[4].equals("actif") && method.equals("PATCH")) {
                handleSetActif(ex, Integer.parseInt(parts[3]));
                return;
            }

            switch (method) {
                case "GET"    -> handleGet(ex);
                case "POST"   -> handlePost(ex);
                case "PUT"    -> handlePut(ex);
                case "DELETE" -> handleDelete(ex);
                default       -> sendJson(ex, 405, "{\"error\":\"Methode non autorisee\"}");
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(ex, 500, "{\"error\":\"" + escape(e.getMessage()) + "\"}");
        }
    }

    // ============================================================
    // GET /api/utilisateurs          → liste complète
    // GET /api/utilisateurs/{id}     → un seul utilisateur
    //  Permission requise : utilisateur.lire
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        //  Vérification de la permission
        if (!AuthGuard.verifierPermission(ex, "utilisateur.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");

        if (parts.length == 3) {
            // --- Liste complète ---
            List<Utilisateur> liste = dao.findAll();

            // On retire le hash du mot de passe pour chaque utilisateur
            List<Utilisateur> propres = new ArrayList<>();
            for (Utilisateur u : liste) propres.add(u.sansMotDePasse());

            sendJson(ex, 200, gson.toJson(propres));

        } else if (parts.length == 4) {
            // --- Un seul utilisateur ---
            int id = Integer.parseInt(parts[3]);
            Utilisateur u = dao.findById(id);

            if (u == null) sendJson(ex, 404, "{\"error\":\"Utilisateur introuvable\"}");
            else           sendJson(ex, 200, gson.toJson(u.sansMotDePasse()));

        } else {
            sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
        }
    }




        // ============================================================
    // POST /api/utilisateurs      → création par ADMIN
    // Permission requise : utilisateur.creer
    // Body : identique à /api/auth/register
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {

        //  Vérification de la permission
        if (!AuthGuard.verifierPermission(ex, "utilisateur.creer")) return;

        // 1. Parser le JSON
        Utilisateur u = gson.fromJson(readBody(ex), Utilisateur.class);

        // 2. Validations
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

        // 3. Vérifier que le username n'existe pas
        if (dao.findByUsername(u.username) != null) {
            sendJson(ex, 409, "{\"error\":\"Cet username est deja pris\"}");
            return;
        }

        // 4. Hasher le mot de passe
        u.mot_de_passe = service.hash(u.mot_de_passe);

        // 5. Insérer en base
        int id = dao.insert(u);

        // 6. Renvoyer l'utilisateur créé (sans hash)
        Utilisateur cree = dao.findById(id);
        sendJson(ex, 201, gson.toJson(cree.sansMotDePasse()));
    }

    // ============================================================
    // PUT /api/utilisateurs/{id}     → modifier
    //  Permission requise : utilisateur.modifier
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {

        //  Vérification de la permission
        if (!AuthGuard.verifierPermission(ex, "utilisateur.modifier")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        // 1. Récupérer l'utilisateur existant
        Utilisateur existant = dao.findById(id);
        if (existant == null) {
            sendJson(ex, 404, "{\"error\":\"Utilisateur introuvable\"}");
            return;
        }

        // 2. Récupérer les nouvelles valeurs depuis le JSON
        Utilisateur modif = gson.fromJson(readBody(ex), Utilisateur.class);
        modif.id_utilisateur = id;   // on force l'ID depuis l'URL

        // 3. Si un champ est null → on garde l'ancienne valeur
        if (modif.nom          == null) modif.nom          = existant.nom;
        if (modif.email        == null) modif.email        = existant.email;
        if (modif.telephone    == null) modif.telephone    = existant.telephone;
        if (modif.role         == null) modif.role         = existant.role;
        if (modif.id_structure <= 0)    modif.id_structure = existant.id_structure;

        // 4. Mettre à jour en base
        boolean ok = dao.update(modif);

        if (ok) sendJson(ex, 200, gson.toJson(dao.findById(id).sansMotDePasse()));
        else    sendJson(ex, 500, "{\"error\":\"Echec de la mise a jour\"}");
    }

    // ============================================================
    // DELETE /api/utilisateurs/{id}  → supprimer
    //  Permission requise : utilisateur.supprimer
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        //  Vérification de la permission
        if (!AuthGuard.verifierPermission(ex, "utilisateur.supprimer")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        boolean ok = dao.delete(id);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // PATCH /api/utilisateurs/{id}/actif  → activer/désactiver
    //  Permission requise : utilisateur.modifier
    // Body : { "actif": true }  ou  { "actif": false }
    // ============================================================
    private void handleSetActif(HttpExchange ex, int id) throws Exception {

        //  Vérification de la permission
        if (!AuthGuard.verifierPermission(ex, "utilisateur.modifier")) return;

        // Lire le JSON pour récupérer la valeur "actif"
        String body = readBody(ex);
        Utilisateur data = gson.fromJson(body, Utilisateur.class);

        boolean ok = dao.setActif(id, data.actif);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Statut mis a jour\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // Helpers
    // ============================================================

    private String readBody(HttpExchange ex) throws IOException {
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(ex.getRequestBody(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String ligne;
            while ((ligne = br.readLine()) != null) sb.append(ligne);
            return sb.toString();
        }
    }

    private void sendJson(HttpExchange ex, int code, String json) throws IOException {
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String escape(String s) {
        return s == null ? "" : s.replace("\"", "'");
    }
}
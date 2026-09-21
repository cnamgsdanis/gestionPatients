package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.StructureDAO;
import model.Structure;
import security.AuthGuard;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Contrôleur HTTP des structures (hôpitaux et pharmacies).
 *
 * Routes :
 *   GET    /api/structures                    → liste (filtres : ?type=X, ?raison=Y)
 *   GET    /api/structures/{id}               → détail
 *   POST   /api/structures                    → créer
 *   PUT    /api/structures/{id}               → modifier
 *   DELETE /api/structures/{id}               → supprimer
 *
 * Permissions :
 *   - structure.lire  pour les GET
 *   - structure.gerer pour POST/PUT/DELETE
 */
public class StructureController {

    private final StructureDAO dao  = new StructureDAO();
    private final Gson         gson = new Gson();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        try {
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
    // GET /api/structures          → liste (filtrable)
    // GET /api/structures/{id}     → détail
    //  Permission requise : structure.lire
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "structure.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");

        // --- Route /api/structures/{id} ---
        if (parts.length == 4) {
            int id = Integer.parseInt(parts[3]);
            Structure s = dao.findById(id);
            if (s == null) sendJson(ex, 404, "{\"error\":\"Structure introuvable\"}");
            else           sendJson(ex, 200, gson.toJson(s));
            return;
        }

        // --- Route /api/structures (avec filtres optionnels) ---
        if (parts.length == 3) {

            // Récupérer les query params : ?type=hopital&raison=principal
            Map<String, String> params = parseQuery(ex.getRequestURI().getQuery());
            String type   = params.get("type");
            String raison = params.get("raison");

            List<Structure> liste;

            if (type != null && !type.isBlank()) {
                liste = dao.findByType(type);
            } else if (raison != null && !raison.isBlank()) {
                liste = dao.findByRaisonSociale(raison);
            } else {
                liste = dao.findAll();
            }

            sendJson(ex, 200, gson.toJson(liste));
            return;
        }

        sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
    }

    // ============================================================
    // POST /api/structures          → créer
    //  Permission requise : structure.gerer
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "structure.gerer")) return;

        Structure s = gson.fromJson(readBody(ex), Structure.class);

        // Validations
        if (s == null || s.raison_sociale == null || s.raison_sociale.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"raison_sociale obligatoire\"}");
            return;
        }
        if (s.addresse == null || s.addresse.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"addresse obligatoire\"}");
            return;
        }
        if (s.type_structure == null ||
            (!s.type_structure.equals("hopital") && !s.type_structure.equals("pharmacie") && !s.type_structure.equals("administration"))) {
            sendJson(ex, 400, "{\"error\":\"type_structure doit etre 'hopital', 'pharmacie' ou 'administration'\"}");
            return;
        }

        int id = dao.insert(s);
        service.Audit.ok(ex, security.AuthGuard.claimsOuNull(ex), "ADMIN", "structure.creer", "Structure créée", "Structure", id,
            s.raison_sociale, null, null, java.util.Map.of("type", s.type_structure));
        sendJson(ex, 201, "{\"id_structure\":" + id + "}");
    }

    // ============================================================
    // PUT /api/structures/{id}      → modifier
    //  Permission requise : structure.gerer
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "structure.gerer")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        Structure existant = dao.findById(id);
        if (existant == null) {
            sendJson(ex, 404, "{\"error\":\"Structure introuvable\"}");
            return;
        }

        Structure modif = gson.fromJson(readBody(ex), Structure.class);
        modif.id_structure = id;

        // Garde les anciennes valeurs si champs non fournis
        if (modif.raison_sociale == null) modif.raison_sociale = existant.raison_sociale;
        if (modif.addresse       == null) modif.addresse       = existant.addresse;
        if (modif.type_structure == null) modif.type_structure = existant.type_structure;
        if (!java.util.List.of("hopital", "pharmacie", "administration").contains(modif.type_structure)) {
            sendJson(ex, 400, "{\"error\":\"type_structure doit etre 'hopital', 'pharmacie' ou 'administration'\"}");
            return;
        }

        boolean ok = dao.update(modif);
        if (ok) service.Audit.ok(ex, security.AuthGuard.claimsOuNull(ex), "ADMIN", "structure.modifier", "Structure modifiée", "Structure", id,
            modif.raison_sociale, null, null, java.util.Map.of("type", modif.type_structure));
        if (ok) sendJson(ex, 200, gson.toJson(dao.findById(id)));
        else    sendJson(ex, 500, "{\"error\":\"Echec de la mise a jour\"}");
    }

    // ============================================================
    // DELETE /api/structures/{id}   → supprimer
    //  Permission requise : structure.gerer
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "structure.gerer")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        try {
            boolean ok = dao.delete(id);
            if (ok) service.Audit.ok(ex, security.AuthGuard.claimsOuNull(ex), "ADMIN", "structure.supprimer", "Structure supprimée", "Structure", id, null, null, null, null);
            sendJson(ex, ok ? 200 : 404,
                     ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
        } catch (java.sql.SQLException e) {
            // Cas fréquent : utilisateurs ou médicaments rattachés
            if (e.getMessage().contains("REFERENCE")) {
                sendJson(ex, 409,
                    "{\"error\":\"Impossible de supprimer : des utilisateurs ou medicaments y sont rattaches\"}");
            } else {
                throw e;
            }
        }
    }

    // ============================================================
    // Helpers
    // ============================================================

    /** Parse la query string : "type=hopital&raison=X" → Map. */
    private Map<String, String> parseQuery(String query) {
        Map<String, String> map = new java.util.HashMap<>();
        if (query == null || query.isBlank()) return map;
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2) {
                map.put(kv[0], java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
            }
        }
        return map;
    }

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
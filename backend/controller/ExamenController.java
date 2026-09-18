package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.ExamenDAO;
import model.Examen;
import security.AuthGuard;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

/**
 * Contrôleur HTTP des examens médicaux.
 *
 * Routes :
 *   GET    /api/examens                    → liste (?id_prestation, ?statut)
 *   GET    /api/examens/{id}               → détail
 *   POST   /api/examens                    → créer
 *   PUT    /api/examens/{id}               → modifier
 *   DELETE /api/examens/{id}               → supprimer
 *   PUT    /api/examens/{id}/statut        → changer statut rapidement
 */
public class ExamenController {

    private final ExamenDAO dao  = new ExamenDAO();
    private final Gson      gson = new Gson();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String path   = ex.getRequestURI().getPath();

        try {
            String[] parts = path.split("/");

            // PUT /api/examens/{id}/statut
            if (parts.length == 5 && parts[4].equals("statut") && method.equals("PUT")) {
                changerStatut(ex, Integer.parseInt(parts[3]));
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
    // GET /api/examens           → liste (filtrable)
    // GET /api/examens/{id}      → détail
    //  examen.lire
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "examen.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");

        if (parts.length == 4) {
            int id = Integer.parseInt(parts[3]);
            Examen e = dao.findById(id);
            if (e == null) sendJson(ex, 404, "{\"error\":\"Examen introuvable\"}");
            else           sendJson(ex, 200, gson.toJson(e));
            return;
        }

        if (parts.length == 3) {
            Map<String, String> q = parseQuery(ex.getRequestURI().getQuery());
            Integer idPrestation = toInt(q.get("id_prestation"));
            String  statut       = q.get("statut");

            List<Examen> liste = dao.findAll(idPrestation, statut);
            sendJson(ex, 200, gson.toJson(liste));
            return;
        }

        sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
    }

    // ============================================================
    // POST /api/examens          → créer
    //  examen.creer
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "examen.creer")) return;

        Examen e = gson.fromJson(readBody(ex), Examen.class);

        if (e == null || e.type_examen == null || e.type_examen.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"type_examen obligatoire\"}");
            return;
        }
        if (e.id_prestation <= 0) {
            sendJson(ex, 400, "{\"error\":\"id_prestation obligatoire\"}");
            return;
        }
        if (e.date_examen == null || e.date_examen.isBlank()) {
            e.date_examen = LocalDate.now().toString();
        }
        if (e.statut == null || e.statut.isBlank()) {
            e.statut = "en_attente";
        }

        int id = dao.insert(e);
        sendJson(ex, 201, gson.toJson(dao.findById(id)));
    }

    // ============================================================
    // PUT /api/examens/{id}      → modifier
    //  examen.modifier
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "examen.modifier")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        Examen existant = dao.findById(id);
        if (existant == null) {
            sendJson(ex, 404, "{\"error\":\"Examen introuvable\"}");
            return;
        }

        Examen modif = gson.fromJson(readBody(ex), Examen.class);
        modif.id_examen = id;

        if (modif.type_examen   == null) modif.type_examen   = existant.type_examen;
        if (modif.date_examen   == null) modif.date_examen   = existant.date_examen;
        if (modif.statut        == null) modif.statut        = existant.statut;
        if (modif.id_prestation <= 0)    modif.id_prestation = existant.id_prestation;

        boolean ok = dao.update(modif);
        if (ok) sendJson(ex, 200, gson.toJson(dao.findById(id)));
        else    sendJson(ex, 500, "{\"error\":\"Echec de la mise a jour\"}");
    }

    // ============================================================
    // DELETE /api/examens/{id}   → supprimer
    //  examen.supprimer
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "examen.supprimer")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        boolean ok = dao.delete(id);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // PUT /api/examens/{id}/statut   → changer statut
    // Body : { "statut": "termine" }
    //  examen.modifier
    // ============================================================
    private void changerStatut(HttpExchange ex, int id) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "examen.modifier")) return;

        Examen existant = dao.findById(id);
        if (existant == null) {
            sendJson(ex, 404, "{\"error\":\"Examen introuvable\"}");
            return;
        }

        Map<String, String> body = gson.fromJson(readBody(ex), Map.class);
        String statut = body.get("statut");

        List<String> valides = List.of("en_attente", "en_cours", "termine", "annule");
        if (statut == null || !valides.contains(statut)) {
            sendJson(ex, 400,
                "{\"error\":\"statut doit etre : en_attente, en_cours, termine ou annule\"}");
            return;
        }

        existant.statut = statut;
        dao.update(existant);
        sendJson(ex, 200, gson.toJson(dao.findById(id)));
    }

    // ---- Helpers ----

    private Integer toInt(String s) {
        if (s == null || s.isBlank()) return null;
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return null; }
    }

    private Map<String, String> parseQuery(String query) {
        Map<String, String> map = new HashMap<>();
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
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }

    private String escape(String s) { return s == null ? "" : s.replace("\"", "'"); }
}
package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.MedicamentDAO;
import model.Medicament;
import security.AuthGuard;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Contrôleur HTTP des médicaments (stock pharmacie).
 *
 * Routes :
 *   GET    /api/medicaments                    → liste (?id_structure=X)
 *   GET    /api/medicaments/{id}               → détail
 *   POST   /api/medicaments                    → créer
 *   PUT    /api/medicaments/{id}               → modifier
 *   DELETE /api/medicaments/{id}               → supprimer
 *
 * Permissions :
 *   - structure.lire pour GET
 *   - structure.gerer pour POST/PUT/DELETE
 */
public class MedicamentController {

    private final MedicamentDAO dao  = new MedicamentDAO();
    private final Gson          gson = new Gson();

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

    private void handleGet(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "structure.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");

        if (parts.length == 4) {
            int id = Integer.parseInt(parts[3]);
            Medicament m = dao.findById(id);
            if (m == null) sendJson(ex, 404, "{\"error\":\"Medicament introuvable\"}");
            else           sendJson(ex, 200, gson.toJson(m));
            return;
        }

        if (parts.length == 3) {
            Map<String, String> params = parseQuery(ex.getRequestURI().getQuery());
            String idStructureStr = params.get("id_structure");

            List<Medicament> liste;
            if (idStructureStr != null && !idStructureStr.isBlank()) {
                liste = dao.findByIdStructure(Integer.parseInt(idStructureStr));
            } else {
                liste = dao.findAll();
            }
            sendJson(ex, 200, gson.toJson(liste));
            return;
        }

        sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
    }

    private void handlePost(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "structure.gerer")) return;

        Medicament m = gson.fromJson(readBody(ex), Medicament.class);

        if (m == null || m.nom_medicament == null || m.nom_medicament.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"nom_medicament obligatoire\"}");
            return;
        }
        if (m.id_structure <= 0) {
            sendJson(ex, 400, "{\"error\":\"id_structure obligatoire\"}");
            return;
        }

        int id = dao.insert(m);
        sendJson(ex, 201, gson.toJson(dao.findById(id)));
    }

    private void handlePut(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "structure.gerer")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        Medicament existant = dao.findById(id);
        if (existant == null) {
            sendJson(ex, 404, "{\"error\":\"Medicament introuvable\"}");
            return;
        }

        Medicament modif = gson.fromJson(readBody(ex), Medicament.class);
        modif.id_medicament = id;

        if (modif.nom_medicament == null) modif.nom_medicament = existant.nom_medicament;
        if (modif.dosage         == null) modif.dosage         = existant.dosage;
        if (modif.id_structure   <= 0)    modif.id_structure   = existant.id_structure;

        boolean ok = dao.update(modif);
        if (ok) sendJson(ex, 200, gson.toJson(dao.findById(id)));
        else    sendJson(ex, 500, "{\"error\":\"Echec mise a jour\"}");
    }

    private void handleDelete(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "structure.gerer")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        boolean ok = dao.delete(id);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ---- Helpers ----

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
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }

    private String escape(String s) { return s == null ? "" : s.replace("\"", "'"); }
}
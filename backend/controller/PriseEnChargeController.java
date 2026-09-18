package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.PriseEnChargeDAO;
import model.PriseEnCharge;
import security.AuthGuard;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Contrôleur HTTP des prises en charge (PEC).
 *
 * Routes :
 *   GET    /api/prises-en-charge                    → liste (?statut, ?id_prestation)
 *   GET    /api/prises-en-charge/{id}               → détail
 *   PUT    /api/prises-en-charge/{id}/valider       → valider (directeur/admin)
 *   PUT    /api/prises-en-charge/{id}/rejeter       → rejeter
 *   DELETE /api/prises-en-charge/{id}               → supprimer
 */
public class PriseEnChargeController {

    private final PriseEnChargeDAO dao  = new PriseEnChargeDAO();
    private final Gson             gson = new Gson();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String path   = ex.getRequestURI().getPath();

        try {
            String[] parts = path.split("/");

            // PUT /api/prises-en-charge/{id}/valider  ou  /rejeter
            if (parts.length == 5 && method.equals("PUT")) {
                int id = Integer.parseInt(parts[3]);
                switch (parts[4]) {
                    case "valider" -> valider(ex, id);
                    case "rejeter" -> rejeter(ex, id);
                    default        -> sendJson(ex, 404, "{\"error\":\"Action inconnue\"}");
                }
                return;
            }

            switch (method) {
                case "GET"    -> handleGet(ex);
                case "DELETE" -> handleDelete(ex);
                default       -> sendJson(ex, 405, "{\"error\":\"Methode non autorisee\"}");
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(ex, 500, "{\"error\":\"" + escape(e.getMessage()) + "\"}");
        }
    }

    // ============================================================
    // GET /api/prises-en-charge       → liste
    // GET /api/prises-en-charge/{id}  → détail
    //  pec.lire
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "pec.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");

        if (parts.length == 4) {
            int id = Integer.parseInt(parts[3]);
            PriseEnCharge p = dao.findById(id);
            if (p == null) sendJson(ex, 404, "{\"error\":\"Prise en charge introuvable\"}");
            else           sendJson(ex, 200, gson.toJson(p));
            return;
        }

        if (parts.length == 3) {
            Map<String, String> q = parseQuery(ex.getRequestURI().getQuery());
            String statut         = q.get("statut");
            Integer idPrestation  = toInt(q.get("id_prestation"));

            var liste = dao.findAll(statut, idPrestation);
            sendJson(ex, 200, gson.toJson(liste));
            return;
        }

        sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
    }

    // ============================================================
    // PUT /api/prises-en-charge/{id}/valider
    //  pec.valider
    // ============================================================
    private void valider(HttpExchange ex, int id) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "pec.valider")) return;

        PriseEnCharge pec = dao.findById(id);
        if (pec == null) {
            sendJson(ex, 404, "{\"error\":\"Prise en charge introuvable\"}");
            return;
        }
        if (!"en_attente".equals(pec.statut)) {
            sendJson(ex, 409,
                "{\"error\":\"Impossible de valider une PEC au statut : " + pec.statut + "\"}");
            return;
        }

        dao.updateStatut(id, "validee");
        sendJson(ex, 200, gson.toJson(dao.findById(id)));
    }

    // ============================================================
    // PUT /api/prises-en-charge/{id}/rejeter
    //  pec.valider
    // Body optionnel : { "motif": "..." } (non stocké pour l'instant)
    // ============================================================
    private void rejeter(HttpExchange ex, int id) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "pec.valider")) return;

        PriseEnCharge pec = dao.findById(id);
        if (pec == null) {
            sendJson(ex, 404, "{\"error\":\"Prise en charge introuvable\"}");
            return;
        }
        if (!"en_attente".equals(pec.statut)) {
            sendJson(ex, 409,
                "{\"error\":\"Impossible de rejeter une PEC au statut : " + pec.statut + "\"}");
            return;
        }

        dao.updateStatut(id, "rejetee");
        sendJson(ex, 200, gson.toJson(dao.findById(id)));
    }

    // ============================================================
    // DELETE /api/prises-en-charge/{id}
    //  pec.valider
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "pec.valider")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        boolean ok = dao.delete(id);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
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

    private void sendJson(HttpExchange ex, int code, String json) throws IOException {
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }

    private String escape(String s) { return s == null ? "" : s.replace("\"", "'"); }
}
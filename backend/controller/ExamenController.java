package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.ExamenDAO;
import io.jsonwebtoken.Claims;
import model.Examen;
import security.AuthGuard;
import service.JwtService;

import java.io.*;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Contrôleur HTTP des examens (module "Dossier Patient").
 * CRÉER / LIRE / MODIFIER uniquement — pas de suppression (voir ExamenDAO).
 * Permissions requises : examen.lire / examen.creer / examen.modifier.
 */
public class ExamenController {

    private final ExamenDAO  dao        = new ExamenDAO();
    private final Gson       gson        = new Gson();
    private final JwtService jwtService  = new JwtService();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        try {
            switch (method) {
                case "GET"    -> handleGet(ex);
                case "POST"   -> handlePost(ex);
                case "PUT"    -> handlePut(ex);
                case "DELETE" -> sendJson(ex, 405, "{\"error\":\"Suppression non autorisee pour un examen\"}");
                default       -> sendJson(ex, 405, "{\"error\":\"Methode non autorisee\"}");
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(ex, 500, "{\"error\":\"" + escape(e.getMessage()) + "\"}");
        }
    }

    // ============================================================
    // GET /api/examens?id_patient={id}  → examens d'un patient
    // GET /api/examens/{id}             → un examen
    //  Permission requise : examen.lire
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

        Map<String, String> query = parseQuery(ex.getRequestURI().getRawQuery());
        String idPatientStr = query.get("id_patient");
        if (idPatientStr == null) {
            sendJson(ex, 400, "{\"error\":\"Parametre id_patient requis\"}");
            return;
        }
        List<Examen> liste = dao.findAllByPatient(Integer.parseInt(idPatientStr));
        sendJson(ex, 200, gson.toJson(liste));
    }

    // ============================================================
    // POST /api/examens  → créer un examen
    //  Permission requise : examen.creer
    //  Le médecin (id_medecin) et la structure (id_structure) sont pris du
    //  token JWT de l'utilisateur connecté, jamais du corps de la requête.
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "examen.creer")) return;

        Claims claims = AuthGuard.verifier(ex);
        if (claims == null) return;

        Examen e = gson.fromJson(readBody(ex), Examen.class);
        e.id_medecin   = jwtService.getIdUtilisateur(claims);
        e.id_structure = jwtService.getIdStructure(claims);
        if (e.statut == null || e.statut.isBlank()) e.statut = "en_attente";

        Examen created = dao.insert(e);
        sendJson(ex, 201, gson.toJson(created));
    }

    // ============================================================
    // PUT /api/examens/{id}  → modifier un examen
    //  Permission requise : examen.modifier
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "examen.modifier")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);
        Examen e = gson.fromJson(readBody(ex), Examen.class);
        e.id_examen = id;
        boolean ok = dao.update(e);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Modifie\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ---- Helpers ----

    private Map<String, String> parseQuery(String raw) {
        Map<String, String> map = new java.util.HashMap<>();
        if (raw == null || raw.isEmpty()) return map;
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
            String val = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            map.put(key, val);
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

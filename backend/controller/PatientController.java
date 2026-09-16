// ============================================================
// PatientController.java — Contrôleur HTTP des patients
// ------------------------------------------------------------
// Routes exposées :
//    GET    /api/patients         → liste tous les patients
//    GET    /api/patients/{id}    → renvoie un patient
//    POST   /api/patients         → crée un patient
//    PUT    /api/patients/{id}    → modifie un patient
//    DELETE /api/patients/{id}    → supprime un patient
// ============================================================

package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.PatientDAO;
import model.Patient;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;

public class PatientController {

    private final PatientDAO dao  = new PatientDAO();
    private final Gson       gson = new Gson();

    /** Point d'entrée : dispatch selon la méthode HTTP. */
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
    // GET /api/patients         → liste
    // GET /api/patients/{id}    → un seul
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        // Le path ressemble à "/api/patients" ou "/api/patients/5"
        String[] parts = ex.getRequestURI().getPath().split("/");

        if (parts.length == 3) {
            // /api/patients → liste complète
            List<Patient> liste = dao.findAll();
            sendJson(ex, 200, gson.toJson(liste));

        } else if (parts.length == 4) {
            // /api/patients/{id} → un seul patient
            int id = Integer.parseInt(parts[3]);
            Patient p = dao.findById(id);

            if (p == null) sendJson(ex, 404, "{\"error\":\"Patient introuvable\"}");
            else           sendJson(ex, 200, gson.toJson(p));

        } else {
            sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
        }
    }

    // ============================================================
    // POST /api/patients → création
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {

        // Convertit le JSON reçu en objet Patient
        Patient p = gson.fromJson(readBody(ex), Patient.class);

        int id = dao.insert(p);
        sendJson(ex, 201, "{\"id_patient\":" + id + "}");
    }

    // ============================================================
    // PUT /api/patients/{id} → modification
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        Patient p = gson.fromJson(readBody(ex), Patient.class);
        p.id_patient = id;   // on force l'ID depuis l'URL

        boolean ok = dao.update(p);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Modifie\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // DELETE /api/patients/{id} → suppression
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        boolean ok = dao.delete(id);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // Helpers (identiques à AuthController)
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
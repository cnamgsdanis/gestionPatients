package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.PatientDAO;
import model.Patient;
import security.AuthGuard;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Contrôleur HTTP des patients.
 * Toutes les routes sont protégées par des PERMISSIONS (pas par rôle).
 */
public class PatientController {

    private final PatientDAO dao  = new PatientDAO();
    private final Gson       gson = new Gson();

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
    // GET /api/patients          → liste tous les patients
    // GET /api/patients/{id}     → un patient
    //  Permission requise : patient.lire
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        //  Vérification de la permission
        if (!AuthGuard.verifierPermission(ex, "patient.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        if (parts.length == 3) {
            List<Patient> liste = dao.findAll();
            sendJson(ex, 200, gson.toJson(liste));
        } else if (parts.length == 4) {
            int id = Integer.parseInt(parts[3]);
            Patient p = dao.findById(id);
            if (p == null) sendJson(ex, 404, "{\"error\":\"Patient introuvable\"}");
            else           sendJson(ex, 200, gson.toJson(p));
        } else {
            sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
        }
    }

    // ============================================================
    // POST /api/patients         → créer un patient
    //  Permission requise : patient.creer
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.creer")) return;

        Patient p = gson.fromJson(readBody(ex), Patient.class);
        int id = dao.insert(p);
        sendJson(ex, 201, "{\"id_patient\":" + id + "}");
    }

    // ============================================================
    // PUT /api/patients/{id}     → modifier un patient
    //  Permission requise : patient.modifier
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.modifier")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);
        Patient p = gson.fromJson(readBody(ex), Patient.class);
        p.id_patient = id;
        boolean ok = dao.update(p);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Modifie\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // DELETE /api/patients/{id}  → supprimer un patient
    //  Permission requise : patient.supprimer
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.supprimer")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);
        boolean ok = dao.delete(id);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ---- Helpers ----

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
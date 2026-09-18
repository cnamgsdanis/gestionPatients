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
 *
 * Routes :
 *   GET    /api/patients              → liste         (patient.lire)
 *   GET    /api/patients/{id}         → détail        (patient.lire)
 *   GET    /api/patients/nag/{nag}    → recherche NAG (patient.lire)  — nag = INT
 *   POST   /api/patients              → créer         (patient.creer) → NAG auto (INT)
 *   PUT    /api/patients/{id}         → modifier      (patient.modifier)
 *   DELETE /api/patients/{id}         → supprimer     (patient.supprimer)
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
    // GET /api/patients
    // GET /api/patients/{id}
    // GET /api/patients/nag/{nag}   — nag = entier uniquement
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        // /api/patients           → length 3
        // /api/patients/5         → length 4
        // /api/patients/nag/20260001 → length 5

        if (parts.length == 3) {
            List<Patient> liste = dao.findAll();
            sendJson(ex, 200, gson.toJson(liste));

        } else if (parts.length == 4) {
            int id;
            try {
                id = Integer.parseInt(parts[3]);
            } catch (NumberFormatException e) {
                sendJson(ex, 400, "{\"error\":\"ID invalide\"}");
                return;
            }
            Patient p = dao.findById(id);
            if (p == null) sendJson(ex, 404, "{\"error\":\"Patient introuvable\"}");
            else           sendJson(ex, 200, gson.toJson(p));

        } else if (parts.length == 5 && "nag".equalsIgnoreCase(parts[3])) {
            // ============================================================
            // ENDPOINT FAIT : GET /api/patients/nag/{matricule}
            // ------------------------------------------------------------
            // Recherche un patient par son NAG (entier uniquement).
            // Exemple : GET /api/patients/nag/20260001
            // Permission : patient.lire
            // 400 si le NAG contient des lettres / caractères spéciaux
            // 404 si aucun patient trouvé
            // DAO : PatientDAO.findByNag(int)
            // ============================================================
            int nag;
            try {
                nag = Integer.parseInt(parts[4]);
            } catch (NumberFormatException e) {
                sendJson(ex, 400,
                    "{\"error\":\"NAG invalide : uniquement des chiffres (ex: 20260001)\"}");
                return;
            }
            Patient p = dao.findByNag(nag);
            if (p == null) sendJson(ex, 404, "{\"error\":\"Aucun patient avec ce NAG\"}");
            else           sendJson(ex, 200, gson.toJson(p));

        } else {
            sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
        }
    }

    // ============================================================
    // POST /api/patients — NAG auto (INT), check id_assure_principal
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.creer")) return;

        Patient p = gson.fromJson(readBody(ex), Patient.class);
        if (p == null) {
            sendJson(ex, 400, "{\"error\":\"Body invalide\"}");
            return;
        }

        // NAG jamais fourni par le client (généré côté serveur)
        p.matricule_nag = null;

        if (!validerAssurePrincipal(ex, p.id_assure_principal)) return;

        int id = dao.insert(p);
        sendJson(ex, 201,
            "{\"id_patient\":" + id + ",\"matricule_nag\":" + p.matricule_nag + "}");
    }

    // ============================================================
    // PUT /api/patients/{id} — NAG protégé, check id_assure_principal
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.modifier")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id;
        try {
            id = Integer.parseInt(parts[3]);
        } catch (NumberFormatException e) {
            sendJson(ex, 400, "{\"error\":\"ID invalide\"}");
            return;
        }

        Patient existant = dao.findById(id);
        if (existant == null) {
            sendJson(ex, 404, "{\"error\":\"Patient introuvable\"}");
            return;
        }

        Patient p = gson.fromJson(readBody(ex), Patient.class);
        if (p == null) {
            sendJson(ex, 400, "{\"error\":\"Body invalide\"}");
            return;
        }
        p.id_patient = id;
        // NAG jamais modifiable
        p.matricule_nag = existant.matricule_nag;

        if (!validerAssurePrincipal(ex, p.id_assure_principal)) return;

        boolean ok = dao.update(p);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Modifie\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // DELETE /api/patients/{id}
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.supprimer")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id;
        try {
            id = Integer.parseInt(parts[3]);
        } catch (NumberFormatException e) {
            sendJson(ex, 400, "{\"error\":\"ID invalide\"}");
            return;
        }

        boolean ok = dao.delete(id);
        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // Vérifie que id_assure_principal existe (sinon 400 clair)
    // ============================================================
    private boolean validerAssurePrincipal(HttpExchange ex, Integer idAssure) throws Exception {
        if (idAssure == null) return true; // patient principal : OK

        if (idAssure <= 0) {
            sendJson(ex, 400, "{\"error\":\"id_assure_principal invalide\"}");
            return false;
        }

        Patient parent = dao.findById(idAssure);
        if (parent == null) {
            sendJson(ex, 400,
                "{\"error\":\"Assure principal introuvable (id_assure_principal="
                + idAssure + ")\"}");
            return false;
        }
        return true;
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
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "'")
                .replace("\n", " ")
                .replace("\r", " ");
    }
}

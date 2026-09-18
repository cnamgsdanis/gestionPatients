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
 *   GET    /api/patients                      → liste              (patient.lire)
 *   GET    /api/patients/{id}                 → détail + couverture (patient.lire)
 *   GET    /api/patients/nag/{nag}            → recherche NAG      (patient.lire)
 *   GET    /api/patients/{id}/ayants-droit    → enfants du parent  (patient.lire)
 *   POST   /api/patients                      → créer              (patient.creer)
 *   PUT    /api/patients/{id}                 → modifier           (patient.modifier)
 *   DELETE /api/patients/{id}                 → supprimer          (patient.supprimer)
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
    // GET /api/patients/nag/{nag}   — nag = 10 chiffres uniquement
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        // /api/patients                      → length 3
        // /api/patients/5                    → length 4
        // /api/patients/nag/2026000001       → length 5
        // /api/patients/5/ayants-droit       → length 5

        if (parts.length == 3) {
            List<Patient> liste = dao.findAll();
            sendJson(ex, 200, gson.toJson(liste));

        } else if (parts.length == 5 && "ayants-droit".equalsIgnoreCase(parts[4])) {
            // ######################################################################
            // GET /api/patients/{id}/ayants-droit
            // Liste des personnes SOUS L'AILE de l'assuré principal {id}
            // ######################################################################
            int id;
            try {
                id = Integer.parseInt(parts[3]);
            } catch (NumberFormatException e) {
                sendJson(ex, 400, "{\"error\":\"ID invalide\"}");
                return;
            }
            Patient principal = dao.findById(id);
            if (principal == null) {
                sendJson(ex, 404, "{\"error\":\"Assure principal introuvable\"}");
                return;
            }
            List<Patient> ayants = dao.findAyantsDroit(id);
            sendJson(ex, 200, gson.toJson(ayants));

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
            else           sendJson(ex, 200, gson.toJson(enrichirCouverture(p)));

        } else if (parts.length == 5 && "nag".equalsIgnoreCase(parts[3])) {
            // ============================================================
            // ENDPOINT FAIT : GET /api/patients/nag/{matricule}
            // NAG = INT, EXACTEMENT 10 CHIFFRES. Pas de lettres. Pas de prefixe impose.
            // Exemple : GET /api/patients/nag/2026000001
            // ============================================================
            String brut = parts[4];
            if (brut == null || !brut.matches("[0-9]{10}")) {
                sendJson(ex, 400,
                    "{\"error\":\"NAG invalide : uniquement 10 chiffres (ex: 2026000001)\"}");
                return;
            }
            int nag;
            try {
                nag = Integer.parseInt(brut);
            } catch (NumberFormatException e) {
                sendJson(ex, 400,
                    "{\"error\":\"NAG invalide : trop grand pour un INT (max 2147483647)\"}");
                return;
            }
            Patient p = dao.findByNag(nag);
            if (p == null) sendJson(ex, 404, "{\"error\":\"Aucun patient avec ce NAG\"}");
            else           sendJson(ex, 200, gson.toJson(enrichirCouverture(p)));

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

        if (!validerTelephoneUnique(ex, p.contact, null)) return;
        if (!validerAssurePrincipal(ex, p.id_assure_principal, null)) return;

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

        if (!validerTelephoneUnique(ex, p.contact, id)) return;
        if (!validerAssurePrincipal(ex, p.id_assure_principal, id)) return;

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

    // ######################################################################
    // TELEPHONE UNIQUE
    // Deux patients ne peuvent pas avoir le meme numero.
    // 409 si le contact est deja pris par un autre dossier.
    // ######################################################################
    private boolean validerTelephoneUnique(HttpExchange ex, String contact, Integer idPatientCourant) throws Exception {
        if (contact == null || contact.isBlank()) return true;
        Patient autre = dao.findByContact(contact.trim());
        if (autre != null && (idPatientCourant == null || autre.id_patient != idPatientCourant)) {
            sendJson(ex, 409, "{\"error\":\"Ce numero de telephone est deja utilise\"}");
            return false;
        }
        return true;
    }

    // ######################################################################
    // AYANT DROIT / ASSURE PRINCIPAL
    //
    // Si id_assure_principal est renseigné, ce patient est un AYANT DROIT
    // (ex: enfant). Il utilise l'assurance du PARENT.
    //
    // Interdit :
    //   - parent inexistant
    //   - se désigner soi-même comme parent
    //   - pointer vers un autre ayant droit (le parent doit être PRINCIPAL)
    // ######################################################################
    private boolean validerAssurePrincipal(HttpExchange ex, Integer idAssure, Integer idPatientCourant) throws Exception {
        if (idAssure == null) return true;

        if (idAssure <= 0) {
            sendJson(ex, 400, "{\"error\":\"id_assure_principal invalide\"}");
            return false;
        }
        if (idPatientCourant != null && idAssure.equals(idPatientCourant)) {
            sendJson(ex, 400, "{\"error\":\"Un patient ne peut pas etre son propre assure principal\"}");
            return false;
        }

        Patient parent = dao.findById(idAssure);
        if (parent == null) {
            sendJson(ex, 400,
                "{\"error\":\"Assure principal introuvable (id_assure_principal="
                + idAssure + ")\"}");
            return false;
        }
        if (parent.id_assure_principal != null) {
            sendJson(ex, 400,
                "{\"error\":\"Le patient designe est lui-meme un ayant droit. Choisissez un assure principal.\"}");
            return false;
        }
        return true;
    }

    // ######################################################################
    // Quand on SOIGNE un enfant : fonds_couverture = fonds DU PARENT
    // Quand c'est l'assuré principal : fonds_couverture = son propre fonds
    // ######################################################################
    private Patient enrichirCouverture(Patient p) throws Exception {
        if (p.id_assure_principal == null) {
            p.fonds_couverture = p.fonds;
            p.assure_principal = null;
            return p;
        }
        Patient parent = dao.findById(p.id_assure_principal);
        if (parent == null) {
            p.fonds_couverture = p.fonds;
            p.assure_principal = null;
            return p;
        }
        parent.assure_principal = null;
        parent.fonds_couverture = parent.fonds;
        p.assure_principal = parent;
        p.fonds_couverture = parent.fonds != null ? parent.fonds : p.fonds;
        return p;
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

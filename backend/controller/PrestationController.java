package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.PrestationDAO;
import model.Prestation;
import security.AuthGuard;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

/**
 * Contrôleur HTTP des prestations.
 *
 * Routes :
 *   GET    /api/prestations                     → liste (filtres : ?id_patient, ?id_structure, ?id_utilisateur, ?type, ?date_debut, ?date_fin)
 *   GET    /api/prestations/{id}                → détail
 *   POST   /api/prestations                     → créer
 *   PUT    /api/prestations/{id}                → modifier
 *   DELETE /api/prestations/{id}                → supprimer
 *
 * Permissions :
 *   - prestation.lire      pour GET
 *   - prestation.creer     pour POST
 *   - prestation.modifier  pour PUT
 *   - prestation.supprimer pour DELETE
 */
public class PrestationController {

    private final PrestationDAO dao  = new PrestationDAO();
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

    // ============================================================
    // GET /api/prestations        → liste (filtrable)
    // GET /api/prestations/{id}   → détail
    // 🔐 prestation.lire
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "prestation.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");

        // /api/prestations/{id}
        if (parts.length == 4) {
            int id = Integer.parseInt(parts[3]);
            Prestation p = dao.findById(id);
            if (p == null) sendJson(ex, 404, "{\"error\":\"Prestation introuvable\"}");
            else           sendJson(ex, 200, gson.toJson(p));
            return;
        }

        // /api/prestations?filtres
        if (parts.length == 3) {
            Map<String, String> q = parseQuery(ex.getRequestURI().getQuery());

            Integer idPatient     = toInt(q.get("id_patient"));
            Integer idUtilisateur = toInt(q.get("id_utilisateur"));
            Integer idStructure   = toInt(q.get("id_structure"));
            String  type          = q.get("type");
            String  dateDebut     = q.get("date_debut");
            String  dateFin       = q.get("date_fin");

            List<Prestation> liste = dao.findAll(idPatient, idUtilisateur, idStructure,
                                                 type, dateDebut, dateFin);
            sendJson(ex, 200, gson.toJson(liste));
            return;
        }

        sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
    }

    // ============================================================
    // POST /api/prestations       → créer
    //  prestation.creer
    // ============================================================
    // ============================================================
// POST /api/prestations → créer avec calcul automatique du montant
// et création automatique d'une PEC si le patient est assuré.
// ============================================================
private void handlePost(HttpExchange ex) throws Exception {

    if (!AuthGuard.verifierPermission(ex, "prestation.creer")) return;

    Prestation p = gson.fromJson(readBody(ex), Prestation.class);

    if (p == null) {
        sendJson(ex, 400, "{\"error\":\"Corps vide\"}");
        return;
    }
    if (p.id_patient <= 0) {
        sendJson(ex, 400, "{\"error\":\"id_patient obligatoire\"}");
        return;
    }
    if (p.id_utilisateur <= 0) {
        sendJson(ex, 400, "{\"error\":\"id_utilisateur obligatoire\"}");
        return;
    }
    if (p.id_structure <= 0) {
        sendJson(ex, 400, "{\"error\":\"id_structure obligatoire\"}");
        return;
    }

    List<String> types = List.of("consultation", "examen", "pharmacie", "hospitalisation");
    if (p.type_prestation == null || !types.contains(p.type_prestation)) {
        sendJson(ex, 400,
            "{\"error\":\"type_prestation doit etre : consultation, examen, pharmacie ou hospitalisation\"}");
        return;
    }

    if (p.date_prs == null || p.date_prs.isBlank()) {
        p.date_prs = java.time.LocalDate.now().toString();
    }

    //  CALCUL AUTOMATIQUE DU MONTANT
    if (p.montant == null) {
        if ("consultation".equals(p.type_prestation) || "hospitalisation".equals(p.type_prestation)) {
            // Tarif fixe
            java.math.BigDecimal tarif = service.TarifService.getTarif(p.type_prestation);
            if (tarif == null) {
                sendJson(ex, 400,
                    "{\"error\":\"Aucun tarif defini pour : " + p.type_prestation + "\"}");
                return;
            }
            p.montant = tarif;
        } else {
            // Examen : doit être saisi manuellement pour l'instant
            sendJson(ex, 400,
                "{\"error\":\"montant obligatoire pour le type : " + p.type_prestation + "\"}");
            return;
        }
    }

    // Un assuré suspendu ne peut recevoir aucune prestation
    model.Patient cible = new dao.PatientDAO().findById(p.id_patient);
    if (cible == null) {
        sendJson(ex, 404, "{\"error\":\"Patient introuvable\"}");
        return;
    }
    if (!cible.statut_assure) {
        sendJson(ex, 409, "{\"error\":\"Assure suspendu : aucune prestation possible\"}");
        return;
    }

    // 1. Créer la prestation
    int idPrestation = dao.insert(p);

    // 2. Si le patient est assuré → créer une PEC automatique
    model.PriseEnCharge pec = null;
    try {
        model.Patient patient = new dao.PatientDAO().findById(p.id_patient);
        if (patient != null && patient.statut_assure && patient.fonds != null) {
            java.math.BigDecimal montantPec = service.CouvertureService.calculerMontantPec(p.montant, patient.fonds, p.type_prestation);
            java.math.BigDecimal partPatient = service.CouvertureService.calculerPartPatient(p.montant, patient.fonds, p.type_prestation);

            pec = new model.PriseEnCharge();
            pec.montant_pec    = montantPec;
            pec.date_pec       = java.time.LocalDate.now().toString();
            pec.id_acteur      = p.id_utilisateur;
            pec.statut         = "en_attente";
            pec.id_prestation  = idPrestation;
            pec.part_patient   = partPatient;

            new dao.PriseEnChargeDAO().insert(pec);
        }
    } catch (Exception e) {
        e.printStackTrace();
        // La PEC a échoué mais la prestation est créée → on continue
    }

    // 3. Réponse
    Prestation creee = dao.findById(idPrestation);
    String json = gson.toJson(creee);
    if (pec != null) {
        // Ajoute la PEC dans la réponse
        json = json.substring(0, json.length() - 1)   // enlève le }
             + ",\"prise_en_charge\":" + gson.toJson(pec)
             + "}";
    }
    sendJson(ex, 201, json);
}

    // ============================================================
    // PUT /api/prestations/{id}   → modifier
    //  prestation.modifier
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "prestation.modifier")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        Prestation existant = dao.findById(id);
        if (existant == null) {
            sendJson(ex, 404, "{\"error\":\"Prestation introuvable\"}");
            return;
        }

        Prestation modif = gson.fromJson(readBody(ex), Prestation.class);
        modif.id_prestation = id;

        // Garde les anciennes valeurs si non fournies
        if (modif.montant         == null) modif.montant         = existant.montant;
        if (modif.date_prs        == null) modif.date_prs        = existant.date_prs;
        if (modif.type_prestation == null) modif.type_prestation = existant.type_prestation;
        if (modif.id_patient      <= 0)    modif.id_patient      = existant.id_patient;
        if (modif.id_utilisateur  <= 0)    modif.id_utilisateur  = existant.id_utilisateur;
        if (modif.id_structure    <= 0)    modif.id_structure    = existant.id_structure;

        boolean ok = dao.update(modif);
        if (ok) sendJson(ex, 200, gson.toJson(dao.findById(id)));
        else    sendJson(ex, 500, "{\"error\":\"Echec de la mise a jour\"}");
    }

    // ============================================================
    // DELETE /api/prestations/{id}  → supprimer
    // 🔐 prestation.supprimer
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "prestation.supprimer")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        try {
            boolean ok = dao.delete(id);
            sendJson(ex, ok ? 200 : 404,
                     ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
        } catch (java.sql.SQLException e) {
            // Cas fréquent : une Ordonnance ou Prise_en_charge y est rattachée
            if (e.getMessage().contains("REFERENCE")) {
                sendJson(ex, 409,
                    "{\"error\":\"Impossible de supprimer : des ordonnances ou prises en charge y sont rattachees\"}");
            } else {
                throw e;
            }
        }
    }

    // ============================================================
    // Helpers
    // ============================================================

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
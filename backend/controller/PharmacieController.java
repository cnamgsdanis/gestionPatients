package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.PatientDAO;
import dao.PrestationDAO;
import dao.OrdonnanceDAO;
import dao.PrescriptionDAO;
import model.Ordonnance;
import model.Patient;
import model.Prestation;
import security.AuthGuard;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Contrôleur dédié à la pharmacie.
 *
 * Route principale :
 *   GET /api/pharmacie/recherche?nag=X&date=Y
 *     → Cherche le patient par matricule NAG, trouve sa prestation du jour,
 *       puis renvoie TOUTE l'ordonnance avec l'état des stocks.
 *
 *  Permission : ordonnance.lire
 */
public class PharmacieController {

    private final PatientDAO       patientDAO    = new PatientDAO();
    private final PrestationDAO    prestationDAO = new PrestationDAO();
    private final OrdonnanceDAO    ordonnanceDAO = new OrdonnanceDAO();
    private final PrescriptionDAO  prescriptionDAO = new PrescriptionDAO();
    private final Gson             gson          = new Gson();

    public void handle(HttpExchange ex) throws IOException {
        String path   = ex.getRequestURI().getPath();
        String method = ex.getRequestMethod();

        try {
            if (path.startsWith("/api/pharmacie/recherche") && method.equals("GET")) {
                rechercher(ex);
            } else {
                sendJson(ex, 404, "{\"error\":\"Route inconnue\"}");
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(ex, 500, "{\"error\":\"" + escape(e.getMessage()) + "\"}");
        }
    }

    // ============================================================
    // GET /api/pharmacie/recherche?nag=X&date=Y
    // ============================================================
    private void rechercher(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.lire")) return;

        Map<String, String> params = parseQuery(ex.getRequestURI().getQuery());
        String nag  = params.get("nag");
        String date = params.get("date");

        if (nag == null || nag.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"Parametre 'nag' obligatoire\"}");
            return;
        }
        if (date == null || date.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"Parametre 'date' obligatoire (yyyy-MM-dd)\"}");
            return;
        }

        // 1. Trouver le patient par matricule NAG (texte de 10 chiffres, unique en base)
        if (!nag.matches("[0-9]{10}")) {
            sendJson(ex, 400, "{\"error\":\"NAG invalide : uniquement 10 chiffres\"}");
            return;
        }
        Patient patient = patientDAO.findByNag(nag);
        if (patient == null) {
            sendJson(ex, 404, "{\"error\":\"Aucun patient avec ce matricule NAG\"}");
            return;
        }
        // Un assuré suspendu ne peut recevoir aucune prestation
        if (!patient.statut_assure) {
            sendJson(ex, 409, "{\"error\":\"Assure suspendu : aucune prestation possible\"}");
            return;
        }

        // 2. Trouver les prestations de ce patient à cette date
        List<Prestation> prestations = prestationDAO.findAll(
            patient.id_patient, null, null, null, date, date);

        if (prestations.isEmpty()) {
            sendJson(ex, 404,
                "{\"error\":\"Aucune prestation pour ce patient a cette date\"}");
            return;
        }

        // 3. Récupérer la 1ère ordonnance liée à ces prestations
        Ordonnance ordonnance = null;
        for (Prestation p : prestations) {
            List<Ordonnance> ords = ordonnanceDAO.findAll(patient.id_patient, null, null);
            for (Ordonnance o : ords) {
                if (o.id_prestation == p.id_prestation
                    && !"annulee".equals(o.statut)
                    && !"delivree".equals(o.statut)
                    && !"partiellement_delivree".equals(o.statut)) {
                    ordonnance = o;
                    break;
                }
            }
            if (ordonnance != null) break;
        }

        if (ordonnance == null) {
            sendJson(ex, 404,
                "{\"error\":\"Aucune ordonnance en attente pour ce patient a cette date\"}");
            return;
        }

        // 4. Récupérer les médicaments prescrits avec leurs stocks
        var prescriptions = prescriptionDAO.findByOrdonnance(ordonnance.id_ordonnance);

        // 5. Ajouter un champ calculé "delivrable"
        List<Map<String, Object>> medicamentsAvecEtat = new ArrayList<>();
        for (var p : prescriptions) {
            Map<String, Object> med = new LinkedHashMap<>();
            med.put("id_medicament",     p.id_medicament);
            med.put("nom_medicament",    p.nom_medicament);
            med.put("dosage",            p.dosage);
            med.put("posologie",         p.posologie);
            med.put("quantite_prescrite", p.quantite_prescrite);
            med.put("prix_unitaire",     p.prix_unitaire);
            med.put("stock_disponible",  p.stock_disponible);
            med.put("quantite_delivree", p.quantite_delivree);
            med.put("statut_delivrance", p.statut_delivrance);

            // État de délivrabilité
            if (p.stock_disponible >= p.quantite_prescrite) {
                med.put("etat", "disponible");
                med.put("quantite_max", p.quantite_prescrite);
            } else if (p.stock_disponible > 0) {
                med.put("etat", "partiel");
                med.put("quantite_max", p.stock_disponible);
            } else {
                med.put("etat", "rupture");
                med.put("quantite_max", 0);
            }
            medicamentsAvecEtat.add(med);
        }

        // 6. Réponse complète
        Map<String, Object> reponse = new LinkedHashMap<>();
        reponse.put("patient",     patient);
        reponse.put("ordonnance",  ordonnance);
        reponse.put("medicaments", medicamentsAvecEtat);

        sendJson(ex, 200, gson.toJson(reponse));
    }

    // ---- Helpers ----

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
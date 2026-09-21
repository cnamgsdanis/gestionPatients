package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.OrdonnanceDAO;
import model.Ordonnance;
import security.AuthGuard;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

/**
 * Contrôleur HTTP des ordonnances.
 *
 * Routes :
 * GET /api/ordonnances → liste (filtres : ?id_patient, ?id_medecin, ?statut)
 * GET /api/ordonnances/{id} → détail
 * GET /api/ordonnances/code/{code} → par code retrait
 * POST /api/ordonnances → créer
 * PUT /api/ordonnances/{id} → modifier
 * DELETE /api/ordonnances/{id} → annuler
 * PUT /api/ordonnances/{id}/signer-medecin → signer (médecin)
 * PUT /api/ordonnances/{id}/cachet-medecin → apposer cachet
 * PUT /api/ordonnances/{id}/signer-patient → signature patient
 * PUT /api/ordonnances/{id}/statut → changer statut
 * PUT /api/ordonnances/{id}/delivrer → délivrer (pharmacien)
 */
public class OrdonnanceController {

    private final OrdonnanceDAO dao = new OrdonnanceDAO();
    private final Gson gson = new Gson();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String path = ex.getRequestURI().getPath();

        try {
            String[] parts = path.split("/");

            // Route /api/ordonnances/code/{code}
            if (parts.length == 5 && parts[3].equals("code") && method.equals("GET")) {
                parCode(ex, parts[4]);
                return;
            }

            // Routes /api/ordonnances/{id}/medicaments ou
            // /api/ordonnances/{id}/medicaments/{idMed}
            if (parts.length >= 5 && parts[3].matches("\\d+") && parts[4].equals("medicaments")) {
                int idOrd = Integer.parseInt(parts[3]);
                if (method.equals("GET")) {
                    listerPrescriptions(ex, idOrd);
                } else if (method.equals("POST")) {
                    ajouterMedicament(ex, idOrd);
                } else if (method.equals("DELETE") && parts.length == 6) {
                    retirerMedicament(ex, idOrd, Integer.parseInt(parts[5]));
                } else {
                    sendJson(ex, 405, "{\"error\":\"Methode non autorisee\"}");
                }
                return;
            }

            // Routes /api/ordonnances/{id}/{action}
            if (parts.length == 5 && method.equals("PUT")) {
                int id = Integer.parseInt(parts[3]);
                switch (parts[4]) {
                    case "signer-medecin" -> signerMedecin(ex, id);
                    case "cachet-medecin" -> apposerCachet(ex, id);
                    case "signer-patient" -> signerPatient(ex, id);
                    case "statut" -> changerStatut(ex, id);
                    case "delivrer" -> delivrer(ex, id);
                    default -> sendJson(ex, 404, "{\"error\":\"Action inconnue\"}");
                }
                return;
            }

            switch (method) {
                case "GET" -> handleGet(ex);
                case "POST" -> handlePost(ex);
                case "PUT" -> handlePut(ex);
                case "DELETE" -> handleDelete(ex);
                default -> sendJson(ex, 405, "{\"error\":\"Methode non autorisee\"}");
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(ex, 500, "{\"error\":\"" + escape(e.getMessage()) + "\"}");
        }
    }

    // ============================================================
    // GET /api/ordonnances → liste (filtrable)
    // GET /api/ordonnances/{id} → détail
    // ordonnance.lire
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.lire"))
            return;

        String[] parts = ex.getRequestURI().getPath().split("/");

        // /api/ordonnances/{id}
        if (parts.length == 4) {
            int id = Integer.parseInt(parts[3]);
            Ordonnance o = dao.findById(id);
            if (o == null)
                sendJson(ex, 404, "{\"error\":\"Ordonnance introuvable\"}");
            else
                sendJson(ex, 200, gson.toJson(o));
            return;
        }

        // /api/ordonnances (avec filtres)
        if (parts.length == 3) {
            Map<String, String> params = parseQuery(ex.getRequestURI().getQuery());

            Integer idPatient = toInt(params.get("id_patient"));
            Integer idMedecin = toInt(params.get("id_medecin"));
            String statut = params.get("statut");

            List<Ordonnance> liste = dao.findAll(idPatient, idMedecin, statut);
            sendJson(ex, 200, gson.toJson(liste));
            return;
        }

        sendJson(ex, 400, "{\"error\":\"Route invalide\"}");
    }

    // ============================================================
    // GET /api/ordonnances/code/{code} → par code retrait
    // ordonnance.lire
    // ============================================================
    private void parCode(HttpExchange ex, String code) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "ordonnance.lire"))
            return;

        Ordonnance o = dao.findByCodeRetrait(code);
        if (o == null)
            sendJson(ex, 404, "{\"error\":\"Aucune ordonnance avec ce code\"}");
        else
            sendJson(ex, 200, gson.toJson(o));
    }

    // ============================================================
    // POST /api/ordonnances → créer
    // ordonnance.creer
    // ============================================================
    // ============================================================
    // POST /api/ordonnances → créer (avec ou sans médicaments)
    // 🔐 ordonnance.creer
    //
    // Body option 1 (sans médicaments) :
    // { "id_prestation": 9, "id_utilisateur": 2002 }
    //
    // Body option 2 (avec médicaments) :
    // {
    // "id_prestation": 9,
    // "id_utilisateur": 2002,
    // "medicaments": [
    // { "id_medicament": 1, "posologie": "1 cp 3x/j", "quantite_prescrite": 21 }
    // ]
    // }
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.creer"))
            return;

        Ordonnance o = gson.fromJson(readBody(ex), Ordonnance.class);

        if (o == null || o.id_prestation <= 0) {
            sendJson(ex, 400, "{\"error\":\"id_prestation obligatoire\"}");
            return;
        }
        if (o.id_utilisateur <= 0) {
            sendJson(ex, 400, "{\"error\":\"id_utilisateur obligatoire\"}");
            return;
        }

        // Valeurs par défaut
        if (o.date_ordonnance == null || o.date_ordonnance.isBlank()) {
            o.date_ordonnance = LocalDate.now().toString();
        }
        if (o.statut == null || o.statut.isBlank()) {
            o.statut = "en_attente";
        }
        if (o.code_retrait == null || o.code_retrait.isBlank()) {
            o.code_retrait = genererCodeRetrait();
        }

        // Validation des médicaments fournis
        if (o.medicaments != null) {
            for (model.Prescription p : o.medicaments) {
                if (p.id_medicament <= 0) {
                    sendJson(ex, 400, "{\"error\":\"Chaque medicament doit avoir un id_medicament\"}");
                    return;
                }
            }
        }

        // Insertion (transactionnelle si médicaments fournis)
        int id = dao.insertAvecMedicaments(o);

        // Renvoie l'ordonnance complète (avec patient_nom, medecin_nom et
        // prescriptions)
        Ordonnance creee = dao.findById(id);
        sendJson(ex, 201, gson.toJson(creee));
    }

    // ============================================================
    // PUT /api/ordonnances/{id} → modifier
    // ordonnance.modifier
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.modifier"))
            return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        Ordonnance existant = dao.findById(id);
        if (existant == null) {
            sendJson(ex, 404, "{\"error\":\"Ordonnance introuvable\"}");
            return;
        }

        Ordonnance modif = gson.fromJson(readBody(ex), Ordonnance.class);
        modif.id_ordonnance = id;

        // Garde les anciennes valeurs si non fournies
        if (modif.date_ordonnance == null)
            modif.date_ordonnance = existant.date_ordonnance;
        if (modif.statut == null)
            modif.statut = existant.statut;
        if (modif.id_prestation <= 0)
            modif.id_prestation = existant.id_prestation;
        if (modif.id_utilisateur <= 0)
            modif.id_utilisateur = existant.id_utilisateur;
        if (modif.signature_medecin == null)
            modif.signature_medecin = existant.signature_medecin;
        if (modif.cachet_medecin == null)
            modif.cachet_medecin = existant.cachet_medecin;
        if (modif.signature_patient == null)
            modif.signature_patient = existant.signature_patient;
        if (modif.code_retrait == null)
            modif.code_retrait = existant.code_retrait;

        boolean ok = dao.update(modif);
        if (ok)
            sendJson(ex, 200, gson.toJson(dao.findById(id)));
        else
            sendJson(ex, 500, "{\"error\":\"Echec de la mise a jour\"}");
    }

    // ============================================================
    // DELETE /api/ordonnances/{id} → annuler
    // ordonnance.annuler
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.annuler"))
            return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        int id = Integer.parseInt(parts[3]);

        boolean ok = dao.delete(id);
        sendJson(ex, ok ? 200 : 404,
                ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // PUT /api/ordonnances/{id}/signer-medecin → signature médecin
    // ordonnance.signer
    // Body : { "signature": "/path/to/image.png" }
    // ============================================================
    private void signerMedecin(HttpExchange ex, int id) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.signer"))
            return;

        Map<String, String> body = gson.fromJson(readBody(ex), Map.class);
        String signature = body.get("signature");
        if (signature == null || signature.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"champ signature obligatoire\"}");
            return;
        }

        dao.updateChamp(id, "signature_medecin", signature);
        sendJson(ex, 200, gson.toJson(dao.findById(id)));
    }

    // ============================================================
    // PUT /api/ordonnances/{id}/cachet-medecin → cachet médecin
    // ordonnance.signer
    // ============================================================
    private void apposerCachet(HttpExchange ex, int id) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.signer"))
            return;

        Map<String, String> body = gson.fromJson(readBody(ex), Map.class);
        String cachet = body.get("cachet");
        if (cachet == null || cachet.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"champ cachet obligatoire\"}");
            return;
        }

        dao.updateChamp(id, "cachet_medecin", cachet);
        sendJson(ex, 200, gson.toJson(dao.findById(id)));
    }

    // ============================================================
    // PUT /api/ordonnances/{id}/signer-patient → signature patient
    // ordonnance.modifier
    // ============================================================
    private void signerPatient(HttpExchange ex, int id) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.modifier"))
            return;

        Map<String, String> body = gson.fromJson(readBody(ex), Map.class);
        String signature = body.get("signature");
        if (signature == null || signature.isBlank()) {
            sendJson(ex, 400, "{\"error\":\"champ signature obligatoire\"}");
            return;
        }

        dao.updateChamp(id, "signature_patient", signature);
        sendJson(ex, 200, gson.toJson(dao.findById(id)));
    }

    // ============================================================
    // PUT /api/ordonnances/{id}/statut → changer statut
    // ordonnance.modifier
    // Body : { "statut": "validee" }
    // ============================================================
    private void changerStatut(HttpExchange ex, int id) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.modifier"))
            return;

        Map<String, String> body = gson.fromJson(readBody(ex), Map.class);
        String statut = body.get("statut");

        List<String> valides = List.of("en_attente", "validee", "envoyee", "partiellement_delivree", "delivree", "annulee");
        if (statut == null || !valides.contains(statut)) {
            sendJson(ex, 400,
                    "{\"error\":\"statut doit etre : en_attente, validee, envoyee, delivree ou annulee\"}");
            return;
        }

        dao.updateChamp(id, "statut", statut);
        sendJson(ex, 200, gson.toJson(dao.findById(id)));
    }

    // ============================================================
    // PUT /api/ordonnances/{id}/delivrer → délivrer (pharmacien)
    // ordonnance.delivrer
    // Body : { "code_retrait": "ABC123" }
    // ============================================================
    // ============================================================
    // PUT /api/ordonnances/{id}/delivrer
    // À la délivrance :
    // 1. Vérifie le code retrait + statut
    // 2. Calcule le total des médicaments (prix × quantité)
    // 3. Crée une nouvelle Prestation type "pharmacie"
    // 4. Crée une PEC si le patient est assuré
    // 5. Décrémente les stocks
    // 6. Passe le statut à "delivree" et lie la prestation pharmacie
    // ============================================================
    // ============================================================
    // PUT /api/ordonnances/{id}/delivrer
    // Délivrance partielle ou totale selon les médicaments fournis.
    // Body :
    // {
    // "medicaments_delivres": [
    // { "id_medicament": 1, "quantite_delivree": 21 },
    // { "id_medicament": 4, "quantite_delivree": 5 }
    // ]
    // }
    // ============================================================
    private void delivrer(HttpExchange ex, int id) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.delivrer"))
            return;

        Ordonnance o = dao.findById(id);
        if (o == null) {
            sendJson(ex, 404, "{\"error\":\"Ordonnance introuvable\"}");
            return;
        }
        if ("delivree".equals(o.statut) || "annulee".equals(o.statut)) {
            sendJson(ex, 409, "{\"error\":\"Ordonnance deja " + o.statut + "\"}");
            return;
        }

        // 1. Parser le body
        Map<String, Object> body = gson.fromJson(readBody(ex), Map.class);
        List<Map<String, Object>> medsDelivres = (List<Map<String, Object>>) body.get("medicaments_delivres");

        if (medsDelivres == null || medsDelivres.isEmpty()) {
            sendJson(ex, 400, "{\"error\":\"Aucun medicament fourni dans 'medicaments_delivres'\"}");
            return;
        }

        // 2. Récupérer toutes les prescriptions de l'ordonnance
        var prescriptionDAO = new dao.PrescriptionDAO();
        var medicamentDAO = new dao.MedicamentDAO();
        var toutesPrescriptions = prescriptionDAO.findByOrdonnance(id);
        if (toutesPrescriptions.isEmpty()) {
            sendJson(ex, 409, "{\"error\":\"Aucun medicament prescrit\"}");
            return;
        }

        // 3. Map : id_medicament → quantité délivrée
        Map<Integer, Integer> mapDelivres = new HashMap<>();
        for (Map<String, Object> m : medsDelivres) {
            int idMed = ((Number) m.get("id_medicament")).intValue();
            int qte = ((Number) m.get("quantite_delivree")).intValue();
            mapDelivres.put(idMed, qte);
        }

        // 4. Calculer le total, marquer chaque prescription, décrémenter le stock
        java.math.BigDecimal total = java.math.BigDecimal.ZERO;
        int totalPrescrit = 0;
        int totalDelivre = 0;
        int medsComplets = 0;
        int medsPartiels = 0;
        int medsNonDelivres = 0;

        for (var p : toutesPrescriptions) {
            totalPrescrit++;
            Integer qteDemandee = mapDelivres.get(p.id_medicament);

            if (qteDemandee == null || qteDemandee <= 0) {
                // Non délivré
                prescriptionDAO.marquerDelivre(id, p.id_medicament, 0, "non_delivre");
                medsNonDelivres++;
                continue;
            }

            // Vérifier qu'on ne dépasse pas le stock
            if (qteDemandee > p.stock_disponible) {
                qteDemandee = p.stock_disponible;
            }

            // Déterminer le statut
            String statut;
            if (qteDemandee >= p.quantite_prescrite) {
                statut = "delivre";
                medsComplets++;
            } else if (qteDemandee > 0) {
                statut = "partiel";
                medsPartiels++;
            } else {
                statut = "non_delivre";
                medsNonDelivres++;
            }

            // Marquer + décrémenter
            prescriptionDAO.marquerDelivre(id, p.id_medicament, qteDemandee, statut);
            medicamentDAO.decrementerStock(p.id_medicament, qteDemandee);

            // Calculer le montant (prix × quantité réellement délivrée)
            java.math.BigDecimal prix = medicamentDAO.getPrix(p.id_medicament);
            total = total.add(prix.multiply(java.math.BigDecimal.valueOf(qteDemandee)));
            totalDelivre += qteDemandee;
        }

        // 5. Déterminer le statut global de l'ordonnance
        String statutGlobal;
        if (medsComplets == totalPrescrit) {
            statutGlobal = "delivree";
        } else if (medsNonDelivres == totalPrescrit) {
            statutGlobal = "envoyee"; // rien délivré → reste en attente
        } else {
            statutGlobal = "partiellement_delivree";
        }

        // 6. Créer la prestation pharmacie avec le montant calculé
        var claims = AuthGuard.verifier(ex);
        if (claims == null)
            return;
        int idPharmacien = AuthGuard.getIdUtilisateur(claims);
        int idStructure = AuthGuard.getIdStructure(claims);
        var prestationOrigine = new dao.PrestationDAO().findById(o.id_prestation);
        int idPatient = prestationOrigine.id_patient;

        model.Prestation prestaPharma = new model.Prestation();
        prestaPharma.montant = total;
        prestaPharma.date_prs = java.time.LocalDate.now().toString();
        prestaPharma.type_prestation = "pharmacie";
        prestaPharma.id_patient = idPatient;
        prestaPharma.id_utilisateur = idPharmacien;
        prestaPharma.id_structure = idStructure;

        int idPrestaPharma = new dao.PrestationDAO().insert(prestaPharma);

        // 7. PEC si patient assuré
        try {
            model.Patient patient = new dao.PatientDAO().findById(idPatient);
            if (patient != null && patient.statut_assure && patient.fonds != null) {
                model.PriseEnCharge pec = new model.PriseEnCharge();
                pec.montant_pec = service.CouvertureService.calculerMontantPec(total, patient.fonds, "pharmacie");
                pec.date_pec = java.time.LocalDate.now().toString();
                pec.id_acteur = idPharmacien;
                pec.statut = "en_attente";
                pec.id_prestation = idPrestaPharma;
                pec.part_patient = service.CouvertureService.calculerPartPatient(total, patient.fonds, "pharmacie");
                new dao.PriseEnChargeDAO().insert(pec);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // 8. Mettre à jour l'ordonnance (statut + lien prestation)
        String sql = "UPDATE Ordonnance SET statut = ?, id_prestation_pharmacie = ? " +
                "WHERE id_ordonnance = ?";
        try (var c = db.Database.getConnection();
                var ps = c.prepareStatement(sql)) {
            ps.setString(1, statutGlobal);
            ps.setInt(2, idPrestaPharma);
            ps.setInt(3, id);
            ps.executeUpdate();
        }

        // 9. Réponse enrichie
        Map<String, Object> reponse = new LinkedHashMap<>();
        reponse.put("message", "Delivrance effectuee");
        reponse.put("statut_ordonnance", statutGlobal);
        reponse.put("montant_total", total);
        reponse.put("medicaments_delivres", medsComplets);
        reponse.put("medicaments_partiels", medsPartiels);
        reponse.put("medicaments_rupture", medsNonDelivres);
        reponse.put("id_prestation_pharmacie", idPrestaPharma);

        sendJson(ex, 200, gson.toJson(reponse));
    }

    // ============================================================
    // Générateur de code de retrait unique (8 caractères)
    // ============================================================
    private String genererCodeRetrait() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I,O,0,1
        StringBuilder sb = new StringBuilder();
        Random rnd = new Random();
        for (int i = 0; i < 8; i++) {
            sb.append(chars.charAt(rnd.nextInt(chars.length())));
        }
        return sb.toString();
    }

    // ============================================================
    // Helpers
    // ============================================================

    private Integer toInt(String s) {
        if (s == null || s.isBlank())
            return null;
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Map<String, String> parseQuery(String query) {
        Map<String, String> map = new HashMap<>();
        if (query == null || query.isBlank())
            return map;
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
            while ((ligne = br.readLine()) != null)
                sb.append(ligne);
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

    // ============================================================
    // GET /api/ordonnances/{id}/medicaments → liste des médicaments prescrits
    // ordonnance.lire
    // ============================================================
    private void listerPrescriptions(HttpExchange ex, int idOrd) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.lire"))
            return;

        var liste = new dao.PrescriptionDAO().findByOrdonnance(idOrd);
        sendJson(ex, 200, gson.toJson(liste));
    }

    // ============================================================
    // POST /api/ordonnances/{id}/medicaments → ajouter un médicament
    // Body : { "id_medicament": 1, "posologie": "...", "quantite_prescrite": 21 }
    // ordonnance.modifier
    // ============================================================
    private void ajouterMedicament(HttpExchange ex, int idOrd) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.modifier"))
            return;

        // Vérifie que l'ordonnance existe
        model.Ordonnance o = dao.findById(idOrd);
        if (o == null) {
            sendJson(ex, 404, "{\"error\":\"Ordonnance introuvable\"}");
            return;
        }
        if ("delivree".equals(o.statut) || "annulee".equals(o.statut)) {
            sendJson(ex, 409, "{\"error\":\"Impossible de modifier une ordonnance " + o.statut + "\"}");
            return;
        }

        model.Prescription p = gson.fromJson(readBody(ex), model.Prescription.class);
        if (p == null || p.id_medicament <= 0) {
            sendJson(ex, 400, "{\"error\":\"id_medicament obligatoire\"}");
            return;
        }
        p.id_ordonnance = idOrd;
        if (p.quantite_prescrite <= 0)
            p.quantite_prescrite = 1;

        new dao.PrescriptionDAO().upsert(p);

        var liste = new dao.PrescriptionDAO().findByOrdonnance(idOrd);
        sendJson(ex, 201, gson.toJson(liste));
    }

    // ============================================================
    // DELETE /api/ordonnances/{id}/medicaments/{idMedicament}
    // ordonnance.modifier
    // ============================================================
    private void retirerMedicament(HttpExchange ex, int idOrd, int idMed) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "ordonnance.modifier"))
            return;

        boolean ok = new dao.PrescriptionDAO().delete(idOrd, idMed);
        sendJson(ex, ok ? 200 : 404,
                ok ? "{\"message\":\"Medicament retire\"}" : "{\"error\":\"Non trouve\"}");
    }
}
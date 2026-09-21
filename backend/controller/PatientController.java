package controller;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import dao.PatientDAO;
import io.jsonwebtoken.Claims;
import model.Patient;
import security.AuthGuard;
import service.Audit;
import service.Http;

import java.io.IOException;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/**
 * Contrôleur HTTP des patients (= assurés).
 *
 * Routes :
 *   GET    /api/patients                      → liste              (patient.lire)
 *   GET    /api/patients/{id}                 → détail + couverture (patient.lire)
 *   GET    /api/patients/nag/{nag}            → recherche NAG      (patient.lire)
 *   GET    /api/patients/{id}/ayants-droit    → enfants du parent  (patient.lire)
 *   POST   /api/patients                      → créer              (patient.creer)
 *   PUT    /api/patients/{id}                 → modifier           (patient.modifier)
 *   DELETE /api/patients/{id}                 → supprimer          (patient.supprimer)
 *
 * NAG : texte de 10 chiffres exactement (colonne NVARCHAR(20) + CK_Patient_nag_10).
 *   - GET /api/patients/nag/{nag} : refus 400 si ce n'est pas 10 chiffres.
 *   - POST : le NAG peut être fourni (assuré déjà immatriculé) ; sinon il est généré.
 *   - PUT : le NAG n'est jamais modifiable.
 *
 * Statut : « statut_assure » (BIT) = actif (true) / SUSPENDU (false). L'API expose aussi
 * « statut » ("actif" | "suspendu") et l'accepte en entrée. Un assuré suspendu ne peut
 * recevoir aucune prestation (voir FeuilleController).
 *
 * Nature : colonne « nature » (texte) = "Assuré principal" | "Ayant droit" | "Conjoint" ;
 * l'API expose aussi « nature_assure » (1, 2 ou 3) et accepte le code ou le texte en entrée.
 */
public class PatientController {

    private final PatientDAO dao = new PatientDAO();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        try {
            switch (method) {
                case "GET"    -> handleGet(ex);
                case "POST"   -> handlePost(ex);
                case "PUT"    -> handlePut(ex);
                case "DELETE" -> handleDelete(ex);
                default       -> Http.error(ex, 405, "Methode non autorisee");
            }
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, e.getMessage());
        }
    }

    // ============================================================
    // GET
    // ============================================================
    private void handleGet(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.lire")) return;

        String[] parts = ex.getRequestURI().getPath().split("/");
        // /api/patients                      → length 3
        // /api/patients/5                    → length 4
        // /api/patients/nag/2345678901       → length 5
        // /api/patients/5/ayants-droit       → length 5

        if (parts.length == 3) {
            List<Patient> liste = dao.findAll();
            Http.json(ex, 200, liste);

        } else if (parts.length == 5 && "ayants-droit".equalsIgnoreCase(parts[4])) {
            Integer id = entier(ex, parts[3]);
            if (id == null) return;
            Patient principal = dao.findById(id);
            if (principal == null) {
                Http.error(ex, 404, "Assure principal introuvable");
                return;
            }
            Http.json(ex, 200, dao.findAyantsDroit(id));

        } else if (parts.length == 4) {
            Integer id = entier(ex, parts[3]);
            if (id == null) return;
            Patient p = dao.findById(id);
            if (p == null) Http.error(ex, 404, "Patient introuvable");
            else Http.json(ex, 200, enrichirCouverture(p));

        } else if (parts.length == 5 && "nag".equalsIgnoreCase(parts[3])) {
            String nag = parts[4];
            if (nag == null || !nag.matches("[0-9]{10}")) {
                Http.error(ex, 400, "NAG invalide : uniquement 10 chiffres (ex: 2345678901)");
                return;
            }
            Patient p = dao.findByNag(nag);
            if (p == null) Http.error(ex, 404, "Aucun patient avec ce NAG");
            else Http.json(ex, 200, enrichirCouverture(p));

        } else {
            Http.error(ex, 400, "Route invalide");
        }
    }

    // ============================================================
    // POST /api/patients
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.creer")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);

        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject()) { Http.error(ex, 400, "Body invalide"); return; }
        JsonObject b = el.getAsJsonObject();

        Patient p = new Patient();
        appliquer(b, p);
        // Un assuré créé sans statut est ACTIF
        if (!b.has("statut") && !b.has("statut_assure")) p.statut_assure = true;

        if (blank(p.prenom) || blank(p.nom)) { Http.error(ex, 400, "prenom et nom obligatoires"); return; }
        if (!"M".equals(p.sex) && !"F".equals(p.sex)) { Http.error(ex, 400, "sex doit valoir 'M' ou 'F'"); return; }
        if (p.fonds != null && (p.fonds < 1 || p.fonds > 4)) { Http.error(ex, 400, "fonds doit valoir 1, 2, 3 ou 4"); return; }
        if (!validerNagFourni(ex, p.matricule_nag, null)) return;
        if (!validerTelephoneUnique(ex, p.contact, null)) return;
        if (!validerAssurePrincipal(ex, p.id_assure_principal, null)) return;

        int id;
        try {
            id = dao.insert(p);
        } catch (SQLException e) {
            if (e.getErrorCode() == 2627 || e.getErrorCode() == 2601) { Http.error(ex, 409, "NAG ou téléphone déjà utilisé"); return; }
            throw e;
        }
        Audit.ok(ex, acteur, "ASSURE", "patient.creer", "Assuré créé", "Patient", id, p.prenom + " " + p.nom, p.matricule_nag, null,
            Map.of("statut", p.statut_assure ? "actif" : "suspendu", "nature", String.valueOf(p.nature)));
        Http.raw(ex, 201, "{\"id_patient\":" + id + ",\"matricule_nag\":\"" + p.matricule_nag + "\"}");
    }

    // ============================================================
    // PUT /api/patients/{id} — les champs ABSENTS du corps restent inchangés ; le NAG est protégé
    // ============================================================
    private void handlePut(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.modifier")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);

        String[] parts = ex.getRequestURI().getPath().split("/");
        Integer id = entier(ex, parts.length > 3 ? parts[3] : "");
        if (id == null) return;

        Patient existant = dao.findById(id);
        if (existant == null) { Http.error(ex, 404, "Patient introuvable"); return; }

        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject()) { Http.error(ex, 400, "Body invalide"); return; }
        JsonObject b = el.getAsJsonObject();

        Patient p = dao.findById(id);          // copie de travail : on part de l'existant
        appliquer(b, p);
        p.id_patient = id;
        p.matricule_nag = existant.matricule_nag;   // NAG jamais modifiable

        if (blank(p.prenom) || blank(p.nom)) { Http.error(ex, 400, "prenom et nom obligatoires"); return; }
        if (!"M".equals(p.sex) && !"F".equals(p.sex)) { Http.error(ex, 400, "sex doit valoir 'M' ou 'F'"); return; }
        if (p.fonds != null && (p.fonds < 1 || p.fonds > 4)) { Http.error(ex, 400, "fonds doit valoir 1, 2, 3 ou 4"); return; }
        if (!validerTelephoneUnique(ex, p.contact, id)) return;
        if (!validerAssurePrincipal(ex, p.id_assure_principal, id)) return;

        boolean ok;
        try {
            ok = dao.update(p);
        } catch (SQLException e) {
            if (e.getErrorCode() == 2627 || e.getErrorCode() == 2601) { Http.error(ex, 409, "Téléphone déjà utilisé"); return; }
            throw e;
        }
        if (ok) {
            boolean statutChange = existant.statut_assure != p.statut_assure;
            Audit.ok(ex, acteur, "ASSURE", statutChange ? (p.statut_assure ? "patient.reactiver" : "patient.suspendre") : "patient.modifier",
                statutChange ? (p.statut_assure ? "Assuré réactivé" : "Assuré suspendu") : "Assuré modifié",
                "Patient", id, p.prenom + " " + p.nom, p.matricule_nag,
                Map.of("statut", existant.statut_assure ? "actif" : "suspendu"), Map.of("statut", p.statut_assure ? "actif" : "suspendu"));
        }
        Http.raw(ex, ok ? 200 : 404, ok ? "{\"message\":\"Modifie\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ============================================================
    // DELETE /api/patients/{id}
    // ============================================================
    private void handleDelete(HttpExchange ex) throws Exception {

        if (!AuthGuard.verifierPermission(ex, "patient.supprimer")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);

        String[] parts = ex.getRequestURI().getPath().split("/");
        Integer id = entier(ex, parts.length > 3 ? parts[3] : "");
        if (id == null) return;

        Patient existant = dao.findById(id);
        boolean ok;
        try {
            ok = dao.delete(id);
        } catch (SQLException e) {
            if (e.getErrorCode() == 547) {
                Http.error(ex, 409, "Ce patient a des prestations, feuilles ou ayants droit : suppression impossible.");
                return;
            }
            throw e;
        }
        if (ok && existant != null) {
            Audit.ok(ex, acteur, "ASSURE", "patient.supprimer", "Assuré supprimé", "Patient", id, existant.prenom + " " + existant.nom,
                existant.matricule_nag, null, null);
        }
        Http.raw(ex, ok ? 200 : 404, ok ? "{\"message\":\"Supprime\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ------------------------------------------------------------
    // Reporte sur le patient les champs PRÉSENTS dans le corps JSON
    // ------------------------------------------------------------
    private void appliquer(JsonObject b, Patient p) {
        if (b.has("photo_url"))      p.photo_url = texte(b, "photo_url");
        if (b.has("prenom"))         p.prenom = texte(b, "prenom");
        if (b.has("nom"))            p.nom = texte(b, "nom");
        if (b.has("sex"))            p.sex = texte(b, "sex");
        if (b.has("contact"))        p.contact = texte(b, "contact");
        if (b.has("adresse"))        p.adresse = texte(b, "adresse");
        if (b.has("date_naissance")) p.date_naissance = texte(b, "date_naissance");
        if (b.has("fonds"))          p.fonds = b.get("fonds").isJsonNull() ? null : b.get("fonds").getAsInt();
        if (b.has("id_assure_principal")) p.id_assure_principal = b.get("id_assure_principal").isJsonNull() ? null : b.get("id_assure_principal").getAsInt();
        if (b.has("matricule_nag"))  p.matricule_nag = texte(b, "matricule_nag");
        if (b.has("statut_assure"))  p.statut_assure = b.get("statut_assure").getAsBoolean();
        if (b.has("statut")) {
            String s = texte(b, "statut");
            p.statut_assure = s != null && !s.toLowerCase().contains("susp");
        }
        if (b.has("nature") || b.has("nature_assure")) {
            String brut = b.has("nature") ? texte(b, "nature") : texte(b, "nature_assure");
            p.nature = Patient.natureCanonique(brut);
        }
    }

    private static String texte(JsonObject b, String cle) {
        return b.get(cle).isJsonNull() ? null : b.get(cle).getAsString();
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }

    private Integer entier(HttpExchange ex, String s) throws IOException {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            Http.error(ex, 400, "ID invalide");
            return null;
        }
    }

    // ######################################################################
    // NAG fourni à la création : 10 chiffres, non déjà attribué (409 sinon).
    // ######################################################################
    private boolean validerNagFourni(HttpExchange ex, String nag, Integer idCourant) throws Exception {
        if (nag == null || nag.isBlank()) return true;   // sera généré
        if (!nag.matches("[0-9]{10}")) {
            Http.error(ex, 400, "NAG invalide : uniquement 10 chiffres (ex: 2345678901)");
            return false;
        }
        Patient autre = dao.findByNag(nag);
        if (autre != null && (idCourant == null || autre.id_patient != idCourant)) {
            Http.error(ex, 409, "Ce NAG est deja attribue a un autre assure");
            return false;
        }
        return true;
    }

    // ######################################################################
    // TELEPHONE UNIQUE : deux patients ne peuvent pas avoir le meme numero (409).
    // ######################################################################
    private boolean validerTelephoneUnique(HttpExchange ex, String contact, Integer idPatientCourant) throws Exception {
        if (contact == null || contact.isBlank()) return true;
        Patient autre = dao.findByContact(contact.trim());
        if (autre != null && (idPatientCourant == null || autre.id_patient != idPatientCourant)) {
            Http.error(ex, 409, "Ce numero de telephone est deja utilise");
            return false;
        }
        return true;
    }

    // ######################################################################
    // AYANT DROIT / ASSURE PRINCIPAL
    // Interdit : parent inexistant, se désigner soi-même, pointer vers un autre ayant droit.
    // ######################################################################
    private boolean validerAssurePrincipal(HttpExchange ex, Integer idAssure, Integer idPatientCourant) throws Exception {
        if (idAssure == null) return true;

        if (idAssure <= 0) {
            Http.error(ex, 400, "id_assure_principal invalide");
            return false;
        }
        if (idPatientCourant != null && idAssure.equals(idPatientCourant)) {
            Http.error(ex, 400, "Un patient ne peut pas etre son propre assure principal");
            return false;
        }

        Patient parent = dao.findById(idAssure);
        if (parent == null) {
            Http.error(ex, 400, "Assure principal introuvable (id_assure_principal=" + idAssure + ")");
            return false;
        }
        if (parent.id_assure_principal != null) {
            Http.error(ex, 400, "Le patient designe est lui-meme un ayant droit. Choisissez un assure principal.");
            return false;
        }
        return true;
    }

    // ######################################################################
    // Quand on SOIGNE un ayant droit : fonds_couverture = fonds DU PARENT
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
}

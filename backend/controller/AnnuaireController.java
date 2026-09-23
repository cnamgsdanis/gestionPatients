package controller;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import dao.CatalogueDAO;
import dao.UtilisateurDAO;
import io.jsonwebtoken.Claims;
import model.Utilisateur;
import security.AuthGuard;
import service.Audit;
import service.Http;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Annuaires nécessaires à la feuille de soins.
 *
 *   GET    /api/medecins                     → médecins actifs                 (feuille.lire)
 *   GET    /api/catalogue/medicaments        → désignations + prix de référence (feuille.lire)
 *   POST   /api/catalogue/medicaments        → ajouter { designation, prix_reference } (structure.gerer)
 *   PUT    /api/catalogue/medicaments/{id}   → modifier                        (structure.gerer)
 *   DELETE /api/catalogue/medicaments/{id}   → retirer du catalogue            (structure.gerer)
 */
public class AnnuaireController {

    private final UtilisateurDAO userDao = new UtilisateurDAO();
    private final CatalogueDAO catalogueDao = new CatalogueDAO();

    public void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        String method = ex.getRequestMethod();
        try {
            if (path.equals("/api/medecins") && method.equals("GET")) medecins(ex);
            else if (path.startsWith("/api/catalogue/medicaments")) catalogue(ex, path, method);
            else Http.error(ex, 404, "Route inconnue");
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, e.getMessage());
        }
    }

    private void medecins(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "feuille.lire")) return;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Utilisateur u : userDao.findMedecinsActifs()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id_utilisateur", u.id_utilisateur);
            m.put("nom", u.nomComplet());                 // « prénom nom »
            m.put("code_praticien", u.code_praticien);
            m.put("type_praticien", u.type_praticien);
            m.put("service", u.service);
            m.put("id_structure", u.id_structure);
            m.put("structure_nom", u.structure_nom);
            out.add(m);
        }
        Http.json(ex, 200, out);
    }

    private void catalogue(HttpExchange ex, String path, String method) throws Exception {
        String[] parts = path.split("/");   // ["", "api", "catalogue", "medicaments", id?]
        if (method.equals("GET") && parts.length == 4) {
            if (!AuthGuard.verifierPermission(ex, "feuille.lire")) return;
            Http.json(ex, 200, catalogueDao.liste());
            return;
        }
        if (!AuthGuard.verifierPermission(ex, "structure.gerer")) return;
        Claims cl = AuthGuard.claimsOuNull(ex);

        if (method.equals("POST") && parts.length == 4) {
            String[] champs = lireChamps(ex);
            if (champs == null) return;
            try {
                int id = catalogueDao.inserer(champs[0], prix(champs[1]));
                Audit.ok(ex, cl, "ADMIN", "catalogue.ajouter", "Médicament ajouté au catalogue", "Catalogue", id, champs[0], null, null, null);
                Http.json(ex, 201, Map.of("id_catalogue", id, "designation", champs[0].trim()));
            } catch (SQLException e) {
                if (e.getErrorCode() == 2627 || e.getErrorCode() == 2601) Http.error(ex, 409, "Cette désignation existe déjà dans le catalogue.");
                else throw e;
            }
        } else if (parts.length == 5 && (method.equals("PUT") || method.equals("DELETE"))) {
            int id;
            try {
                id = Integer.parseInt(parts[4]);
            } catch (NumberFormatException e) {
                Http.error(ex, 400, "ID invalide");
                return;
            }
            if (method.equals("DELETE")) {
                boolean ok = catalogueDao.retirer(id);
                if (ok) Audit.ok(ex, cl, "ADMIN", "catalogue.retirer", "Médicament retiré du catalogue", "Catalogue", id, null, null, null, null);
                Http.raw(ex, ok ? 200 : 404, ok ? "{\"message\":\"Retire\"}" : "{\"error\":\"Introuvable\"}");
            } else {
                String[] champs = lireChamps(ex);
                if (champs == null) return;
                boolean ok;
                try {
                    ok = catalogueDao.modifier(id, champs[0], prix(champs[1]));
                } catch (SQLException e) {
                    if (e.getErrorCode() == 2627 || e.getErrorCode() == 2601) { Http.error(ex, 409, "Cette désignation existe déjà dans le catalogue."); return; }
                    throw e;
                }
                Http.raw(ex, ok ? 200 : 404, ok ? "{\"message\":\"Modifie\"}" : "{\"error\":\"Introuvable\"}");
            }
        } else {
            Http.error(ex, 405, "Methode non autorisee");
        }
    }

    /** { designation, prix_reference } → [designation, prix] ; répond 400 et renvoie null si invalide. */
    private String[] lireChamps(HttpExchange ex) throws IOException {
        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject()) { Http.error(ex, 400, "Corps JSON invalide"); return null; }
        JsonObject b = el.getAsJsonObject();
        String d = b.has("designation") && !b.get("designation").isJsonNull() ? b.get("designation").getAsString().trim() : "";
        if (d.length() < 2 || d.length() > 200) { Http.error(ex, 400, "designation obligatoire (2 à 200 caractères)"); return null; }
        String p = b.has("prix_reference") && !b.get("prix_reference").isJsonNull() ? b.get("prix_reference").getAsString() : "";
        if (!p.isBlank()) {
            try {
                if (new BigDecimal(p).signum() < 0) throw new NumberFormatException();
            } catch (NumberFormatException e) {
                Http.error(ex, 400, "prix_reference invalide (nombre positif)");
                return null;
            }
        }
        return new String[]{d, p};
    }

    private BigDecimal prix(String s) {
        return s == null || s.isBlank() ? null : new BigDecimal(s);
    }
}

package controller;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import io.jsonwebtoken.Claims;
import security.AuthGuard;
import service.FeuilleService;
import service.FeuilleService.Erreur;
import service.Http;

import java.io.IOException;
import java.sql.SQLException;

/**
 * Feuilles de soins (consultation et examen) — module central du circuit accueil → médecin → pharmacie.
 *
 * Routes :
 *   GET    /api/feuilles                → liste selon le rôle       (feuille.lire)
 *            ?nag= &statut=En attente|Validée &type=Consultation|Examen &avec_ordonnance=1
 *            &servi_par_moi=1 (pharmacie) &depuis= &jusqua=
 *   GET    /api/feuilles/compteurs      → { en_attente_medecin, ordonnances_a_servir } (feuille.lire)
 *   GET    /api/feuilles/{id}           → une feuille               (feuille.lire)
 *   POST   /api/feuilles                → créer                     (feuille.creer)
 *   PUT    /api/feuilles/{id}           → brouillon, validation ou délivrance selon le rôle (feuille.modifier)
 *   DELETE /api/feuilles/{id}           → supprimer (administrateur) (feuille.supprimer)
 *
 * Le JSON d'une feuille est celui de l'interface ; le serveur attribue serverId, numero, date et statut.
 * Détail des règles : FeuilleService et backend/docs/05-integration-front.md.
 */
public class FeuilleController {

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String[] parts = ex.getRequestURI().getPath().split("/");   // ["", "api", "feuilles", ...]
        try {
            if (parts.length == 3) {
                if (method.equals("GET")) liste(ex);
                else if (method.equals("POST")) creer(ex);
                else Http.error(ex, 405, "Methode non autorisee");
            } else if (parts.length == 4 && parts[3].equals("compteurs") && method.equals("GET")) {
                compteurs(ex);
            } else if (parts.length == 4) {
                Integer id = id(ex, parts[3]);
                if (id == null) return;
                switch (method) {
                    case "GET"    -> une(ex, id);
                    case "PUT"    -> modifier(ex, id);
                    case "DELETE" -> supprimer(ex, id);
                    default       -> Http.error(ex, 405, "Methode non autorisee");
                }
            } else {
                Http.error(ex, 404, "Route inconnue");
            }
        } catch (Erreur e) {
            Http.error(ex, e.code, e.getMessage());
        } catch (SQLException e) {
            e.printStackTrace();
            if (e.getErrorCode() == 2627 || e.getErrorCode() == 2601) Http.error(ex, 409, "Cette feuille existe déjà.");
            else Http.error(ex, 500, "Erreur base de données : " + e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, e.getMessage());
        }
    }

    private void liste(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "feuille.lire")) return;
        Claims cl = AuthGuard.claimsOuNull(ex);
        Http.json(ex, 200, FeuilleService.lister(cl, Http.query(ex)));
    }

    private void compteurs(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "feuille.lire")) return;
        Http.json(ex, 200, FeuilleService.compteurs(AuthGuard.claimsOuNull(ex)));
    }

    private void une(HttpExchange ex, int id) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "feuille.lire")) return;
        Http.json(ex, 200, FeuilleService.lire(AuthGuard.claimsOuNull(ex), id));
    }

    private void creer(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "feuille.creer")) return;
        JsonObject in = corps(ex);
        if (in == null) return;
        Http.json(ex, 201, FeuilleService.creer(ex, AuthGuard.claimsOuNull(ex), in));
    }

    private void modifier(HttpExchange ex, int id) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "feuille.modifier")) return;
        JsonObject in = corps(ex);
        if (in == null) return;
        Http.json(ex, 200, FeuilleService.modifier(ex, AuthGuard.claimsOuNull(ex), id, in));
    }

    private void supprimer(HttpExchange ex, int id) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "feuille.supprimer")) return;
        FeuilleService.supprimer(ex, AuthGuard.claimsOuNull(ex), id);
        Http.raw(ex, 200, "{\"message\":\"Supprime\"}");
    }

    private JsonObject corps(HttpExchange ex) throws IOException {
        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject()) {
            Http.error(ex, 400, "Corps JSON invalide");
            return null;
        }
        return el.getAsJsonObject();
    }

    private Integer id(HttpExchange ex, String s) throws IOException {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            Http.error(ex, 400, "ID invalide");
            return null;
        }
    }
}

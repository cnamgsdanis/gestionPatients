package controller;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import dao.ReglementDAO;
import io.jsonwebtoken.Claims;
import security.AuthGuard;
import service.Audit;
import service.Http;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.Map;

/**
 * Règlements des hôpitaux et pharmacies.
 *
 *   GET  /api/reglements   → liste                       (reglement.lire)
 *   POST /api/reglements   → { kind: "hopital"|"pharmacie", structure, montant, type: "reglement"|"avance", note }
 *                            (reglement.creer)
 *
 * Règles : la structure doit exister ; un « reglement » ne peut pas dépasser le reste à payer
 * (dû − déjà versé) ; une « avance » peut le dépasser (l'excédent se déduit des prochaines prestations).
 */
public class ReglementController {

    private final ReglementDAO dao = new ReglementDAO();

    public void handle(HttpExchange ex) throws IOException {
        try {
            if (ex.getRequestMethod().equals("GET")) liste(ex);
            else if (ex.getRequestMethod().equals("POST")) creer(ex);
            else Http.error(ex, 405, "Methode non autorisee");
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, e.getMessage());
        }
    }

    private void liste(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "reglement.lire")) return;
        Http.json(ex, 200, dao.lister());
    }

    private void creer(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "reglement.creer")) return;
        Claims cl = AuthGuard.claimsOuNull(ex);

        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject()) { Http.error(ex, 400, "Corps JSON invalide"); return; }
        JsonObject b = el.getAsJsonObject();
        String kind = texte(b, "kind"), structure = texte(b, "structure"), type = texte(b, "type").isEmpty() ? "reglement" : texte(b, "type");

        if (!kind.equals("hopital") && !kind.equals("pharmacie")) { Http.error(ex, 400, "kind doit valoir 'hopital' ou 'pharmacie'"); return; }
        if (!type.equals("reglement") && !type.equals("avance")) { Http.error(ex, 400, "type doit valoir 'reglement' ou 'avance'"); return; }
        if (structure.isBlank()) { Http.error(ex, 400, "structure obligatoire"); return; }
        BigDecimal montant;
        try {
            montant = new BigDecimal(texte(b, "montant").replace(" ", "").replace(',', '.'));
        } catch (NumberFormatException e) {
            Http.error(ex, 400, "montant invalide");
            return;
        }
        if (montant.signum() <= 0) { Http.error(ex, 400, "Le montant doit être supérieur à 0"); return; }

        Integer idStructure = dao.trouverStructure(kind, structure);
        if (idStructure == null) { Http.error(ex, 400, "Structure inconnue : " + structure); return; }

        BigDecimal reste = dao.du(kind, idStructure).subtract(dao.paye(idStructure));
        if (type.equals("reglement") && montant.compareTo(reste.max(BigDecimal.ZERO)) > 0) {
            Audit.refus(ex, cl, "PAIEMENT", "paiement.enregistrer", "Paiement refusé", "REFUSE",
                "Le règlement dépasse le reste à payer (" + reste.max(BigDecimal.ZERO).toPlainString() + " FCFA)", "Structure", idStructure, null);
            Http.error(ex, 409, "Le règlement dépasse le reste à payer (" + reste.max(BigDecimal.ZERO).toPlainString() + " FCFA). Enregistrez une avance pour payer davantage.");
            return;
        }

        int id = dao.inserer(kind, idStructure, structure.trim(), montant, type, texte(b, "note"), AuthGuard.getIdUtilisateur(cl));
        Audit.ok(ex, cl, "PAIEMENT", "paiement.enregistrer", type.equals("avance") ? "Avance enregistrée" : "Paiement enregistré",
            "Reglement", id, structure.trim(), null, null, Map.of("kind", kind, "type", type, "montant", montant));
        Http.json(ex, 201, dao.trouver(id));
    }

    private static String texte(JsonObject b, String k) {
        return b.has(k) && !b.get(k).isJsonNull() ? b.get(k).getAsString().trim() : "";
    }
}

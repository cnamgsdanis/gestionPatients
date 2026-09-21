package controller;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import io.jsonwebtoken.Claims;
import model.JournalEvenement;
import model.JournalEvenement.JournalRegle;
import security.AuthGuard;
import service.Audit;
import service.ControleService;
import service.Http;
import service.JournalService;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Réglages du système réservés à l'administrateur.
 *
 *   GET /api/parametres/controles   → { actif, modifie_par, modifie_le }     (controle.gerer)
 *   PUT /api/parametres/controles   → { "actif": true|false } : active ou désactive les contrôles
 *                                     anti-fraude (voir ControleService)      (controle.gerer)
 *
 * Chaque changement est journalisé (catégorie SECURITE). La DÉSACTIVATION compte 60 points de risque :
 * elle déclenche une alerte de sécurité à tous les administrateurs.
 */
public class ParametreController {

    public void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        String method = ex.getRequestMethod();
        try {
            if (!path.equals("/api/parametres/controles")) { Http.error(ex, 404, "Route inconnue"); return; }
            if (method.equals("GET")) lire(ex);
            else if (method.equals("PUT")) modifier(ex);
            else Http.error(ex, 405, "Methode non autorisee");
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, e.getMessage());
        }
    }

    private void lire(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "controle.gerer")) return;
        Http.json(ex, 200, ControleService.etat());
    }

    private void modifier(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "controle.gerer")) return;
        Claims cl = AuthGuard.claimsOuNull(ex);
        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject() || !el.getAsJsonObject().has("actif")) {
            Http.error(ex, 400, "Corps attendu : { \"actif\": true|false }");
            return;
        }
        boolean actif = el.getAsJsonObject().get("actif").getAsBoolean();
        boolean avant = ControleService.actifs();
        ControleService.definir(actif, AuthGuard.getIdUtilisateur(cl));

        JournalEvenement e = Audit.evt(ex, cl, "SECURITE", "controles.modifier",
            actif ? "Contrôles anti-fraude activés" : "Contrôles anti-fraude désactivés");
        e.ressourceType = "Parametre";
        e.ressourceId = "controles_antifraude";
        e.avant = Http.GSON.toJson(Map.of("actif", avant));
        e.apres = Http.GSON.toJson(Map.of("actif", actif));
        e.message = actif ? "Les garde-fous du serveur s'appliquent de nouveau à tous."
                          : "Mode supervision : l'administrateur peut réaliser toutes les étapes du circuit.";
        if (!actif) {
            List<JournalRegle> regles = new ArrayList<>();
            regles.add(new JournalRegle("CONTROLES_DESACTIVES", "Contrôles anti-fraude désactivés par un administrateur", 60));
            e.reglesSupp = regles;
        }
        JournalService.log(e);
        Http.json(ex, 200, ControleService.etat());
    }
}

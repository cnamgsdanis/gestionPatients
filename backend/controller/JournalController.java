package controller;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import dao.JournalDAO;
import io.jsonwebtoken.Claims;
import model.JournalEvenement;
import security.AuthGuard;
import service.Audit;
import service.JournalService;
import service.Http;

import java.io.IOException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Journal d'audit (voir backend/docs/02-journalisation.md et 05-integration-front.md).
 *
 *   POST /api/journal/evenements            → l'interface signale SES actions (recherches, pages, exports…)
 *                                             { evenements: [ … ] } — tout compte connecté
 *   GET  /api/journal/evenements            → activité (journal.lire) ?page&taille&recherche&categorie&resultat&severite&du&au
 *   GET  /api/journal/connexions            → connexions réussies / échouées (journal.lire) ?page&taille&recherche&role&resultat&du&au
 *   GET  /api/journal/resume                → compteurs (journal.lire)
 *   GET  /api/journal/alertes               → événements à risque, score ≥ 25 (journal.lire) ?statut&page&taille
 *   PUT  /api/journal/alertes/{id}/revue    → { statut: Vu|Faux positif|Confirmé, note } (journal.gerer)
 *   GET  /api/journal/integrite             → vérifie la chaîne d'empreintes (journal.lire)
 *
 * L'acteur, l'adresse IP et l'heure sont TOUJOURS ceux du serveur : ce que le navigateur envoie n'est que déclaratif.
 * Les actions que le serveur trace lui-même (création de compte, validation, paiement…) envoyées par
 * l'interface sont ignorées pour ne pas les compter deux fois.
 */
public class JournalController {

    private final JournalDAO dao = new JournalDAO();

    /** Actions déjà journalisées par les contrôleurs : ignorées si l'interface les signale aussi. */
    private static final List<String> ACTIONS_DU_SERVEUR = Arrays.asList(
        "utilisateur.creer", "utilisateur.modifier", "utilisateur.activer", "utilisateur.desactiver", "utilisateur.supprimer",
        "utilisateur.mdp.reinitialiser", "permissions.modifier", "notification.envoyer", "pec.creer", "examen.recommander",
        "feuille.valider", "pharma.servir", "paiement.enregistrer", "journal.revue", "auth.login.succes", "auth.login.echec",
        "controles.modifier", "feuille.supervision", "auth.mdp.changer", "auth.mdp.initial", "auth.profil.changer",
        "utilisateur.profil.ajouter", "utilisateur.profil.retirer", "utilisateur.profil.principal");

    private static final List<String> CATEGORIES = Arrays.asList(
        "AUTH", "NAVIGATION", "ASSURE", "PEC", "CONSULTATION", "EXAMEN", "PHARMACIE", "PAIEMENT", "ADMIN", "EXPORT", "NOTIFICATION", "SECURITE");

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String[] parts = ex.getRequestURI().getPath().split("/");   // ["", "api", "journal", ...]
        try {
            if (parts.length == 4 && parts[3].equals("evenements") && method.equals("POST")) recevoir(ex);
            else if (parts.length == 4 && parts[3].equals("evenements") && method.equals("GET")) evenements(ex);
            else if (parts.length == 4 && parts[3].equals("connexions") && method.equals("GET")) connexions(ex);
            else if (parts.length == 4 && parts[3].equals("resume") && method.equals("GET")) resume(ex);
            else if (parts.length == 4 && parts[3].equals("alertes") && method.equals("GET")) alertes(ex);
            else if (parts.length == 4 && parts[3].equals("integrite") && method.equals("GET")) integrite(ex);
            else if (parts.length == 6 && parts[3].equals("alertes") && parts[5].equals("revue") && method.equals("PUT")) revue(ex, parts[4]);
            else Http.error(ex, 404, "Route inconnue");
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, e.getMessage());
        }
    }

    // ============================================================
    // POST /api/journal/evenements — événements de l'interface
    // ============================================================
    private void recevoir(HttpExchange ex) throws Exception {
        Claims cl = AuthGuard.verifier(ex);
        if (cl == null) return;
        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject() || !el.getAsJsonObject().has("evenements") || !el.getAsJsonObject().get("evenements").isJsonArray()) {
            Http.error(ex, 400, "Corps attendu : { \"evenements\": [ … ] }");
            return;
        }
        JsonArray liste = el.getAsJsonObject().getAsJsonArray("evenements");
        int acceptes = 0, ignores = 0;
        for (int i = 0; i < liste.size() && i < 50; i++) {
            if (!liste.get(i).isJsonObject()) { ignores++; continue; }
            JsonObject o = liste.get(i).getAsJsonObject();
            String action = texte(o, "action");
            if (action.isEmpty() || ACTIONS_DU_SERVEUR.contains(action)) { ignores++; continue; }

            JournalEvenement e = Audit.evt(ex, cl, CATEGORIES.contains(texte(o, "categorie")) ? texte(o, "categorie") : "SECURITE", action, texte(o, "libelle"));
            e.origine = "ui";
            String res = texte(o, "resultat");
            e.resultat = Arrays.asList("SUCCES", "ECHEC", "REFUSE", "ANNULE").contains(res) ? res : "SUCCES";
            e.message = texte(o, "message");
            e.sessionId = texte(o, "sessionId").isEmpty() ? e.sessionId : texte(o, "sessionId");
            e.correlationId = texte(o, "correlationId");
            if (o.has("ressource") && o.get("ressource").isJsonObject()) {
                JsonObject r = o.getAsJsonObject("ressource");
                e.ressourceType = texte(r, "type");
                e.ressourceId = texte(r, "id");
                e.ressourceLibelle = texte(r, "libelle");
                e.nagMasque = texte(r, "nag");
            }
            if (o.has("avant") && !o.get("avant").isJsonNull()) e.avant = borne(o.get("avant"));
            if (o.has("apres") && !o.get("apres").isJsonNull()) e.apres = borne(o.get("apres"));
            JsonObject ctx = o.has("contexte") && o.get("contexte").isJsonObject() ? o.getAsJsonObject("contexte").deepCopy() : new JsonObject();
            if (o.has("horodatage")) ctx.addProperty("horodatage_client", texte(o, "horodatage"));
            e.contexte = borne(ctx);
            JournalService.log(e);
            acceptes++;
        }
        Http.json(ex, 201, Map.of("acceptes", acceptes, "ignores", ignores));
    }

    // ============================================================
    // GET — lectures (journal.lire)
    // ============================================================
    private void evenements(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "journal.lire")) return;
        JournalDAO.Filtre f = filtre(Http.query(ex));
        rendreListe(ex, f, false);
    }

    private void alertes(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "journal.lire")) return;
        Map<String, String> q = Http.query(ex);
        JournalDAO.Filtre f = new JournalDAO.Filtre();
        f.scoreMin = 25;
        f.statutRevue = q.get("statut");
        f.page = Http.entier(q, "page", 1, 1, 100000);
        f.taille = Http.entier(q, "taille", 6, 1, 100);
        rendreListe(ex, f, true);
    }

    private void connexions(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "journal.lire")) return;
        Map<String, String> q = Http.query(ex);
        JournalDAO.Filtre f = filtre(q);
        f.seulementConnexions = true;
        f.role = q.get("role");
        f.categorie = null;
        f.severite = null;
        String r = q.get("resultat");
        f.resultat = "succes".equalsIgnoreCase(r) ? "SUCCES" : "echec".equalsIgnoreCase(r) ? "ECHEC" : null;

        JsonArray items = new JsonArray();
        for (JournalEvenement e : dao.lister(f)) {
            JsonObject o = new JsonObject();
            o.addProperty("id", e.id);
            o.addProperty("nom", e.nomAffiche != null && !e.nomAffiche.isBlank() ? e.nomAffiche : e.login);
            o.addProperty("username", e.login);
            o.addProperty("role", e.role);
            o.addProperty("date_heure", e.horodatage);
            o.addProperty("resultat", "SUCCES".equals(e.resultat) ? "succes" : "echec");
            o.addProperty("ip", e.ip);
            o.addProperty("message", e.message);
            items.add(o);
        }
        JsonObject rep = new JsonObject();
        rep.add("items", items);
        rep.addProperty("total", dao.total(f));
        rep.add("resume", Http.GSON.toJsonTree(dao.resumeConnexions()));
        Http.json(ex, 200, rep);
    }

    private void rendreListe(HttpExchange ex, JournalDAO.Filtre f, boolean avecACommenter) throws Exception {
        JsonArray items = new JsonArray();
        for (JournalEvenement e : dao.lister(f)) items.add(versJson(e));
        JsonObject rep = new JsonObject();
        rep.add("items", items);
        rep.addProperty("total", dao.total(f));
        if (avecACommenter) rep.addProperty("a_examiner", dao.alertesANouveau());
        Http.json(ex, 200, rep);
    }

    private void resume(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "journal.lire")) return;
        Http.json(ex, 200, dao.resumeJournal());
    }

    private void integrite(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "journal.lire")) return;
        Http.json(ex, 200, JournalService.verifierIntegrite());
    }

    // ============================================================
    // PUT /api/journal/alertes/{id}/revue
    // ============================================================
    private void revue(HttpExchange ex, String idTexte) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "journal.gerer")) return;
        Claims cl = AuthGuard.claimsOuNull(ex);
        long id;
        try {
            id = Long.parseLong(idTexte);
        } catch (NumberFormatException e) {
            Http.error(ex, 400, "ID invalide");
            return;
        }
        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject()) { Http.error(ex, 400, "Corps JSON invalide"); return; }
        String statut = texte(el.getAsJsonObject(), "statut"), note = texte(el.getAsJsonObject(), "note");
        if (!Arrays.asList("Vu", "Faux positif", "Confirmé").contains(statut)) { Http.error(ex, 400, "statut : Vu, Faux positif ou Confirmé"); return; }

        JournalEvenement cible = dao.trouver(id);
        if (cible == null) { Http.error(ex, 404, "Événement introuvable"); return; }
        JournalEvenement moi = JournalService.pour(cl);
        boolean ok = dao.revue(id, statut, moi.nomAffiche == null || moi.nomAffiche.isBlank() ? moi.login : moi.nomAffiche, note);
        if (ok) Audit.ok(ex, cl, "SECURITE", "journal.revue", "Revue d'une alerte", "Événement", id, cible.action, null,
            Map.of("statut", cible.statutRevue), Map.of("statut", statut));
        Http.raw(ex, ok ? 200 : 404, ok ? "{\"message\":\"Revue enregistree\"}" : "{\"error\":\"Introuvable\"}");
    }

    // ------------------------------------------------------------
    // Outils
    // ------------------------------------------------------------
    private JournalDAO.Filtre filtre(Map<String, String> q) {
        JournalDAO.Filtre f = new JournalDAO.Filtre();
        f.recherche = q.get("recherche");
        f.categorie = q.get("categorie");
        f.resultat = q.get("resultat");
        f.severite = q.get("severite");
        f.du = q.get("du");
        f.au = q.get("au");
        f.page = Http.entier(q, "page", 1, 1, 100000);
        f.taille = Http.entier(q, "taille", 12, 1, 100);
        return f;
    }

    /** Événement → JSON attendu par l'interface (acteur, ressource, contexte, règles…). */
    private JsonObject versJson(JournalEvenement e) {
        JsonObject o = new JsonObject();
        o.addProperty("id", e.id);
        o.addProperty("seq", e.id);
        o.addProperty("horodatage", e.horodatage);
        o.addProperty("origine", e.origine);
        o.addProperty("sessionId", e.sessionId);
        o.addProperty("correlationId", e.correlationId);
        JsonObject acteur = new JsonObject();
        acteur.addProperty("nom", nz(e.nomAffiche).isBlank() ? (nz(e.login).isBlank() ? "Inconnu" : e.login) : e.nomAffiche);
        acteur.addProperty("login", nz(e.login));
        acteur.addProperty("role", nz(e.role));
        acteur.addProperty("etab", nz(e.etablissement));
        o.add("acteur", acteur);
        o.addProperty("categorie", e.categorie);
        o.addProperty("action", e.action);
        o.addProperty("libelle", nz(e.libelle).isBlank() ? e.action : e.libelle);
        o.addProperty("resultat", e.resultat);
        o.addProperty("message", nz(e.message));
        JsonObject res = new JsonObject();
        res.addProperty("type", nz(e.ressourceType));
        res.addProperty("id", nz(e.ressourceId));
        res.addProperty("libelle", nz(e.ressourceLibelle));
        res.addProperty("nag", nz(e.nagMasque));
        o.add("ressource", res);
        o.add("avant", json(e.avant));
        o.add("apres", json(e.apres));
        JsonElement ctx = json(e.contexte);
        JsonObject contexte = ctx != null && ctx.isJsonObject() ? ctx.getAsJsonObject() : new JsonObject();
        contexte.addProperty("ip", nz(e.ip));
        o.add("contexte", contexte);
        o.addProperty("severite", e.severite);
        o.addProperty("score", e.score);
        JsonElement regles = json(e.regles);
        o.add("regles", regles != null && regles.isJsonArray() ? regles : new JsonArray());
        o.addProperty("statutRevue", e.statutRevue);
        o.addProperty("revuePar", e.revuePar);
        o.addProperty("revueLe", e.revueLe);
        o.addProperty("revueNote", e.revueNote);
        o.addProperty("hash", e.hash);
        o.addProperty("hashPrec", e.hashPrecedent);
        return o;
    }

    private static JsonElement json(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return JsonParser.parseString(s);
        } catch (Exception e) {
            return null;
        }
    }

    /** JSON limité à 8000 caractères (protège la base contre un corps démesuré). */
    private static String borne(JsonElement el) {
        String s = el.toString();
        return s.length() <= 8000 ? s : "{\"tronque\":true}";
    }

    private static String texte(JsonObject o, String k) {
        return o.has(k) && !o.get(k).isJsonNull() && o.get(k).isJsonPrimitive() ? o.get(k).getAsString().trim() : "";
    }

    private static String nz(String s) { return s == null ? "" : s; }
}

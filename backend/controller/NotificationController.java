package controller;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import dao.NotificationDAO;
import dao.StructureDAO;
import dao.UtilisateurDAO;
import db.Database;
import io.jsonwebtoken.Claims;
import model.Utilisateur;
import security.AuthGuard;
import service.Audit;
import service.Http;

import java.io.IOException;
import java.sql.Connection;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Messages de l'administrateur et alertes de sécurité.
 *
 *   GET  /api/notifications                 → MES messages (non expirés)        (tout compte connecté)
 *   PUT  /api/notifications/{id}/lu         → marquer lu                        (le destinataire)
 *   PUT  /api/notifications/{id}/accuse     → accusé de réception (vaut « lu »)  (le destinataire)
 *   POST /api/notifications                 → envoyer                            (notification.envoyer)
 *          { cible_type: all|role|etablissement|user, cible_valeur, titre, message,
 *            priorite: info|importante|urgente, categorie, accuse_requis, expire_le? }
 *   GET  /api/notifications/envoyees        → messages envoyés + suivi lus / accusés (notification.envoyer)
 *          ?page=&taille=  → { items, total }
 *
 * Les destinataires sont résolus par le serveur : comptes ACTIFS visés, sans l'expéditeur.
 * Les alertes de sécurité sont créées par le serveur (JournalService) pour les administrateurs.
 */
public class NotificationController {

    private final NotificationDAO dao = new NotificationDAO();
    private final UtilisateurDAO userDao = new UtilisateurDAO();
    private final StructureDAO structureDao = new StructureDAO();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String[] parts = ex.getRequestURI().getPath().split("/");   // ["", "api", "notifications", ...]
        try {
            if (parts.length == 3 && method.equals("GET")) mesMessages(ex);
            else if (parts.length == 3 && method.equals("POST")) envoyer(ex);
            else if (parts.length == 4 && parts[3].equals("envoyees") && method.equals("GET")) envoyees(ex);
            else if (parts.length == 5 && method.equals("PUT") && (parts[4].equals("lu") || parts[4].equals("accuse"))) marquer(ex, parts[3], parts[4].equals("accuse"));
            else Http.error(ex, 404, "Route inconnue");
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, e.getMessage());
        }
    }

    private void mesMessages(HttpExchange ex) throws Exception {
        Claims cl = AuthGuard.verifier(ex);
        if (cl == null) return;
        Http.json(ex, 200, dao.mesNotifications(AuthGuard.getIdUtilisateur(cl)));
    }

    private void marquer(HttpExchange ex, String idTexte, boolean accuse) throws Exception {
        Claims cl = AuthGuard.verifier(ex);
        if (cl == null) return;
        int id;
        try {
            id = Integer.parseInt(idTexte);
        } catch (NumberFormatException e) {
            Http.error(ex, 400, "ID invalide");
            return;
        }
        int moi = AuthGuard.getIdUtilisateur(cl);
        boolean ok = accuse ? dao.marquerAccuse(id, moi) : dao.marquerLu(id, moi);
        Http.raw(ex, ok ? 200 : 404, ok ? "{\"message\":\"Enregistre\"}" : "{\"error\":\"Message introuvable pour ce compte\"}");
    }

    private void envoyees(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "notification.envoyer")) return;
        Map<String, String> q = Http.query(ex);
        int page = Http.entier(q, "page", 1, 1, 100000);
        int taille = Http.entier(q, "taille", 8, 1, 100);
        Map<String, Object> rep = new LinkedHashMap<>();
        rep.put("items", dao.envoyees(page, taille));
        rep.put("total", dao.totalEnvoyees());
        Http.json(ex, 200, rep);
    }

    private void envoyer(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "notification.envoyer")) return;
        Claims cl = AuthGuard.claimsOuNull(ex);
        int moi = AuthGuard.getIdUtilisateur(cl);

        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject()) { Http.error(ex, 400, "Corps JSON invalide"); return; }
        JsonObject b = el.getAsJsonObject();

        String type = texte(b, "cible_type"), valeur = texte(b, "cible_valeur");
        String titre = texte(b, "titre"), message = texte(b, "message");
        String priorite = texte(b, "priorite").isEmpty() ? "info" : texte(b, "priorite");
        String categorie = texte(b, "categorie").isEmpty() ? "message" : texte(b, "categorie");
        boolean accuse = b.has("accuse_requis") && !b.get("accuse_requis").isJsonNull() && b.get("accuse_requis").getAsBoolean();

        if (titre.length() < 3 || titre.length() > 150) { Http.error(ex, 400, "Titre obligatoire (3 à 150 caractères)"); return; }
        if (message.length() < 3 || message.length() > 2000) { Http.error(ex, 400, "Message obligatoire (3 à 2000 caractères)"); return; }
        if (!List.of("info", "importante", "urgente").contains(priorite)) { Http.error(ex, 400, "priorite : info, importante ou urgente"); return; }
        if (!List.of("message", "securite", "systeme").contains(categorie)) { Http.error(ex, 400, "categorie invalide"); return; }
        if (!List.of("all", "role", "etablissement", "user").contains(type)) { Http.error(ex, 400, "cible_type : all, role, etablissement ou user"); return; }
        if (type.equals("role") && !Utilisateur.roleValide(valeur)) { Http.error(ex, 400, "cible_valeur : rôle invalide"); return; }
        if (type.equals("etablissement") && (!valeur.matches("\\d+") || structureDao.findById(Integer.parseInt(valeur)) == null)) { Http.error(ex, 400, "cible_valeur : établissement introuvable"); return; }
        if (type.equals("user") && (!valeur.matches("\\d+") || userDao.findById(Integer.parseInt(valeur)) == null)) { Http.error(ex, 400, "cible_valeur : utilisateur introuvable"); return; }

        LocalDateTime expire = null;
        if (b.has("expire_le") && !b.get("expire_le").isJsonNull() && !b.get("expire_le").getAsString().isBlank()) {
            try {
                expire = java.time.Instant.parse(b.get("expire_le").getAsString()).atZone(ZoneOffset.UTC).toLocalDateTime();
            } catch (Exception e) {
                Http.error(ex, 400, "expire_le : date ISO-8601 attendue (ex 2026-10-01T00:00:00Z)");
                return;
            }
        }

        int id, nb;
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                List<Integer> destinataires = dao.resoudreDestinataires(c, type, valeur.isEmpty() ? null : valeur, moi);
                if (destinataires.isEmpty()) { c.rollback(); Http.error(ex, 400, "Aucun destinataire actif pour ce choix."); return; }
                id = dao.creer(c, moi, type, valeur.isEmpty() ? null : valeur, titre, message, priorite, categorie, accuse, expire);
                dao.ajouterDestinataires(c, id, destinataires);
                nb = destinataires.size();
                c.commit();
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
        }
        Audit.ok(ex, cl, "NOTIFICATION", "notification.envoyer", "Message envoyé", "Notification", id, titre, null, null,
            Map.of("destinataires", nb, "cible", type + (valeur.isEmpty() ? "" : ":" + valeur), "priorite", priorite));
        Http.json(ex, 201, Map.of("id_notification", id, "destinataires", nb));
    }

    private static String texte(JsonObject b, String k) {
        return b.has(k) && !b.get(k).isJsonNull() ? b.get(k).getAsString().trim() : "";
    }
}

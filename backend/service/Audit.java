// ============================================================
// Audit.java — Raccourcis pour tracer une action de l'API
// ------------------------------------------------------------
// Chaque contrôleur appelle Audit.ok(...) / Audit.refus(...) pour les
// actions qui comptent (création, validation, paiement, suppression...).
// L'acteur vient du JETON (jamais du corps de la requête) ; l'adresse
// IP et le navigateur viennent de la requête. Le score de risque et la
// chaîne d'empreintes sont calculés par JournalService.
// ============================================================
package service;

import com.sun.net.httpserver.HttpExchange;
import io.jsonwebtoken.Claims;
import model.JournalEvenement;

public final class Audit {

    private Audit() {}

    /** Événement pré-rempli : acteur (jeton), IP, navigateur, session. */
    public static JournalEvenement evt(HttpExchange ex, Claims claims, String categorie, String action, String libelle) {
        JournalEvenement e = JournalService.pour(claims);
        e.origine = "api";
        e.categorie = categorie;
        e.action = action;
        e.libelle = libelle;
        e.ip = Http.ip(ex);
        e.userAgent = ex.getRequestHeaders().getFirst("User-Agent");
        e.sessionId = claims == null ? null : claims.getId();
        return e;
    }

    /** Action réussie. « nag » est masqué avant d'être écrit. */
    public static void ok(HttpExchange ex, Claims claims, String categorie, String action, String libelle,
                          String ressourceType, Object ressourceId, String ressourceLibelle, String nag, Object avant, Object apres) {
        JournalEvenement e = evt(ex, claims, categorie, action, libelle);
        remplir(e, ressourceType, ressourceId, ressourceLibelle, nag, avant, apres);
        JournalService.log(e);
    }

    /** Action refusée ou échouée (droits, règle métier, donnée invalide). */
    public static void refus(HttpExchange ex, Claims claims, String categorie, String action, String libelle,
                             String resultat, String message, String ressourceType, Object ressourceId, String nag) {
        JournalEvenement e = evt(ex, claims, categorie, action, libelle);
        e.resultat = resultat;
        e.message = message;
        remplir(e, ressourceType, ressourceId, null, nag, null, null);
        JournalService.log(e);
    }

    private static void remplir(JournalEvenement e, String type, Object id, String libelle, String nag, Object avant, Object apres) {
        e.ressourceType = type;
        e.ressourceId = id == null ? null : String.valueOf(id);
        e.ressourceLibelle = libelle;
        e.nagMasque = JournalService.masquerNag(nag);
        if (avant != null) e.avant = Http.GSON.toJson(avant);
        if (apres != null) e.apres = Http.GSON.toJson(apres);
    }
}

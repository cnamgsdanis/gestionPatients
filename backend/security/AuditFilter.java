// ============================================================
// AuditFilter.java — Trace les refus et les erreurs de TOUTE l'API
// ------------------------------------------------------------
// Une fois la réponse envoyée, on regarde le code HTTP :
//   401 → jeton absent / invalide / expiré       (security.token.invalide)
//   403 → droits insuffisants                    (security.acces.refuse)
//   5xx → erreur du serveur                      (api.erreur)
// Les actions réussies sont tracées par les contrôleurs (Audit.ok).
// La connexion (/api/auth/login) est tracée par AuthController.
// Limite : une même (adresse, route, code) n'est journalisée qu'une fois par minute.
// ============================================================
package security;

import com.sun.net.httpserver.Filter;
import com.sun.net.httpserver.HttpExchange;
import io.jsonwebtoken.Claims;
import model.JournalEvenement;
import service.Audit;
import service.Http;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class AuditFilter extends Filter {

    private static final Map<String, Long> VUS = new ConcurrentHashMap<>();

    @Override
    public void doFilter(HttpExchange ex, Chain chain) throws IOException {
        try {
            chain.doFilter(ex);
        } finally {
            tracer(ex);
        }
    }

    private void tracer(HttpExchange ex) {
        try {
            int code = ex.getResponseCode();
            String chemin = ex.getRequestURI().getPath();
            if (code != 401 && code != 403 && code < 500) return;
            if (chemin.equals("/api/auth/login")) return;

            long maintenant = System.currentTimeMillis();
            String cle = Http.ip(ex) + "|" + ex.getRequestMethod() + "|" + chemin + "|" + code;
            Long avant = VUS.get(cle);
            if (avant != null && maintenant - avant < 60_000L) return;
            VUS.put(cle, maintenant);
            if (VUS.size() > 5000) VUS.values().removeIf(t -> maintenant - t > 60_000L);

            Claims claims = AuthGuard.claimsOuNull(ex);
            String texte = ex.getRequestMethod() + " " + chemin + " → " + code;
            JournalEvenement e;
            if (code == 401) {
                e = Audit.evt(ex, null, "SECURITE", "security.token.invalide", "Jeton absent, invalide ou expiré");
                e.resultat = "REFUSE";
            } else if (code == 403) {
                e = Audit.evt(ex, claims, "SECURITE", "security.acces.refuse", "Accès refusé (droits insuffisants)");
                e.resultat = "REFUSE";
            } else {
                e = Audit.evt(ex, claims, "SECURITE", "api.erreur", "Erreur du serveur");
                e.resultat = "ECHEC";
            }
            e.message = texte;
            e.ressourceType = "Route";
            e.ressourceLibelle = chemin;
            service.JournalService.log(e);
        } catch (Exception ignore) {
            // le journal ne doit jamais casser une réponse
        }
    }

    @Override
    public String description() {
        return "Audit";
    }
}

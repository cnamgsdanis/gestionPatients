// ============================================================
// CorsFilter.java — En-têtes CORS et requêtes de pré-vérification (OPTIONS)
// ------------------------------------------------------------
// Sans ces en-têtes, un navigateur refuse d'envoyer POST/PUT/PATCH/DELETE
// depuis un site hébergé ailleurs que l'API (autre origine).
//
// Réglage : variable d'environnement PEC_CORS_ORIGINS
//   "*"                                  (défaut) toutes les origines — acceptable ici car
//                                        l'authentification est un jeton Bearer, pas un cookie
//   "https://pec.exemple.ga,http://..."  liste blanche (recommandé en production)
// Si le front est servi sous la même origine que l'API, CORS n'est pas utilisé.
// ============================================================
package security;

import com.sun.net.httpserver.Filter;
import com.sun.net.httpserver.HttpExchange;
import service.Http;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

public class CorsFilter extends Filter {

    private static final List<String> ORIGINES =
        Arrays.stream(Http.config("PEC_CORS_ORIGINS", "*").split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();

    @Override
    public void doFilter(HttpExchange ex, Chain chain) throws IOException {
        String origine = ex.getRequestHeaders().getFirst("Origin");
        if (origine != null) {
            if (ORIGINES.contains("*")) {
                ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            } else if (ORIGINES.contains(origine)) {
                ex.getResponseHeaders().set("Access-Control-Allow-Origin", origine);
                ex.getResponseHeaders().add("Vary", "Origin");
            }
            ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
            ex.getResponseHeaders().set("Access-Control-Allow-Headers", "Authorization, Content-Type");
            ex.getResponseHeaders().set("Access-Control-Max-Age", "86400");
        }
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);   // pré-vérification : pas de corps
            ex.close();
            return;
        }
        chain.doFilter(ex);
    }

    @Override
    public String description() {
        return "CORS";
    }
}

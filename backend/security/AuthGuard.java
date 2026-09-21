// ============================================================
// AuthGuard.java — Gardien d'authentification et d'autorisation
// ------------------------------------------------------------
// Rôle : vérifier que la requête HTTP contient un token JWT
// valide, et que l'utilisateur possède les droits nécessaires.
//
// Utilisation dans un contrôleur :
//   1. Pour exiger UNIQUEMENT un token valide :
//        if (AuthGuard.verifier(ex) == null) return;
//
//   2. Pour exiger un RÔLE spécifique :
//        if (!AuthGuard.autoriser(ex, "administrateur")) return;
//
//   3. Pour accepter PLUSIEURS rôles :
//        if (!AuthGuard.autoriser(ex, "administrateur", "medecin")) return;
//
// Si la vérification échoue, la réponse HTTP (401 ou 403) est
// déjà envoyée, donc il suffit de faire "return".
// ============================================================

package security;

import com.sun.net.httpserver.HttpExchange;
import io.jsonwebtoken.Claims;
import service.JwtService;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public class AuthGuard {

    // Une seule instance du service JWT pour tout le programme
    private static final JwtService jwtService = new JwtService();

    // ============================================================
    // 1. VÉRIFICATION DU TOKEN UNIQUEMENT (sans rôle spécifique)
    // ============================================================
    /**
     * Vérifie que la requête contient un token valide.
     *
     * Lit le header : Authorization: Bearer eyJhbGciOi...
     * Vérifie la signature et l'expiration du token.
     *
     * Si tout est OK : renvoie les claims (infos utilisateur).
     * Sinon : envoie une réponse 401 et renvoie null.
     *
     * @return Claims si le token est valide, null sinon
     */
    public static Claims verifier(HttpExchange ex) throws IOException {

        // 1. Lire le header "Authorization"
        String auth = ex.getRequestHeaders().getFirst("Authorization");

        // 2. Vérifier qu'il existe et commence par "Bearer "
        if (auth == null || !auth.startsWith("Bearer ")) {
            sendJson(ex, 401, "{\"error\":\"Token manquant\"}");
            return null;
        }

        // 3. Extraire le token (enlever le préfixe "Bearer ")
        String token = auth.substring(7).trim();

        // 4. Vérifier la signature et l'expiration
        Claims claims = jwtService.verifier(token);

        if (claims == null) {
            sendJson(ex, 401, "{\"error\":\"Token invalide ou expire\"}");
            return null;
        }

        // 5. Mot de passe temporaire : tant qu'il n'est pas remplacé, seules les routes d'authentification passent
        if (Boolean.TRUE.equals(claims.get("chgmdp", Boolean.class)) && !routeAutoriseeAvantChangementMdp(ex.getRequestURI().getPath())) {
            sendJson(ex, 403, "{\"error\":\"Vous devez d'abord choisir votre mot de passe personnel.\",\"code\":\"MDP_A_CHANGER\"}");
            return null;
        }

        // 6. Tout est OK → on renvoie les infos contenues dans le token
        return claims;
    }

    /** Routes ouvertes à un compte dont le mot de passe est temporaire : de quoi le changer, se reconnaître, se déconnecter. */
    private static boolean routeAutoriseeAvantChangementMdp(String path) {
        return path.equals("/api/auth/change-password") || path.equals("/api/auth/me")
            || path.equals("/api/auth/logout") || path.equals("/api/auth/refresh");
    }

    /**
     * Comme verifier(), mais ne répond RIEN au client : renvoie les claims
     * du token s'il est valide, null sinon. Sert aux filtres (journal d'audit).
     */
    public static Claims claimsOuNull(HttpExchange ex) {
        String auth = ex.getRequestHeaders().getFirst("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) return null;
        return jwtService.verifier(auth.substring(7).trim());
    }

    // ============================================================
    // 2. VÉRIFICATION DU TOKEN + DU RÔLE
    // ============================================================
    /**
     * Vérifie le token ET que le rôle de l'utilisateur
     * est dans la liste autorisée.
     *
     * Exemple :
     * autoriser(ex, "administrateur") // admin uniquement
     * autoriser(ex, "administrateur", "medecin") // admin OU médecin
     * autoriser(ex) // n'importe quel rôle (juste token valide)
     *
     * @param rolesAutorises Liste des rôles autorisés (vide = tous)
     * @return true si autorisé, false sinon (réponse HTTP déjà envoyée)
     */
    public static boolean autoriser(HttpExchange ex, String... rolesAutorises) throws IOException {

        // 1. Vérifier le token
        Claims claims = verifier(ex);
        if (claims == null)
            return false; // 401 déjà envoyé

        // 2. Extraire le rôle depuis le token
        String role = claims.get("role", String.class);

        // 3. Si aucun rôle n'est spécifié → on accepte n'importe quel rôle
        if (rolesAutorises.length == 0)
            return true;

        // 4. Vérifier que le rôle est dans la liste autorisée
        if (!Arrays.asList(rolesAutorises).contains(role)) {
            sendJson(ex, 403,
                    "{\"error\":\"Acces refuse pour le role : " + role + "\"}");
            return false;
        }

        return true;
    }

    // ============================================================
    // 3. HELPERS INTERNES
    // ============================================================

    /** Envoie une réponse JSON avec un code HTTP (utilitaire). */
    private static void sendJson(HttpExchange ex, int code, String json) throws IOException {
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    // ============================================================
    // 3. VÉRIFICATION D'UNE PERMISSION SPÉCIFIQUE
    // ============================================================
    /**
     * Vérifie le token ET que le rôle possède la permission demandée.
     *
     * Exemple :
     * verifierPermission(ex, "patient.supprimer")
     *
     * @param code Le code de la permission requise
     * @return true si autorisé, false sinon (réponse HTTP déjà envoyée)
     */
    public static boolean verifierPermission(HttpExchange ex, String code) throws IOException {

        // 1. Vérifier le token
        Claims claims = verifier(ex);
        if (claims == null)
            return false; // 401 déjà envoyé

        // 2. Extraire le rôle depuis le token
        String role = claims.get("role", String.class);

        // 3. Vérifier la permission via le service (cache en mémoire)
        if (!service.PermissionService.hasPermission(role, code)) {
            sendJson(ex, 403,
                    "{\"error\":\"Permission refusee : " + code + "\",\"role\":\"" + role + "\"}");
            return false;
        }

        return true;
    }

    // ============================================================
    // Extracteurs sûrs pour les claims numériques.
    // (jjwt renvoie parfois des Double, on convertit proprement)
    // ============================================================

    /** Extrait id_utilisateur du token (0 si absent). */
    public static int getIdUtilisateur(io.jsonwebtoken.Claims claims) {
        Object v = claims.get("id_utilisateur");
        if (v == null)
            return 0;
        if (v instanceof Number)
            return ((Number) v).intValue();
        try {
            return Integer.parseInt(v.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** Extrait id_structure du token (0 si absent). */
    public static int getIdStructure(io.jsonwebtoken.Claims claims) {
        Object v = claims.get("id_structure");
        if (v == null)
            return 0;
        if (v instanceof Number)
            return ((Number) v).intValue();
        try {
            return Integer.parseInt(v.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** Extrait le rôle du token ("" si absent). */
    public static String getRole(io.jsonwebtoken.Claims claims) {
        Object v = claims.get("role");
        return v == null ? "" : v.toString();
    }

    /** Extrait le username du token ("" si absent). */
    public static String getUsername(io.jsonwebtoken.Claims claims) {
        Object v = claims.get("username");
        return v == null ? "" : v.toString();
    }
}
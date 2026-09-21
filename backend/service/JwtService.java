// ============================================================
// JwtService.java — Service de gestion des tokens JWT
// ------------------------------------------------------------
// Un JWT (JSON Web Token) est une chaîne signée qui contient
// des informations sur l'utilisateur (id, username, role...).
//
// 3 parties séparées par des points :
//   HEADER    .   PAYLOAD    .   SIGNATURE
//   (algo)        (infos)        (preuve de non-falsification)
//
// Le serveur peut vérifier la signature à tout moment SANS
// avoir besoin de stocker le token en base de données.
//
// Évolutions (voir backend/docs/05-integration-front.md) :
//   - secret et durée configurables (PEC_JWT_SECRET, PEC_JWT_MINUTES)
//   - identifiant unique par token (jti) → déconnexion RÉELLE :
//     POST /api/auth/logout révoque le token (liste en mémoire)
//   - invaliderUtilisateur() : les tokens émis avant un changement
//     sensible (mot de passe, désactivation, rôle) ne sont plus valides
//   - renouvellement : POST /api/auth/refresh délivre un nouveau token
// ============================================================

package service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import model.Utilisateur;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class JwtService {

    // ------------------------------------------------------------
    // CLÉ SECRÈTE de signature (au moins 32 caractères pour HS256).
    // En production : définir la variable d'environnement PEC_JWT_SECRET
    // (changer la clé invalide tous les tokens existants).
    // ------------------------------------------------------------
    private static final String SECRET = Http.config("PEC_JWT_SECRET",
        "GestionPatients_Super_Secret_Key_2026_Change_Me_In_Prod!");

    // Durée de validité d'un token, en minutes (60 par défaut). Le front le
    // renouvelle tant que l'utilisateur travaille (POST /api/auth/refresh).
    private static final long DUREE_VALIDITE =
        1000L * 60 * Long.parseLong(Http.config("PEC_JWT_MINUTES", "60"));

    // jti → date d'expiration (ms) des tokens révoqués par une déconnexion
    private static final Map<String, Long> REVOQUES = new ConcurrentHashMap<>();
    // id_utilisateur → instant (ms) avant lequel les tokens ne sont plus acceptés
    private static final Map<Integer, Long> INVALIDES_AVANT = new ConcurrentHashMap<>();

    private final SecretKey cle;

    public JwtService() {
        this.cle = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
    }

    /** Durée de validité configurée, en secondes (indiquée au client). */
    public static long dureeSecondes() {
        return DUREE_VALIDITE / 1000;
    }

    // ============================================================
    // 1. GÉNÉRATION D'UN TOKEN
    // ============================================================
    /** Token pour le profil PRINCIPAL du compte. */
    public String genererToken(Utilisateur u) {
        return genererToken(u, u.role);
    }

    /**
     * Token pour un profil précis du compte : le claim « role » est le PROFIL ACTIF de la session (celui qui décide
     * des droits et des écrans) ; un profil que le compte ne porte pas est remplacé par son profil principal.
     * Le claim « chgmdp » vaut true tant que le compte doit changer son mot de passe temporaire : AuthGuard
     * ne laisse alors passer que les routes d'authentification.
     */
    public String genererToken(Utilisateur u, String profilActif) {

        Date maintenant = new Date();
        Date expiration = new Date(maintenant.getTime() + DUREE_VALIDITE);
        String role = profilActif != null && u.aProfil(profilActif) ? profilActif : u.role;
        // Toujours strictement APRÈS une éventuelle invalidation de ce compte (sinon le token tout neuf serait refusé)
        Long invalide = INVALIDES_AVANT.get(u.id_utilisateur);
        long ims = Math.max(System.currentTimeMillis(), invalide == null ? 0 : invalide + 1);

        return Jwts.builder()
            .id(UUID.randomUUID().toString())          // "jti" : identifiant unique du token
            .claim("id_utilisateur", u.id_utilisateur)
            .claim("username",       u.username)
            .claim("role",           role)
            .claim("id_structure",   u.id_structure)
            .claim("chgmdp",         u.doit_changer_mdp)
            .claim("ims",            ims)   // émission à la MILLISECONDE (iat n'a qu'1 s de précision)
            .subject(u.username)
            .issuedAt(maintenant)
            .expiration(expiration)
            .signWith(cle)
            .compact();
    }

    // ============================================================
    // 2. VÉRIFICATION ET EXTRACTION DES CLAIMS
    // ============================================================
    public Claims verifierEtExtraire(String token) {
        return Jwts.parser()
            .verifyWith(cle)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    /** Renvoie l'ID de l'utilisateur contenu dans le token. */
    public int getIdUtilisateur(Claims claims) {
        Number n = claims.get("id_utilisateur", Number.class);
        return n == null ? 0 : n.intValue();
    }

    /** Renvoie le username contenu dans le token. */
    public String getUsername(Claims claims) {
        return claims.get("username", String.class);
    }

    /** Renvoie le rôle contenu dans le token. */
    public String getRole(Claims claims) {
        return claims.get("role", String.class);
    }

    /** Renvoie l'id_structure contenu dans le token. */
    public int getIdStructure(Claims claims) {
        Number n = claims.get("id_structure", Number.class);
        return n == null ? 0 : n.intValue();
    }

    /**
     * Vérifie que le token est valide (signature, expiration, non révoqué)
     * sans lever d'exception. Retourne null s'il est invalide.
     */
    public Claims verifier(String token) {
        try {
            Claims c = verifierEtExtraire(token);
            String jti = c.getId();
            if (jti != null && REVOQUES.containsKey(jti)) return null;
            Long avant = INVALIDES_AVANT.get(getIdUtilisateur(c));
            if (avant != null) {
                Number ims = c.get("ims", Number.class);
                long emisMs = ims != null ? ims.longValue() : (c.getIssuedAt() == null ? 0 : c.getIssuedAt().getTime());
                if (emisMs <= avant) return null;   // émis avant (ou pendant) l'invalidation
            }
            return c;
        } catch (Exception e) {
            return null;
        }
    }

    // ============================================================
    // 3. RÉVOCATION
    // ============================================================

    /** Révoque ce token (déconnexion). */
    public static void revoquer(Claims c) {
        if (c == null || c.getId() == null) return;
        long now = System.currentTimeMillis();
        REVOQUES.put(c.getId(), c.getExpiration() == null ? now + DUREE_VALIDITE : c.getExpiration().getTime());
        REVOQUES.values().removeIf(exp -> exp < now);   // purge des tokens déjà expirés
    }

    /** Invalide tous les tokens déjà émis pour cet utilisateur (mot de passe changé, compte désactivé…). */
    public static void invaliderUtilisateur(int idUtilisateur) {
        INVALIDES_AVANT.put(idUtilisateur, System.currentTimeMillis());
    }
}

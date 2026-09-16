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
// ============================================================

package service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import model.Utilisateur;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

public class JwtService {

    // ------------------------------------------------------------
    // ⚠️ CLÉ SECRÈTE de signature
    // ------------------------------------------------------------
    // Cette clé sert à signer les tokens. Elle doit être :
    //   - LONGUE (au moins 32 caractères pour HS256)
    //   - SECRÈTE (personne ne doit la connaître)
    //   - STABLE (ne jamais la changer, sinon tous les tokens
    //     existants deviennent invalides)
    //
    // En production : à mettre dans une variable d'environnement.
    // ------------------------------------------------------------
    private static final String SECRET =
        "GestionPatients_Super_Secret_Key_2026_Change_Me_In_Prod!";

    // ------------------------------------------------------------
    // Durée de validité du token : 1 heure (en millisecondes)
    // 1000 ms * 60 sec * 60 min = 3 600 000 ms
    // ------------------------------------------------------------
    private static final long DUREE_VALIDITE = 1000L * 60 * 60;

    // ------------------------------------------------------------
    // Clé de signature dérivée du SECRET
    // (objet utilisé par la bibliothèque jjwt pour signer)
    // ------------------------------------------------------------
    private final SecretKey cle;

    // Constructeur : construit la clé à partir du SECRET
    public JwtService() {
        this.cle = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
    }

    // ============================================================
    // 1. GÉNÉRATION D'UN TOKEN
    // ============================================================
    /**
     * Génère un token JWT à partir d'un utilisateur.
     * Le token contiendra : id_utilisateur, username, role,
     * date d'émission et date d'expiration.
     *
     * @param u L'utilisateur qui vient de se connecter
     * @return Une chaîne JWT signée (ex: "eyJhbGc...")
     */
    public String genererToken(Utilisateur u) {

        Date maintenant = new Date();
        Date expiration  = new Date(maintenant.getTime() + DUREE_VALIDITE);

        return Jwts.builder()
            // --- Informations personnalisées (payload) ---
            .claim("id_utilisateur", u.id_utilisateur)
            .claim("username",       u.username)
            .claim("role",           u.role)
            .claim("id_structure",   u.id_structure)

            // --- Métadonnées standard JWT ---
            .subject(u.username)              // "sub" : sujet du token
            .issuedAt(maintenant)             // "iat" : émis à
            .expiration(expiration)           // "exp" : expire à

            // --- Signature avec la clé secrète ---
            .signWith(cle)

            // --- Compose la chaîne finale ---
            .compact();
    }

    // ============================================================
    // 2. VÉRIFICATION ET EXTRACTION DES CLAIMS
    // ============================================================
    /**
     * Vérifie qu'un token est valide (signature + expiration)
     * et retourne son contenu (les "claims").
     *
     * Si le token est falsifié ou expiré, cette méthode lance
     * une exception.
     *
     * @param token Le token à vérifier
     * @return Les claims (données) contenus dans le token
     */
    public Claims verifierEtExtraire(String token) {

        return Jwts.parser()
            .verifyWith(cle)          // vérifie la signature
            .build()
            .parseSignedClaims(token) // lance une exception si invalide
            .getPayload();            // renvoie les claims
    }

    // ============================================================
    // 3. RACCOURCIS UTILES POUR LE FILTRE
    // ============================================================

    /** Renvoie l'ID de l'utilisateur contenu dans le token. */
    public int getIdUtilisateur(Claims claims) {
        return claims.get("id_utilisateur", Integer.class);
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
        return claims.get("id_structure", Integer.class);
    }

    /**
     * Vérifie que le token est valide (sans lever d'exception).
     * Retourne null si le token est invalide ou expiré.
     */
    public Claims verifier(String token) {
        try {
            return verifierEtExtraire(token);
        } catch (Exception e) {
            return null;
        }
    }
}
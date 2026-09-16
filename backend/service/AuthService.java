// ============================================================
// AuthService.java — Service métier d'authentification
// ------------------------------------------------------------
// Contient la logique de hashage et de vérification des mots
// de passe avec BCrypt.
// Ne connaît NI le HTTP NI le SQL : uniquement la logique métier.
// ============================================================

package service;

import org.mindrot.jbcrypt.BCrypt;   // Bibliothèque BCrypt

public class AuthService {

    // ------------------------------------------------------------
    // "Cost" BCrypt = nombre d'itérations de l'algorithme.
    // Plus le coût est élevé, plus le hash est lent à calculer
    // et donc plus difficile à casser par force brute.
    //
    //   10 = rapide (développement)
    //   12 = bon compromis (recommandé)  ← ici
    //   14 = très sûr (production critique)
    // ------------------------------------------------------------
    private static final int COUT = 12;

    /**
     * Transforme un mot de passe en clair en un hash BCrypt.
     *
     * BCrypt génère automatiquement un "sel" aléatoire et l'intègre
     * dans le hash. Résultat : deux appels avec le même mot de passe
     * donneront DEUX hashs différents, et les deux seront valides.
     *
     * @param motDePasseClair Le mot de passe saisi par l'utilisateur
     * @return Le hash BCrypt (60 caractères commençant par "$2a$")
     */
    public String hash(String motDePasseClair) {
        // gensalt(COUT) génère un sel aléatoire avec le coût donné
        return BCrypt.hashpw(motDePasseClair, BCrypt.gensalt(COUT));
    }

    /**
     * Vérifie qu'un mot de passe en clair correspond à un hash stocké.
     *
     * @param motDePasseClair Le mot de passe saisi par l'utilisateur
     * @param hashStocke      Le hash récupéré depuis la base
     * @return true si ça correspond, false sinon
     */
    public boolean verifier(String motDePasseClair, String hashStocke) {

        // Sécurité : on refuse les valeurs nulles
        if (motDePasseClair == null || hashStocke == null) return false;

        try {
            return BCrypt.checkpw(motDePasseClair, hashStocke);
        } catch (IllegalArgumentException e) {
            // Le hash en BD n'est pas un BCrypt valide → on refuse
            return false;
        }
    }
}
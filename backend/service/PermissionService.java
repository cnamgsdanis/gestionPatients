package service;

import dao.PermissionDAO;
import java.sql.SQLException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service qui met en cache les permissions par rôle.
 * Évite une requête SQL à chaque appel HTTP.
 *
 * ⚠️ À appeler après chaque modification des permissions :
 *    PermissionService.reload();
 */
public class PermissionService {

    private static final PermissionDAO dao = new PermissionDAO();

    // Map : role → Set de codes de permissions
    // Ex: "medecin" → {"patient.lire", "ordonnance.creer", ...}
    //
    // ConcurrentHashMap : sûr en multithread (10 threads HTTP en même temps)
    private static final Map<String, Set<String>> cache = new ConcurrentHashMap<>();

    // ============================================================
    // 1. CHARGEMENT INITIAL (appelé au démarrage du serveur)
    // ============================================================
    public static void init() {
        reload();
        System.out.println("[PermissionService] Cache initialise. " +
                           cache.size() + " role(s) charge(s).");
    }

    // ============================================================
    // 2. RECHARGEMENT DU CACHE
    // ============================================================
    /**
     * Recharge les permissions depuis la base.
     * À appeler après chaque ajout/retrait de permission.
     */
    public static void reload() {
        cache.clear();
        String[] roles = {
            "administrateur", "agent_accueil", "pharmacien",
            "medecin", "directeur_structure", "caissier_structure"
        };
        try {
            for (String role : roles) {
                Set<String> codes = new HashSet<>(dao.findCodesByRole(role));
                cache.put(role, codes);
            }
        } catch (SQLException e) {
            System.err.println("[PermissionService] Erreur chargement : " + e.getMessage());
        }
    }

    // ============================================================
    // 3. VÉRIFICATION D'UNE PERMISSION
    // ============================================================
    /**
     * Vérifie si un rôle possède une permission.
     *
     * @param role Le rôle de l'utilisateur (depuis le token JWT)
     * @param code Le code de la permission (ex: "patient.supprimer")
     * @return true si le rôle a la permission
     */
    public static boolean hasPermission(String role, String code) {
        Set<String> codes = cache.get(role);
        return codes != null && codes.contains(code);
    }

    // ============================================================
    // 4. HELPER : liste des codes d'un rôle (pour l'API)
    // ============================================================
    public static Set<String> getCodesByRole(String role) {
        return cache.getOrDefault(role, Collections.emptySet());
    }

    public static Map<String, Set<String>> getAll() {
        return cache;
    }
}
package controller;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import dao.PermissionDAO;
import model.Permission;
import security.AuthGuard;
import service.PermissionService;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.*;

/**
 * Contrôleur des permissions (admin uniquement).
 *
 * Routes :
 *   GET    /api/permissions                          → toutes les permissions
 *   GET    /api/permissions/role/{role}              → codes d'un rôle
 *   POST   /api/permissions/role/{role}/{code}       → ajouter
 *   DELETE /api/permissions/role/{role}/{code}       → retirer
 *   GET    /api/permissions/matrix                   → matrice complète (role → permissions)
 */
public class PermissionController {

    private final PermissionDAO dao  = new PermissionDAO();
    private final Gson          gson = new Gson();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String path   = ex.getRequestURI().getPath();

        try {
            String[] parts = path.split("/");

            // GET /api/permissions
            if (parts.length == 3 && method.equals("GET")) {
                listerToutes(ex);
            }
            // GET /api/permissions/matrix
            else if (parts.length == 4 && parts[3].equals("matrix") && method.equals("GET")) {
                matrice(ex);
            }
            // GET /api/permissions/role/{role}
            else if (parts.length == 5 && parts[3].equals("role") && method.equals("GET")) {
                listerParRole(ex, parts[4]);
            }
            // POST /api/permissions/role/{role}/{code}
            else if (parts.length == 6 && parts[3].equals("role") && method.equals("POST")) {
                ajouter(ex, parts[4], parts[5]);
            }
            // DELETE /api/permissions/role/{role}/{code}
            else if (parts.length == 6 && parts[3].equals("role") && method.equals("DELETE")) {
                retirer(ex, parts[4], parts[5]);
            }
            else {
                sendJson(ex, 404, "{\"error\":\"Route inconnue\"}");
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(ex, 500, "{\"error\":\"" + escape(e.getMessage()) + "\"}");
        }
    }

    // ------------------------------------------------------------
    // GET /api/permissions
    // ------------------------------------------------------------
    private void listerToutes(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "permission.lire")) return;

        List<Permission> liste = dao.findAll();
        sendJson(ex, 200, gson.toJson(liste));
    }

    // ------------------------------------------------------------
    // GET /api/permissions/role/{role}
    // ------------------------------------------------------------
    private void listerParRole(HttpExchange ex, String role) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "permission.lire")) return;

        Set<String> codes = PermissionService.getCodesByRole(role);
        String json = "{"
            + "\"role\":\"" + role + "\","
            + "\"permissions\":" + gson.toJson(codes)
            + "}";
        sendJson(ex, 200, json);
    }

    // ------------------------------------------------------------
    // GET /api/permissions/matrix
    // Renvoie la matrice complète role → permissions
    // ------------------------------------------------------------
    private void matrice(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "permission.lire")) return;

        Map<String, Set<String>> all = PermissionService.getAll();
        sendJson(ex, 200, gson.toJson(all));
    }

    // ------------------------------------------------------------
    // POST /api/permissions/role/{role}/{code}
    // ------------------------------------------------------------
    private void ajouter(HttpExchange ex, String role, String code) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "permission.gerer")) return;

        // 1. Vérifier que la permission existe
        Permission p = dao.findByCode(code);
        if (p == null) {
            sendJson(ex, 404, "{\"error\":\"Permission inconnue : " + code + "\"}");
            return;
        }

        if (!model.Utilisateur.roleValide(role)) {
            sendJson(ex, 400, "{\"error\":\"Role invalide : " + escape(role) + "\"}");
            return;
        }

        // 2. Ajouter en base
        dao.addToRole(role, p.id_permission);

        // 3. Recharger le cache
        PermissionService.reload();
        service.Audit.ok(ex, security.AuthGuard.claimsOuNull(ex), "ADMIN", "permissions.modifier", "Permission accordée à un rôle",
            "Role", role, code, null, null, java.util.Map.of("role", role, "permission", code, "accordee", true));

        sendJson(ex, 200, "{\"message\":\"Permission ajoutee\"}");
    }

    // ------------------------------------------------------------
    // DELETE /api/permissions/role/{role}/{code}
    // ------------------------------------------------------------
    private void retirer(HttpExchange ex, String role, String code) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "permission.gerer")) return;

        Permission p = dao.findByCode(code);
        if (p == null) {
            sendJson(ex, 404, "{\"error\":\"Permission inconnue : " + code + "\"}");
            return;
        }

        boolean ok = dao.removeFromRole(role, p.id_permission);
        PermissionService.reload();
        if (ok) service.Audit.ok(ex, security.AuthGuard.claimsOuNull(ex), "ADMIN", "permissions.modifier", "Permission retirée à un rôle",
            "Role", role, code, null, null, java.util.Map.of("role", role, "permission", code, "accordee", false));

        sendJson(ex, ok ? 200 : 404,
                 ok ? "{\"message\":\"Permission retiree\"}" : "{\"error\":\"Non trouvee\"}");
    }

    // ---- Helpers ----

    private void sendJson(HttpExchange ex, int code, String json) throws IOException {
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String escape(String s) {
        return s == null ? "" : s.replace("\"", "'");
    }
}
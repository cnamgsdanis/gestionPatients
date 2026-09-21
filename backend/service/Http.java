// ============================================================
// Http.java — Utilitaires HTTP et configuration partagés par les nouveaux modules
// ------------------------------------------------------------
// Lecture du corps, réponse JSON, paramètres d'URL, adresse IP, réglages (config).
// Placé dans le paquet « service » pour que les commandes de compilation existantes
// (…/service/*.java) le trouvent sans changement.
// (Les anciens contrôleurs gardent leurs propres copies de ces
// méthodes ; les nouveaux modules s'appuient sur cette classe.)
// ============================================================
package service;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public final class Http {

    private Http() {}

    /** Gson partagé : ne transforme pas les apostrophes en '. */
    public static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();

    /** Corps de la requête, en UTF-8 (chaîne vide s'il n'y en a pas). */
    public static String body(HttpExchange ex) throws IOException {
        return new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    /** Corps de la requête parsé en JSON, ou null s'il est vide / invalide. */
    public static JsonElement jsonBody(HttpExchange ex) throws IOException {
        String b = body(ex);
        if (b.isBlank()) return null;
        try {
            return JsonParser.parseString(b);
        } catch (Exception e) {
            return null;
        }
    }

    /** Envoie un objet Java sérialisé en JSON. */
    public static void json(HttpExchange ex, int code, Object o) throws IOException {
        raw(ex, code, GSON.toJson(o));
    }

    /** Envoie une chaîne JSON déjà construite. */
    public static void raw(HttpExchange ex, int code, String json) throws IOException {
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    /** Erreur JSON { "error": "message" } avec le code HTTP donné. */
    public static void error(HttpExchange ex, int code, String message) throws IOException {
        Map<String, String> m = new HashMap<>();
        m.put("error", message == null ? "Erreur" : message);
        json(ex, code, m);
    }

    /** Paramètres de l'URL (?a=1&b=2), décodés. */
    public static Map<String, String> query(HttpExchange ex) {
        Map<String, String> params = new HashMap<>();
        String q = ex.getRequestURI().getRawQuery();
        if (q == null || q.isEmpty()) return params;
        for (String pair : q.split("&")) {
            int i = pair.indexOf('=');
            String k = i < 0 ? pair : pair.substring(0, i);
            String v = i < 0 ? "" : pair.substring(i + 1);
            params.put(URLDecoder.decode(k, StandardCharsets.UTF_8), URLDecoder.decode(v, StandardCharsets.UTF_8));
        }
        return params;
    }

    /** Adresse IP du client (en-tête X-Forwarded-For si un reverse proxy est devant). */
    public static String ip(HttpExchange ex) {
        String xff = ex.getRequestHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return ex.getRemoteAddress() == null ? "" : ex.getRemoteAddress().getAddress().getHostAddress();
    }

    // ------------------------------------------------------------------
    // Configuration : variable d'environnement > option -Dnom > fichier local > valeur par défaut.
    // Fichier local : db/local.properties (NON versionné, un par poste) ou le chemin donné par PEC_CONFIG_FILE.
    // Format .properties, mêmes noms que les variables (PEC_DB_URL, PEC_DB_USER, PEC_DB_PASSWORD, PEC_PORT, …) ;
    // pas d'antislash dans les valeurs. Modèle : db/local.properties.example.
    // ------------------------------------------------------------------
    private static final java.util.Properties LOCAL = chargerFichierLocal();

    private static java.util.Properties chargerFichierLocal() {
        java.util.Properties p = new java.util.Properties();
        String[] chemins = { System.getenv("PEC_CONFIG_FILE"), System.getProperty("PEC_CONFIG_FILE"), "db/local.properties", "backend/db/local.properties" };
        for (String c : chemins) {
            if (c == null || c.isBlank()) continue;
            java.nio.file.Path f = java.nio.file.Paths.get(c);
            if (!java.nio.file.Files.isRegularFile(f)) continue;
            try (java.io.Reader r = java.nio.file.Files.newBufferedReader(f, StandardCharsets.UTF_8)) {
                p.load(r);
                System.out.println("[Config] Fichier local lu : " + f.toAbsolutePath());
            } catch (IOException e) {
                System.err.println("[Config] Lecture impossible de " + f + " : " + e.getMessage());
            }
            break;
        }
        return p;
    }

    /** Valeur d'un réglage (voir ci-dessus), ou la valeur par défaut. */
    public static String config(String nom, String parDefaut) {
        String v = System.getenv(nom);
        if (v == null || v.isBlank()) v = System.getProperty(nom);
        if (v == null || v.isBlank()) v = LOCAL.getProperty(nom);
        return v == null || v.isBlank() ? parDefaut : v.trim();
    }

    /** Entier tiré de la requête (?page=2), avec valeur par défaut et bornes. */
    public static int entier(Map<String, String> q, String cle, int parDefaut, int min, int max) {
        try {
            int v = Integer.parseInt(q.getOrDefault(cle, ""));
            return Math.max(min, Math.min(max, v));
        } catch (NumberFormatException e) {
            return parDefaut;
        }
    }
}

package controller;

import com.sun.net.httpserver.HttpExchange;
import io.jsonwebtoken.Claims;
import security.AuthGuard;
import service.JwtService;
import service.PermissionService;
import service.Http;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * Photos des assurés : GET /media/patients/xxx.jpg
 *
 * Le serveur Java ne servait aucun fichier : les chemins stockés dans Patient.photo_url
 * (ex. « \backend\media\patients\patient_101.jpg ») n'étaient pas accessibles au navigateur.
 *
 * Accès protégé (ce sont des données personnelles) : jeton valide + permission patient.lire.
 * Une balise <img> ne pouvant pas envoyer d'en-tête, le jeton peut aussi être passé en ?token=…
 *
 * Dossier : variable PEC_MEDIA_DIR (défaut : « media » à côté de l'exécution, donc backend/media).
 * Aucune sortie du dossier n'est possible (« .. » refusé).
 */
public class MediaController {

    private static final Path RACINE = Paths.get(Http.config("PEC_MEDIA_DIR", "media")).toAbsolutePath().normalize();
    private final JwtService jwt = new JwtService();

    private static final Map<String, String> TYPES = Map.of(
        "jpg", "image/jpeg", "jpeg", "image/jpeg", "png", "image/png", "gif", "image/gif", "webp", "image/webp");

    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!ex.getRequestMethod().equals("GET")) { Http.error(ex, 405, "Methode non autorisee"); return; }

            Claims cl = AuthGuard.claimsOuNull(ex);
            if (cl == null) {
                String t = Http.query(ex).get("token");
                cl = t == null ? null : jwt.verifier(t);
            }
            if (cl == null) { Http.error(ex, 401, "Token manquant ou invalide"); return; }
            if (!PermissionService.hasPermission(AuthGuard.getRole(cl), "patient.lire")) { Http.error(ex, 403, "Permission refusee : patient.lire"); return; }

            String relatif = ex.getRequestURI().getPath().substring("/media/".length());
            Path fichier = RACINE.resolve(relatif).normalize();
            String nom = fichier.getFileName() == null ? "" : fichier.getFileName().toString().toLowerCase();
            String ext = nom.contains(".") ? nom.substring(nom.lastIndexOf('.') + 1) : "";
            if (!fichier.startsWith(RACINE) || !TYPES.containsKey(ext) || !Files.isRegularFile(fichier)) {
                Http.error(ex, 404, "Fichier introuvable");
                return;
            }
            byte[] octets = Files.readAllBytes(fichier);
            ex.getResponseHeaders().set("Content-Type", TYPES.get(ext));
            ex.getResponseHeaders().set("Cache-Control", "private, max-age=300");
            ex.sendResponseHeaders(200, octets.length);
            try (OutputStream os = ex.getResponseBody()) {
                os.write(octets);
            }
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, "Erreur serveur");
        }
    }
}

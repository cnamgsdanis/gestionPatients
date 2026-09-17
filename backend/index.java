// ============================================================
// index.java — Point d'entrée de l'application
// ------------------------------------------------------------
// C'est le premier fichier exécuté quand on lance le serveur.
// Il crée le serveur HTTP, enregistre les routes, et démarre.
// Ce fichier est SANS package (il est à la racine de backend/).
// ============================================================

// Import du serveur HTTP intégré au JDK (aucune dépendance externe)
import com.sun.net.httpserver.HttpServer;

// Import de nos contrôleurs
import controller.AuthController;
import controller.PatientController;
import controller.UtilisateurController;
import controller.PermissionController;
import service.PermissionService;

// Import pour définir l'adresse (IP + port) du serveur
import java.net.InetSocketAddress;

// Import pour créer un pool de threads (traitement parallèle des requêtes)
import java.util.concurrent.Executors;

public class index {

    public static void main(String[] args) throws Exception {

        // ------------------------------------------------------------
        // 1. Création du serveur HTTP
        //    - InetSocketAddress(8080) = écoute sur le port 8080
        //    - Le 2e paramètre (0) = taille du backlog par défaut
        // ------------------------------------------------------------
        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);

        // ------------------------------------------------------------
        // 2. Instanciation des contrôleurs
        //    Chaque contrôleur expose une méthode "handle" qui reçoit
        //    la requête HTTP et renvoie la réponse.
        // ------------------------------------------------------------
        AuthController        authController        = new AuthController();
        PatientController     patientController     = new PatientController();
        UtilisateurController utilisateurController = new UtilisateurController();
        PermissionController permissionController = new PermissionController();
        // ------------------------------------------------------------
        // 3. Enregistrement des routes
        //    - /api/auth/*         → géré par AuthController
        //    - /api/patients/*     → géré par PatientController
        //    - /api/utilisateurs/* → géré par UtilisateurController
        //    Le "::handle" est une référence de méthode (Java 8+).
        // ------------------------------------------------------------
        server.createContext("/api/auth",         authController::handle);
        server.createContext("/api/patients",     patientController::handle);
        server.createContext("/api/utilisateurs", utilisateurController::handle);
        server.createContext("/api/permissions", permissionController::handle);
        // ------------------------------------------------------------
        // 4. Configuration du pool de threads
        //    10 threads peuvent traiter 10 requêtes en même temps.
        //    Les requêtes suivantes attendent qu'un thread se libère.
        // ------------------------------------------------------------
        server.setExecutor(Executors.newFixedThreadPool(10));

        // ------------------------------------------------------------
        // 5. Démarrage du serveur
        // ------------------------------------------------------------
        PermissionService.init();   //  Charge les permissions en mémoire
        server.start();

        // ------------------------------------------------------------
        // 6. Messages affichés dans la console pour confirmer le démarrage
        // ------------------------------------------------------------
        System.out.println("====================================");
        System.out.println("API demarree sur http://localhost:8080");
        System.out.println("  POST /api/auth/register");
        System.out.println("  POST /api/auth/login");
        System.out.println("  GET/POST/PUT/DELETE /api/patients");
        System.out.println("  GET/PUT/DELETE      /api/utilisateurs (admin)");
        System.out.println("================= API DO BY DANIS@TECH END EVANN ===================");
    }
}
// ============================================================
// index.java — Point d'entrée de l'application
// ------------------------------------------------------------
// C'est le premier fichier exécuté quand on lance le serveur.
// Il crée le serveur HTTP, enregistre les routes, et démarre.
// Ce fichier est SANS package (il est à la racine de backend/).
// ============================================================

// Import du serveur HTTP intégré au JDK (aucune dépendance externe)
import com.sun.net.httpserver.HttpServer;

// Import de nos deux contrôleurs (chacun gère ses propres routes)
import controller.AuthController;
import controller.PatientController;

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
        AuthController    authController    = new AuthController();
        PatientController patientController = new PatientController();

        // ------------------------------------------------------------
        // 3. Enregistrement des routes
        //    - /api/auth/*     → géré par AuthController
        //    - /api/patients/* → géré par PatientController
        //    Le "::handle" est une référence de méthode (Java 8+).
        // ------------------------------------------------------------
        server.createContext("/api/auth",     authController::handle);
        server.createContext("/api/patients", patientController::handle);

        // ------------------------------------------------------------
        // 4. Configuration du pool de threads
        //    10 threads peuvent traiter 10 requêtes en même temps.
        //    Les requêtes suivantes attendent qu'un thread se libère.
        // ------------------------------------------------------------
        server.setExecutor(Executors.newFixedThreadPool(10));

        // ------------------------------------------------------------
        // 5. Démarrage du serveur
        // ------------------------------------------------------------
        server.start();

        // ------------------------------------------------------------
        // 6. Messages affichés dans la console pour confirmer le démarrage
        // ------------------------------------------------------------
        System.out.println("====================================");
        System.out.println("API demarree sur http://localhost:8080");
        System.out.println("  POST /api/auth/register");
        System.out.println("  POST /api/auth/login");
        System.out.println("  GET/POST/PUT/DELETE /api/patients");
        System.out.println("====================================");
    }
}
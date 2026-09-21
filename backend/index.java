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
import controller.ConsultationController;
import controller.ExamenController;
import service.PermissionService;
import controller.StructureController;
import controller.OrdonnanceController;
import controller.MedicamentController;
import controller.PrestationController;
import service.CouvertureService;
import service.TarifService;
import controller.PharmacieController;
import controller.PriseEnChargeController;
import controller.FeuilleController;
import controller.AnnuaireController;
import controller.ReglementController;
import controller.NotificationController;
import controller.ParametreController;
import controller.JournalController;
import controller.MediaController;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpHandler;
import security.AuditFilter;
import security.CorsFilter;
import service.JournalService;

// Import pour définir l'adresse (IP + port) du serveur
import java.net.InetSocketAddress;

// Import pour créer un pool de threads (traitement parallèle des requêtes)
import java.util.concurrent.Executors;

public class index {

    /** Enregistre un contexte et lui attache les filtres donnés. */
    private static void route(HttpServer server, String chemin, HttpHandler handler, com.sun.net.httpserver.Filter... filtres) {
        HttpContext ctx = server.createContext(chemin, handler);
        for (com.sun.net.httpserver.Filter f : filtres) ctx.getFilters().add(f);
    }

    public static void main(String[] args) throws Exception {

        // ------------------------------------------------------------
        // 1. Création du serveur HTTP
        // - InetSocketAddress(8080) = écoute sur le port 8080
        // - Le 2e paramètre (0) = taille du backlog par défaut
        // ------------------------------------------------------------
        // Port : 8080 par défaut ; PEC_PORT (variable d'environnement) ou -DPEC_PORT=... pour en changer
        int port = Integer.parseInt(service.Http.config("PEC_PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        // ------------------------------------------------------------
        // 2. Instanciation des contrôleurs
        // Chaque contrôleur expose une méthode "handle" qui reçoit
        // la requête HTTP et renvoie la réponse.
        // ------------------------------------------------------------
        AuthController authController = new AuthController();
        PatientController patientController = new PatientController();
        UtilisateurController utilisateurController = new UtilisateurController();
        PermissionController permissionController = new PermissionController();
        StructureController structureController = new StructureController();
        OrdonnanceController ordonnanceController = new OrdonnanceController();
        MedicamentController medicamentController = new MedicamentController();
        PrestationController prestationController = new PrestationController();
        PharmacieController pharmacieController = new PharmacieController();
        ConsultationController consultationController = new ConsultationController();
        ExamenController examenController = new ExamenController();
        PriseEnChargeController pecController = new PriseEnChargeController();
        FeuilleController feuilleController = new FeuilleController();
        AnnuaireController annuaireController = new AnnuaireController();
        ReglementController reglementController = new ReglementController();
        NotificationController notificationController = new NotificationController();
        JournalController journalController = new JournalController();
        MediaController mediaController = new MediaController();
        ParametreController parametreController = new ParametreController();

        // ------------------------------------------------------------
        // 3. Enregistrement des routes
        // - /api/auth/* → géré par AuthController
        // - /api/patients/* → géré par PatientController
        // - /api/utilisateurs/* → géré par UtilisateurController
        // - /api/consultations/* → géré par ConsultationController (dossier patient)
        // - /api/examens/* → géré par ExamenController (dossier patient)
        // Le "::handle" est une référence de méthode (Java 8+).
        // ------------------------------------------------------------
        // Chaque contexte reçoit deux filtres : CORS (en-têtes + OPTIONS) puis journal d'audit (401 / 403 / 5xx).
        CorsFilter cors = new CorsFilter();
        AuditFilter audit = new AuditFilter();
        route(server, "/api/auth", authController::handle, cors, audit);
        route(server, "/api/patients", patientController::handle, cors, audit);
        route(server, "/api/utilisateurs", utilisateurController::handle, cors, audit);
        route(server, "/api/permissions", permissionController::handle, cors, audit);
        route(server, "/api/structures", structureController::handle, cors, audit);
        route(server, "/api/ordonnances", ordonnanceController::handle, cors, audit);
        route(server, "/api/medicaments", medicamentController::handle, cors, audit);
        route(server, "/api/prestations", prestationController::handle, cors, audit);
        route(server, "/api/pharmacie", pharmacieController::handle, cors, audit);
        route(server, "/api/consultations", consultationController::handle, cors, audit);
        route(server, "/api/examens", examenController::handle, cors, audit);
        route(server, "/api/prises-en-charge", pecController::handle, cors, audit);
        // --- Modules d'intégration du front (backend/docs/05-integration-front.md) ---
        route(server, "/api/feuilles", feuilleController::handle, cors, audit);
        route(server, "/api/medecins", annuaireController::handle, cors, audit);
        route(server, "/api/catalogue", annuaireController::handle, cors, audit);
        route(server, "/api/reglements", reglementController::handle, cors, audit);
        route(server, "/api/notifications", notificationController::handle, cors, audit);
        route(server, "/api/journal", journalController::handle, cors, audit);
        route(server, "/api/parametres", parametreController::handle, cors, audit);
        route(server, "/media", mediaController::handle, cors);

        // ------------------------------------------------------------
        // 4. Configuration du pool de threads
        // 10 threads peuvent traiter 10 requêtes en même temps.
        // Les requêtes suivantes attendent qu'un thread se libère.
        // ------------------------------------------------------------
        server.setExecutor(Executors.newFixedThreadPool(10));

        // ------------------------------------------------------------
        // 5. Démarrage du serveur
        // ------------------------------------------------------------
        PermissionService.init(); // Charge les permissions en mémoire
        service.CouvertureService.init();
        service.TarifService.init();
        server.start();

        // ------------------------------------------------------------
        // 6. Messages affichés dans la console pour confirmer le démarrage
        // ------------------------------------------------------------
        System.out.println("====================================");
        System.out.println("API demarree sur http://localhost:" + port);
        System.out.println("  POST /api/auth/register");
        System.out.println("  POST /api/auth/login");
        System.out.println("  GET/POST/PUT/DELETE /api/patients");
        System.out.println("  GET/PUT/DELETE      /api/utilisateurs (admin)");
        System.out.println("  GET/POST/PUT        /api/consultations (pas de DELETE)");
        System.out.println("  GET/POST/PUT        /api/examens (pas de DELETE)");
        System.out.println("  /api/feuilles  /api/medecins  /api/catalogue  /api/reglements  /api/notifications  /api/journal  /api/parametres  /media");
        System.out.println("================= API DO BY DANIS@TECH END EVANN ===================");
    }
}

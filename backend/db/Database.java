package db;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class Database {

    // ------------------------------------------------------------
    // Configuration de la connexion.
    // Les valeurs par défaut sont celles de l'ancienne version ; on peut les remplacer SANS modifier
    // le code : variable d'environnement, option -D, ou fichier local db/local.properties (non versionné,
    // voir db/local.properties.example) :
    //   PEC_DB_URL       ex. jdbc:sqlserver://localhost;instanceName=SQLEXPRESS;databaseName=gestionpatient;encrypt=true;trustServerCertificate=true
    //   PEC_DB_USER      ex. sa
    //   PEC_DB_PASSWORD  (à définir en production : ne plus laisser de mot de passe dans le code)
    // ------------------------------------------------------------
    private static final String URL = valeur("PEC_DB_URL",
        "jdbc:sqlserver://localhost:1433;databaseName=gestionpatient;encrypt=true;trustServerCertificate=true");
    private static final String USER = valeur("PEC_DB_USER", "sa");
    private static final String PASSWORD = valeur("PEC_DB_PASSWORD", "*20Danis@");

    static {
        try {
            Class.forName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
        } catch (ClassNotFoundException e) {
            throw new RuntimeException("Driver SQL Server introuvable", e);
        }
    }

    private static String valeur(String nom, String parDefaut) {
        return service.Http.config(nom, parDefaut);
    }

    public static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(URL, USER, PASSWORD);
    }
}

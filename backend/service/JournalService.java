// ============================================================
// JournalService.java — Journal d'audit : écriture, risque, intégrité
// ------------------------------------------------------------
// - log()       : enregistre un événement (ne lève JAMAIS d'exception :
//                 une panne du journal ne doit pas bloquer l'application)
// - évaluation  : règles de détection → score 0-100 → sévérité
// - alertes     : score >= 50 → notification de sécurité aux administrateurs
// - intégrité   : chaque événement porte un HMAC-SHA256 qui inclut
//                 l'empreinte du précédent (chaîne) ; verifierIntegrite()
//                 détecte toute modification ou suppression.
// La table est en ajout seul (déclencheurs SQL). Un seul serveur doit
// écrire dans le journal (la chaîne est tenue en mémoire par verrou).
// ============================================================
package service;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dao.JournalDAO;
import dao.NotificationDAO;
import db.Database;
import model.JournalEvenement;
import model.JournalEvenement.JournalRegle;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class JournalService {

    private static final JournalDAO dao = new JournalDAO();
    private static final NotificationDAO notifDao = new NotificationDAO();
    private static final Object VERROU = new Object();
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS");

    // Clé HMAC de la chaîne d'empreintes (PEC_AUDIT_KEY, sinon dérivée de la clé JWT)
    private static final String CLE = Http.config("PEC_AUDIT_KEY",
        Http.config("PEC_JWT_SECRET", "GestionPatients_Super_Secret_Key_2026_Change_Me_In_Prod!") + "|journal");

    // Pas plus d'une notification par (action, compte) et par quart d'heure
    private static final Map<String, Long> DERNIERES_ALERTES = new ConcurrentHashMap<>();

    /** Actions d'administration sensibles : points de risque et libellé de la règle. */
    private static final Map<String, Object[]> SENSIBLES = new HashMap<>();
    static {
        SENSIBLES.put("utilisateur.creer",             new Object[]{20, "Création d'un compte"});
        SENSIBLES.put("utilisateur.supprimer",         new Object[]{40, "Suppression d'un compte"});
        SENSIBLES.put("utilisateur.desactiver",        new Object[]{30, "Désactivation d'un compte"});
        SENSIBLES.put("utilisateur.modifier",          new Object[]{15, "Modification d'un compte (rôle possible)"});
        SENSIBLES.put("utilisateur.mdp.reinitialiser", new Object[]{30, "Réinitialisation d'un mot de passe"});
        SENSIBLES.put("permissions.modifier",          new Object[]{40, "Modification des permissions d'un rôle"});
        SENSIBLES.put("structure.supprimer",           new Object[]{30, "Suppression d'une structure"});
    }

    // ============================================================
    // ÉCRITURE
    // ============================================================

    /** Enregistre l'événement (score, sévérité, empreinte). Ne lève jamais d'exception. */
    public static void log(JournalEvenement e) {
        try {
            ecrire(e);
        } catch (Exception ex) {
            System.err.println("[Journal] Événement non enregistré (" + e.action + ") : " + ex.getMessage());
        }
    }

    private static void ecrire(JournalEvenement e) throws Exception {
        synchronized (VERROU) {
            try (Connection c = Database.getConnection()) {
                List<JournalRegle> regles = new ArrayList<>();
                if (e.reglesSupp != null) regles.addAll(e.reglesSupp);
                evaluer(c, e, regles);
                int total = 0;
                for (JournalRegle r : regles) total += r.points;
                e.score = Math.min(100, total);
                e.severite = e.score >= 80 ? "CRITIQUE" : e.score >= 50 ? "ALERTE" : e.score >= 25 ? "ATTENTION" : "INFO";
                e.regles = Http.GSON.toJson(regles);
                if (e.resultat == null) e.resultat = "SUCCES";

                LocalDateTime maintenant = LocalDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
                normaliser(e);
                e.horodatage = maintenant.format(FMT);
                e.hashPrecedent = dao.dernierHash(c);
                e.hash = calculerHash(e);
                e.id = dao.inserer(c, e, maintenant);

                if (e.score >= 50) notifierAdministrateurs(c, e, regles);
            }
        }
    }

    // ============================================================
    // RÈGLES DE DÉTECTION
    // ============================================================
    private static void evaluer(Connection c, JournalEvenement e, List<JournalRegle> r) throws Exception {
        String a = e.action == null ? "" : e.action;
        LocalDateTime local = LocalDateTime.now();

        if ("auth.login.echec".equals(a)) {
            int n = 1 + dao.echecsLogin(c, e.login, 10);
            if (n >= 5) r.add(new JournalRegle("LOGIN_ECHECS_REPETES", n + " échecs de connexion en 10 minutes", 80));
            else if (n >= 3) r.add(new JournalRegle("LOGIN_ECHECS_REPETES", n + " échecs de connexion en 10 minutes", 50));
            int comptes = dao.comptesEnEchecParIp(c, e.ip, 10, e.login);
            if (comptes >= 3) r.add(new JournalRegle("LOGIN_MULTI_COMPTES", "Échecs sur " + comptes + " comptes depuis la même adresse", 40));
        } else if ("auth.login.succes".equals(a)) {
            int n = dao.echecsLogin(c, e.login, 10);
            if (n >= 3) r.add(new JournalRegle("LOGIN_APRES_ECHECS", "Connexion réussie après " + n + " échecs", 40));
            int h = local.getHour();
            if (h < 6 || h >= 21) r.add(new JournalRegle("HORS_HORAIRES", "Connexion en dehors des heures de travail", 15));
            DayOfWeek j = local.getDayOfWeek();
            if (j == DayOfWeek.SATURDAY || j == DayOfWeek.SUNDAY) r.add(new JournalRegle("WEEKEND", "Connexion pendant le week-end", 10));
        }

        if ("REFUSE".equals(e.resultat) && !a.startsWith("auth.login")) {
            r.add(new JournalRegle("ACCES_REFUSE", "Action refusée (droits ou règle métier)", 20));
        }

        Object[] sensible = SENSIBLES.get(a);
        if (sensible != null && "SUCCES".equals(e.resultat)) {
            r.add(new JournalRegle("ACTION_SENSIBLE", (String) sensible[1], (Integer) sensible[0]));
        }

        if ("paiement.enregistrer".equals(a) && "SUCCES".equals(e.resultat) && e.apres != null) {
            try {
                JsonElement el = JsonParser.parseString(e.apres);
                if (el.isJsonObject() && el.getAsJsonObject().has("montant")
                        && el.getAsJsonObject().get("montant").getAsDouble() >= 5_000_000d) {
                    r.add(new JournalRegle("PAIEMENT_ELEVE", "Paiement d'au moins 5 000 000 FCFA", 30));
                }
            } catch (Exception ignore) { /* apres n'est pas un JSON exploitable */ }
        }

        if (e.idUtilisateur != null) {
            if (dao.evenementsDepuisSecondes(c, e.idUtilisateur, 60) >= 60) {
                r.add(new JournalRegle("CADENCE_ELEVEE", "Plus de 60 actions en une minute", 30));
            }
            if (("patient.rechercher".equals(a) || "dossier.ouvrir".equals(a) || "pharma.rechercher".equals(a))
                    && dao.assuresDistinctsDepuis(c, e.idUtilisateur, 10) >= 10) {
                r.add(new JournalRegle("CONSULTATION_MASSIVE", "10 assurés différents consultés en 10 minutes", 30));
            }
            if (("rapport.exporter".equals(a) || "journal.exporter".equals(a))
                    && dao.actionsDepuis(c, e.idUtilisateur, a, 10) >= 4) {
                r.add(new JournalRegle("EXPORTS_EN_RAFALE", "Exports répétés en 10 minutes", 20));
            }
        }
    }

    // ============================================================
    // NOTIFICATION DES ADMINISTRATEURS
    // ============================================================
    private static void notifierAdministrateurs(Connection c, JournalEvenement e, List<JournalRegle> regles) {
        try {
            long maintenant = System.currentTimeMillis();
            String cle = e.action + "|" + (e.login == null ? e.ip : e.login);
            Long derniere = DERNIERES_ALERTES.get(cle);
            if (derniere != null && maintenant - derniere < 15 * 60_000L) return;
            DERNIERES_ALERTES.put(cle, maintenant);

            regles.sort((x, y) -> y.points - x.points);
            String titre = (e.score >= 80 ? "Alerte critique : " : "Activité inhabituelle : ") + (regles.isEmpty() ? e.action : regles.get(0).label);
            String qui = e.nomAffiche != null ? e.nomAffiche + " (" + e.login + ")" : (e.login != null ? e.login : "compte inconnu");
            StringBuilder msg = new StringBuilder(e.libelle != null ? e.libelle : e.action)
                .append(" — ").append(qui);
            if (e.ip != null && !e.ip.isBlank()) msg.append(" — adresse ").append(e.ip);
            msg.append(". Score de risque ").append(e.score).append("/100 : ");
            for (int i = 0; i < regles.size(); i++) msg.append(i > 0 ? " ; " : "").append(regles.get(i).label);
            msg.append(".");

            List<Integer> admins = notifDao.administrateursActifs(c);
            if (admins.isEmpty()) return;
            int id = notifDao.creer(c, null, "role", "administrateur", titre,
                msg.length() > 1900 ? msg.substring(0, 1900) : msg.toString(),
                e.score >= 80 ? "urgente" : "importante", "securite", true, null);
            notifDao.ajouterDestinataires(c, id, admins);
        } catch (Exception ex) {
            System.err.println("[Journal] Notification de sécurité non envoyée : " + ex.getMessage());
        }
    }

    // ============================================================
    // INTÉGRITÉ (chaîne d'empreintes)
    // ============================================================

    /**
     * Ramène les champs entrant dans l'empreinte à ce que la base conservera (longueurs des colonnes),
     * pour que l'empreinte recalculée à la relecture soit identique à celle calculée à l'écriture.
     */
    private static void normaliser(JournalEvenement e) {
        e.login = cut(e.login, 50);
        e.role = cut(e.role, 30);
        e.categorie = cut(e.categorie, 40);
        e.action = cut(e.action, 80);
        e.resultat = cut(e.resultat, 10);
        e.message = cut(e.message, 500);
        e.ressourceType = cut(e.ressourceType, 40);
        e.ressourceId = cut(e.ressourceId, 60);
        e.ip = cut(e.ip, 60);
    }

    private static String cut(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    /** Heure au format unique de l'empreinte, que la date vienne de l'écriture ou d'une relecture (« …Z »). */
    private static String horoNorm(String h) {
        if (h == null) return "";
        String iso = h.endsWith("Z") ? h : h + "Z";
        return LocalDateTime.ofInstant(java.time.Instant.parse(iso), ZoneOffset.UTC).format(FMT);
    }

    /** HMAC-SHA256 (hex) des champs de l'événement + de l'empreinte précédente. */
    static String calculerHash(JournalEvenement e) throws Exception {
        String contenu = String.join("|",
            nz(e.hashPrecedent), horoNorm(e.horodatage), nz(e.origine), String.valueOf(e.idUtilisateur), nz(e.login), nz(e.role),
            nz(e.categorie), nz(e.action), nz(e.resultat), nz(e.ressourceType), nz(e.ressourceId), nz(e.message),
            nz(e.ip), nz(e.avant), nz(e.apres), String.valueOf(e.score));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(CLE.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] h = mac.doFinal(contenu.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : h) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static String nz(String s) { return s == null ? "" : s; }

    /**
     * Relit tout le journal et vérifie la chaîne.
     * @return { ok, verifies, rupture: { seq, why } }
     */
    public static JsonObject verifierIntegrite() throws Exception {
        JsonObject res = new JsonObject();
        synchronized (VERROU) {
            try (Connection c = Database.getConnection()) {
                List<JournalEvenement> tous = dao.tous(c);
                String attendu = null;
                int verifies = 0;
                for (JournalEvenement e : tous) {
                    String pourquoi = null;
                    if (!Objects.equals(nzNull(e.hashPrecedent), nzNull(attendu))) pourquoi = "chaîne rompue (événement précédent modifié ou supprimé)";
                    else {
                        String recalcule = calculerHash(e);
                        if (!recalcule.equals(e.hash)) pourquoi = "contenu modifié après enregistrement";
                    }
                    if (pourquoi != null) {
                        JsonObject rupture = new JsonObject();
                        rupture.addProperty("seq", e.id);
                        rupture.addProperty("why", pourquoi);
                        res.addProperty("ok", false);
                        res.addProperty("verifies", verifies);
                        res.add("rupture", rupture);
                        return res;
                    }
                    attendu = e.hash;
                    verifies++;
                }
                res.addProperty("ok", true);
                res.addProperty("verifies", verifies);
                res.add("rupture", null);
            }
        }
        return res;
    }

    private static String nzNull(String s) { return s == null ? "" : s; }

    // ============================================================
    // OUTILS POUR LES APPELANTS
    // ============================================================

    /** 123 *** *** 1 à partir d'un NAG de 10 chiffres. */
    public static String masquerNag(String nag) {
        if (nag == null) return null;
        String d = nag.replaceAll("\\D", "");
        return d.length() == 10 ? d.substring(0, 3) + " *** *** " + d.substring(9) : null;
    }

    /** Événement pré-rempli à partir des claims du jeton (acteur). */
    public static JournalEvenement pour(io.jsonwebtoken.Claims claims) {
        JournalEvenement e = new JournalEvenement();
        if (claims != null) {
            e.idUtilisateur = security.AuthGuard.getIdUtilisateur(claims);
            e.login = security.AuthGuard.getUsername(claims);
            e.role = security.AuthGuard.getRole(claims);
            int s = security.AuthGuard.getIdStructure(claims);
            e.idStructure = s == 0 ? null : s;
            try {
                model.Utilisateur u = new dao.UtilisateurDAO().findById(e.idUtilisateur);
                if (u != null) {
                    e.nomAffiche = ((u.prenom == null ? "" : u.prenom + " ") + (u.nom == null ? "" : u.nom)).trim();
                    e.etablissement = u.structure_nom;
                }
            } catch (Exception ignore) { /* le nom affiché est facultatif */ }
        }
        return e;
    }
}

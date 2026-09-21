// ============================================================
// FeuilleService.java — Feuilles de soins : règles métier et droits par rôle
// ------------------------------------------------------------
// Une feuille est stockée telle que l'interface la manipule (JSON) ; le serveur reste MAÎTRE de :
//   serverId, numero, date, statut, type            → jamais repris du client
//   la partie « accueil » (identité, ticket modérateur, médecin désigné…) → verrouillée après la création
//   les champs de DÉLIVRANCE de l'ordonnance (statut Servi, prix, parts, pharmacie, date)
//       → calculés ICI à partir du prix saisi par le pharmacien
//
// Droits par rôle (en plus de la permission de la route) :
//   agent_accueil : crée une feuille de CONSULTATION ; peut corriger l'accueil tant qu'elle est « En attente »
//   medecin       : crée une feuille d'EXAMEN ; remplit sa partie ; VALIDE (validation = Prestation + PEC
//                   + Examen/Ordonnance créés dans la même transaction)
//   pharmacien    : ne modifie QUE la délivrance d'une feuille validée avec ordonnance ; il sert tout ou PARTIE
//                   de chaque ligne (rupture de stock : le reste sera servi par une autre pharmacie)
//   administrateur: supprime (si rien n'a été servi) ; en MODE SUPERVISION (contrôles anti-fraude désactivés, voir
//                   ControleService) il peut réaliser lui-même toutes les étapes du circuit
// Un assuré SUSPENDU ne peut recevoir aucune prestation : création, validation et délivrance → 409.
// ============================================================
package service;

import com.google.gson.*;
import com.sun.net.httpserver.HttpExchange;
import dao.*;
import db.Database;
import io.jsonwebtoken.Claims;
import model.JournalEvenement;
import model.JournalEvenement.JournalRegle;
import model.Patient;
import model.Utilisateur;
import security.AuthGuard;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Connection;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class FeuilleService {

    /** Refus métier : code HTTP + message affiché tel quel par l'interface. */
    public static class Erreur extends Exception {
        public final int code;
        public Erreur(int code, String message) { super(message); this.code = code; }
    }

    private static final FeuilleDAO dao = new FeuilleDAO();
    private static final PatientDAO patientDao = new PatientDAO();
    private static final UtilisateurDAO userDao = new UtilisateurDAO();
    private static final CatalogueDAO catalogueDao = new CatalogueDAO();

    private static final DateTimeFormatter FR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /** Champs gérés par le serveur : jamais repris du client. */
    private static final Set<String> CLES_SERVEUR = Set.of("serverId", "numero", "date", "statut", "type", "id");
    /** Identité de l'assuré : jamais modifiable après la création, même en mode supervision. */
    private static final Set<String> CLES_IDENTITE = Set.of("matricule", "patientNom", "dateNaissance", "estAssure", "fonds", "natureAssure");
    /** Partie « accueil » : identité de l'assuré, ticket modérateur, médecin désigné, coordonnées. */
    private static final Set<String> CLES_ACCUEIL = Set.of("matricule", "patientNom", "dateNaissance", "estAssure", "fonds", "natureAssure",
        "ticketModerateur", "medecinId", "medecin", "medecinCode", "medecinType", "medecinEtab", "quartier", "telephone", "service",
        "accidentTiers", "grossesse");

    // ============================================================
    // CRÉATION
    // ============================================================
    public static JsonObject creer(HttpExchange ex, Claims cl, JsonObject in) throws Exception {
        String role = AuthGuard.getRole(cl);
        int idUser = AuthGuard.getIdUtilisateur(cl);

        String nag = chiffres(str(in, "matricule"));
        if (!nag.matches("[0-9]{10}")) throw new Erreur(400, "Matricule (NAG) invalide : 10 chiffres attendus.");
        Patient p = patientDao.findByNag(nag);
        if (p == null) throw new Erreur(404, "Aucun assuré avec ce NAG.");

        String type = "Examen".equalsIgnoreCase(str(in, "type")) ? "examen" : "consultation";
        if ("agent_accueil".equals(role) && !"consultation".equals(type)) throw new Erreur(403, "L'accueil ne crée que des feuilles de consultation.");
        if ("medecin".equals(role) && !"examen".equals(type)) throw new Erreur(403, "Le médecin ne crée que des feuilles d'examen.");
        if (!Arrays.asList("agent_accueil", "medecin", "administrateur").contains(role)) throw new Erreur(403, "Ce rôle ne peut pas créer de feuille.");

        Long idClient = longOrNull(in, "id");
        if (idClient == null || idClient <= 0) throw new Erreur(400, "Identifiant de la feuille (id) obligatoire.");

        if (!p.statut_assure) {
            Audit.refus(ex, cl, "PEC", "pec.creer", "Prise en charge refusée", "REFUSE", "Assuré suspendu : aucune prestation possible", "Patient", p.id_patient, nag);
            throw new Erreur(409, "Assuré suspendu : aucune prestation possible. La prise en charge ne peut pas être enregistrée tant que la situation n'est pas régularisée.");
        }

        Integer idMedecin = intOrNull(in, "medecinId");
        if ("medecin".equals(role)) idMedecin = idUser;
        if (idMedecin != null) {
            Utilisateur m = userDao.findById(idMedecin);
            if (m == null || !m.aProfil("medecin") || !m.actif) throw new Erreur(400, "Médecin désigné introuvable ou inactif.");
        }

        JsonObject contenu = nettoyerServeur(in);
        contenu.addProperty("matricule", nag);
        cleanOrdonnance(contenu, false);

        FeuilleDAO.Row r = new FeuilleDAO.Row();
        r.idClient = idClient;
        r.type = type;
        r.statut = "en_attente";
        r.nag = nag;
        r.idPatient = p.id_patient;
        r.idMedecin = idMedecin;
        r.idAgent = idUser;
        r.idStructure = AuthGuard.getIdStructure(cl);
        if ("administrateur".equals(role) && idMedecin != null) r.idStructure = userDao.findById(idMedecin).id_structure;   // visible par l'hôpital du médecin
        r.dateFeuille = LocalDate.now().toString();
        r.avecOrdonnance = false;
        r.contenu = contenu.toString();

        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                if (dao.idClientExiste(c, idClient)) throw new Erreur(409, "Identifiant de feuille déjà utilisé : réessayez.");
                dao.inserer(c, r);
                c.commit();
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
        }

        String action = "examen".equals(type) ? "examen.recommander" : "pec.creer";
        Audit.ok(ex, cl, "examen".equals(type) ? "EXAMEN" : "PEC", action, "examen".equals(type) ? "Feuille d'examen ajoutée" : "Prise en charge créée",
            "Feuille", r.numero, p.prenom + " " + p.nom, nag, null, Map.of("numero", r.numero, "type", type));
        return versJson(r);
    }

    // ============================================================
    // LISTE (visibilité propre à chaque rôle)
    // ============================================================
    public static List<JsonObject> lister(Claims cl, Map<String, String> q) throws Exception {
        String role = AuthGuard.getRole(cl);
        int idUser = AuthGuard.getIdUtilisateur(cl);
        int idStruct = AuthGuard.getIdStructure(cl);

        FeuilleDAO.Filtre f = new FeuilleDAO.Filtre();
        String nag = chiffres(q.get("nag"));
        if (!nag.isEmpty()) {
            if (nag.length() != 10) return new ArrayList<>();
            f.nag = nag;
        }
        f.statut = statutDb(q.get("statut"));
        f.type = typeDb(q.get("type"));
        f.avecOrdonnance = vrai(q.get("avec_ordonnance"));
        f.depuis = dateIso(q.get("depuis"));
        f.jusqua = dateIso(q.get("jusqua"));

        switch (role) {
            case "administrateur", "directeur_structure", "caissier_structure" -> { /* tout voir */ }
            case "agent_accueil" -> { f.visibiliteSql = "AND f.id_structure = ?"; f.visibiliteParams.add(idStruct); }
            case "medecin" -> { f.visibiliteSql = "AND (f.id_medecin = ? OR f.id_structure = ?)"; f.visibiliteParams.add(idUser); f.visibiliteParams.add(idStruct); }
            case "pharmacien" -> {
                // Pas de navigation libre dans les dossiers : par NAG, ou ce que MA pharmacie a servi.
                boolean parMoi = vrai(q.get("servi_par_moi"));
                if (nag.isEmpty() && !parMoi) return new ArrayList<>();
                f.statut = "validee";
                f.type = "consultation";
                f.avecOrdonnance = true;
                if (parMoi) {
                    f.visibiliteSql = "AND EXISTS (SELECT 1 FROM Ordonnance o JOIN Ordonnance_ligne l ON l.id_ordonnance = o.id_ordonnance " +
                                      "JOIN Ordonnance_delivrance d ON d.id_ligne = l.id_ligne " +
                                      "WHERE o.id_prestation = f.id_prestation AND d.id_structure_pharmacie = ?)";
                    f.visibiliteParams.add(idStruct);
                }
            }
            default -> { return new ArrayList<>(); }
        }
        return versJsonList(dao.lister(f));
    }

    public static JsonObject compteurs(Claims cl) throws Exception {
        String role = AuthGuard.getRole(cl);
        int idUser = AuthGuard.getIdUtilisateur(cl);
        int idStruct = AuthGuard.getIdStructure(cl);
        int enAttente = 0, aServir = 0;
        switch (role) {
            case "medecin" -> enAttente = dao.patientsEnAttente("AND f.id_medecin = ?", List.of(idUser));
            case "agent_accueil" -> enAttente = dao.patientsEnAttente("AND f.id_structure = ?", List.of(idStruct));
            case "administrateur", "directeur_structure", "caissier_structure" -> enAttente = dao.patientsEnAttente(null, List.of());
            case "pharmacien" -> aServir = dao.ordonnancesAServir();
            default -> { }
        }
        JsonObject o = new JsonObject();
        o.addProperty("en_attente_medecin", enAttente);
        o.addProperty("ordonnances_a_servir", aServir);
        return o;
    }

    public static JsonObject lire(Claims cl, int id) throws Exception {
        FeuilleDAO.Row r = dao.trouver(id);
        if (r == null) throw new Erreur(404, "Feuille introuvable.");
        String role = AuthGuard.getRole(cl);
        boolean ok = switch (role) {
            case "administrateur", "directeur_structure", "caissier_structure" -> true;
            case "agent_accueil" -> r.idStructure == AuthGuard.getIdStructure(cl);
            case "medecin" -> Objects.equals(r.idMedecin, AuthGuard.getIdUtilisateur(cl)) || r.idStructure == AuthGuard.getIdStructure(cl);
            case "pharmacien" -> "validee".equals(r.statut) && r.avecOrdonnance;
            default -> false;
        };
        if (!ok) throw new Erreur(403, "Vous n'avez pas accès à cette feuille.");
        return versJsonList(List.of(r)).get(0);
    }

    // ============================================================
    // MODIFICATION (brouillon, validation ou délivrance selon le rôle)
    // ============================================================
    public static JsonObject modifier(HttpExchange ex, Claims cl, int id, JsonObject in) throws Exception {
        String role = AuthGuard.getRole(cl);
        List<Runnable> apresCommit = new ArrayList<>();
        FeuilleDAO.Row r;
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                r = dao.trouver(c, id, true);
                if (r == null) throw new Erreur(404, "Feuille introuvable.");
                switch (role) {
                    case "agent_accueil" -> modifierParAccueil(c, cl, r, in);
                    case "medecin" -> modifierParMedecin(c, ex, cl, r, in, apresCommit, false);
                    case "pharmacien" -> modifierParPharmacien(c, ex, cl, r, in, apresCommit, false);
                    case "administrateur" -> {
                        if (!ControleService.adminSuperviseur(cl)) {
                            throw new Erreur(403, "Contrôles anti-fraude actifs : l'administrateur ne modifie pas les feuilles. "
                                + "Désactivez-les (bouton « Contrôles » de l'en-tête) pour superviser le circuit.");
                        }
                        // mode supervision : l'administrateur réalise l'étape en cours (médecin si « En attente », pharmacie si validée)
                        if ("en_attente".equals(r.statut)) modifierParMedecin(c, ex, cl, r, in, apresCommit, true);
                        else modifierParPharmacien(c, ex, cl, r, in, apresCommit, true);
                        final String numeroSup = r.numero, nagSup = r.nag;
                        apresCommit.add(() -> {
                            JournalEvenement e = Audit.evt(ex, cl, "SECURITE", "feuille.supervision", "Action de l'administrateur avec les contrôles désactivés");
                            e.ressourceType = "Feuille";
                            e.ressourceId = numeroSup;
                            e.nagMasque = JournalService.masquerNag(nagSup);
                            e.message = "Mode supervision : l'administrateur a réalisé une étape du circuit.";
                            e.reglesSupp = new ArrayList<>(List.of(new JournalRegle("CONTROLES_DESACTIVES", "Action réalisée avec les contrôles anti-fraude désactivés", 15)));
                            JournalService.log(e);
                        });
                    }
                    default -> throw new Erreur(403, "Ce rôle ne peut pas modifier une feuille.");
                }
                c.commit();
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
        }
        apresCommit.forEach(Runnable::run);
        return versJsonList(List.of(dao.trouver(id))).get(0);
    }

    // ---- Accueil : corrige SA partie tant que la feuille est en attente ----
    private static void modifierParAccueil(Connection c, Claims cl, FeuilleDAO.Row r, JsonObject in) throws Exception {
        if (!"en_attente".equals(r.statut)) throw new Erreur(409, "Feuille déjà validée : elle n'est plus modifiable.");
        if (r.idStructure != AuthGuard.getIdStructure(cl)) throw new Erreur(403, "Cette feuille appartient à une autre structure.");
        JsonObject stored = parse(r.contenu);
        for (String k : CLES_ACCUEIL) {
            if (in.has(k) && !"matricule".equals(k) && !"patientNom".equals(k)) stored.add(k, in.get(k));   // l'assuré ne change jamais
        }
        Integer idMedecin = intOrNull(in, "medecinId");
        if (in.has("medecinId") && !Objects.equals(idMedecin, r.idMedecin)) {
            if (idMedecin != null) {
                Utilisateur m = userDao.findById(idMedecin);
                if (m == null || !m.aProfil("medecin") || !m.actif) throw new Erreur(400, "Médecin désigné introuvable ou inactif.");
            }
            r.idMedecin = idMedecin;
        }
        r.contenu = stored.toString();
        dao.majContenu(c, r);
    }

    // ---- Médecin : remplit sa partie ; « Validée » déclenche la validation ----
    // libre = administrateur en MODE SUPERVISION : il peut aussi corriger la partie accueil (jamais l'identité de
    // l'assuré) et n'est pas limité au périmètre d'un médecin.
    private static void modifierParMedecin(Connection c, HttpExchange ex, Claims cl, FeuilleDAO.Row r, JsonObject in, List<Runnable> apres, boolean libre) throws Exception {
        int idUser = AuthGuard.getIdUtilisateur(cl);
        if (!"en_attente".equals(r.statut)) throw new Erreur(409, "Feuille déjà validée : elle n'est plus modifiable.");
        if (!libre && !Objects.equals(r.idMedecin, idUser) && r.idStructure != AuthGuard.getIdStructure(cl)) throw new Erreur(403, "Cette feuille n'est pas dans votre périmètre.");

        JsonObject stored = parse(r.contenu);
        for (Map.Entry<String, JsonElement> e : in.entrySet()) {
            String k = e.getKey();
            if (CLES_SERVEUR.contains(k)) continue;
            if (CLES_ACCUEIL.contains(k) && (!libre || CLES_IDENTITE.contains(k))) continue;
            stored.add(k, e.getValue());
        }
        if (libre && in.has("medecinId")) {
            Integer idMedecin = intOrNull(in, "medecinId");
            if (idMedecin != null) {
                Utilisateur m = userDao.findById(idMedecin);
                if (m == null || !m.aProfil("medecin") || !m.actif) throw new Erreur(400, "Médecin désigné introuvable ou inactif.");
            }
            r.idMedecin = idMedecin;
        }
        cleanOrdonnance(stored, false);

        boolean valider = "Validée".equals(str(in, "statut")) || "Validee".equalsIgnoreCase(str(in, "statut"));
        if (!valider) {
            r.contenu = stored.toString();
            dao.majContenu(c, r);
            return;
        }
        if (!PermissionService.hasPermission(AuthGuard.getRole(cl), "feuille.valider")) throw new Erreur(403, "Permission refusée : feuille.valider");
        valider(c, ex, cl, r, stored, apres, libre);
    }

    /** Validation : Prestation + Prise_en_charge (+ Examen ou Ordonnance et ses lignes), même transaction. */
    private static void valider(Connection c, HttpExchange ex, Claims cl, FeuilleDAO.Row r, JsonObject stored, List<Runnable> apres, boolean libre) throws Exception {
        int idUser = AuthGuard.getIdUtilisateur(cl);
        // Qui valide : le médecin connecté ; en supervision, le médecin désigné sur la feuille (à défaut l'administrateur).
        int idActeur = libre && r.idMedecin != null ? r.idMedecin : idUser;
        Patient p = patientDao.findById(r.idPatient);
        if (p == null || !p.statut_assure) {
            Audit.refus(ex, cl, "CONSULTATION", "feuille.valider", "Validation refusée", "REFUSE", "Assuré suspendu : aucune prestation possible", "Feuille", r.numero, r.nag);
            throw new Erreur(409, "Assuré suspendu : aucune prestation possible. Cette feuille ne peut pas être validée.");
        }
        Utilisateur medecin = userDao.findById(idActeur);
        int idStructPrestation = libre && r.idMedecin == null ? r.idStructure : medecin.id_structure;
        String today = LocalDate.now().toString();
        boolean examen = "examen".equals(r.type);

        // lignes d'ordonnance réellement prescrites
        JsonArray ord = new JsonArray();
        if (!examen && stored.has("ordonnance") && stored.get("ordonnance").isJsonArray()) {
            for (JsonElement el : stored.getAsJsonArray("ordonnance")) {
                if (el.isJsonObject() && !str(el.getAsJsonObject(), "designation").isBlank()) ord.add(el);
            }
        }
        stored.add("ordonnance", ord);

        BigDecimal montant = montant(stored.get("totalMontant"));
        if (montant == null) montant = BigDecimal.ZERO;
        BigDecimal pec = montant(stored.get("totalPart"));
        if (pec == null) {
            Patient parent = p.id_assure_principal == null ? null : patientDao.findById(p.id_assure_principal);
            Integer fonds = parent != null && parent.fonds != null ? parent.fonds : p.fonds;
            pec = CouvertureService.calculerMontantPec(montant, fonds, examen ? "examen" : "consultation");
        }
        montant = montant.setScale(0, RoundingMode.HALF_UP);
        pec = pec.setScale(0, RoundingMode.HALF_UP);

        int idPrest = dao.insererPrestation(c, examen ? "examen" : "consultation", montant, r.dateFeuille, r.idPatient, idActeur, idStructPrestation);
        dao.insererPec(c, pec, today, r.numero, examen ? "Examen" : "Consultation", idActeur, idPrest);
        if (examen) {
            String nature = str(stored, "examNature");
            dao.insererExamen(c, cut(nature.isBlank() ? "Examen" : nature, 50), r.dateFeuille, idPrest);
        } else if (ord.size() > 0) {
            boolean signee = !str(stored, "signature").isBlank();
            int idOrd = dao.insererOrdonnance(c, today, signee, "ORD-" + r.numero, idPrest, idActeur);
            int pos = 1;
            for (JsonElement el : ord) {
                JsonObject l = el.getAsJsonObject();
                dao.insererLigne(c, idOrd, pos++, cut(str(l, "designation"), 200), quantite(l), cut(str(l, "posologie"), 300));
            }
        }
        r.idPrestation = idPrest;
        r.statut = "validee";
        r.avecOrdonnance = !examen && ord.size() > 0;
        r.idMedecin = idActeur;
        r.contenu = stored.toString();
        dao.majContenu(c, r);

        final String numero = r.numero, nag = r.nag;
        final BigDecimal fMontant = montant, fPec = pec;
        final int nbLignes = ord.size();
        final String nomPatient = p.prenom + " " + p.nom;
        apres.add(() -> Audit.ok(ex, cl, "CONSULTATION", "feuille.valider", examen ? "Feuille d'examen validée" : "Feuille validée",
            "Feuille", numero, nomPatient, nag, Map.of("statut", "En attente"),
            Map.of("statut", "Validée", "montant", fMontant, "montant_pec", fPec, "medicaments", nbLignes)));
    }

    // ---- Pharmacien : ne touche QUE la délivrance (tout ou partie de chaque ligne) ----
    // Protocole : sur une ligne, le client envoie  "aServir": { "quantite": 2, "prixUnitaire": "900" }.
    // (Ancien protocole, toujours accepté : "statut": "Servi" + "prixUnitaire" = servir TOUT le reste.)
    // Le serveur vérifie 1 ≤ quantité ≤ reste à servir (quantité prescrite − déjà servi, toutes pharmacies confondues),
    // recalcule les montants, enregistre UNE livraison (Ordonnance_delivrance) et met à jour la ligne.
    // libre = administrateur en supervision : la livraison est attribuée à SA structure.
    private static void modifierParPharmacien(Connection c, HttpExchange ex, Claims cl, FeuilleDAO.Row r, JsonObject in, List<Runnable> apres, boolean libre) throws Exception {
        int idUser = AuthGuard.getIdUtilisateur(cl);
        if (!PermissionService.hasPermission(AuthGuard.getRole(cl), "feuille.delivrer")) throw new Erreur(403, "Permission refusée : feuille.delivrer");
        if (!"validee".equals(r.statut) || !r.avecOrdonnance || r.idPrestation == null) throw new Erreur(409, "Cette feuille n'a pas d'ordonnance à servir.");

        Patient p = patientDao.findById(r.idPatient);
        if (p == null || !p.statut_assure) {
            Audit.refus(ex, cl, "PHARMACIE", "pharma.servir", "Délivrance refusée", "REFUSE", "Assuré suspendu : aucune prestation possible", "Feuille", r.numero, r.nag);
            throw new Erreur(409, "Assuré suspendu : aucune prestation possible. Rien ne peut lui être servi.");
        }
        if (!in.has("ordonnance") || !in.get("ordonnance").isJsonArray()) throw new Erreur(400, "Ordonnance manquante.");
        JsonArray envoyees = in.getAsJsonArray("ordonnance");

        JsonObject stored = parse(r.contenu);
        JsonArray lignes = stored.getAsJsonArray("ordonnance");
        Integer idOrd = dao.ordonnanceDe(c, r.idPrestation);
        if (lignes == null || idOrd == null) throw new Erreur(409, "Ordonnance introuvable pour cette feuille.");

        Utilisateur pharmacien = userDao.findById(idUser);
        double taux = tauxTicketModerateur(str(stored, "ticketModerateur"));
        int livraisons = 0;

        for (int i = 0; i < lignes.size() && i < envoyees.size(); i++) {
            JsonObject cur = lignes.get(i).getAsJsonObject();
            if (!envoyees.get(i).isJsonObject()) continue;
            JsonObject nw = envoyees.get(i).getAsJsonObject();
            String designation = str(cur, "designation");
            int prescrit = quantite(cur);
            int reste = prescrit - dao.quantiteServie(c, idOrd, i + 1);   // la base fait foi

            Integer q;
            BigDecimal prix;
            if (nw.has("aServir") && nw.get("aServir").isJsonObject()) {
                JsonObject as = nw.getAsJsonObject("aServir");
                q = entierStrict(as, "quantite");                          // 1,5 ou « abc » → null → refusé plus bas
                prix = montant(as.get("prixUnitaire"));
            } else if ("Servi".equals(str(nw, "statut")) && reste > 0 && !"Servi".equals(str(cur, "statut"))) {
                q = reste;                                                // ancien protocole : tout le reste
                prix = montant(nw.get("prixUnitaire"));
            } else {
                continue;                                                 // rien de nouveau sur cette ligne
            }
            if (reste <= 0) throw new Erreur(409, "« " + designation + " » est déjà entièrement servi : rechargez l'ordonnance.");
            if (q == null || q < 1 || q > reste) throw new Erreur(400, "Quantité à servir invalide pour « " + designation + " » : entre 1 et " + reste + ".");
            if (prix == null || prix.setScale(0, RoundingMode.DOWN).signum() <= 0) throw new Erreur(400, "Prix unitaire obligatoire (supérieur à 0) pour « " + designation + " ».");
            prix = prix.setScale(0, RoundingMode.DOWN);
            if (prix.compareTo(BigDecimal.valueOf(99_999_999L)) > 0) throw new Erreur(400, "Prix unitaire trop élevé pour « " + designation + " ».");

            BigDecimal total = prix.multiply(BigDecimal.valueOf(q));
            BigDecimal ass = total.multiply(BigDecimal.valueOf(taux)).setScale(0, RoundingMode.HALF_UP);
            BigDecimal pat = total.subtract(ass);

            int servie = dao.livrer(c, idOrd, i + 1, q, prix, total, ass, pat, pharmacien.id_structure, idUser);
            if (servie < 0) throw new Erreur(409, "« " + designation + " » vient d'être servi : rechargez l'ordonnance.");
            livraisons++;

            // règles de risque propres à la délivrance
            List<JournalRegle> regles = new ArrayList<>();
            BigDecimal ref = catalogueDao.prixReference(designation);
            if (ref != null && ref.signum() > 0 && (prix.compareTo(ref.multiply(BigDecimal.valueOf(3))) > 0 || prix.multiply(BigDecimal.valueOf(5)).compareTo(ref) < 0)) {
                regles.add(new JournalRegle("PRIX_ANORMAL", "Prix unitaire très éloigné du tarif de référence (" + ref.toPlainString() + " FCFA)", 25));
            }
            if (!libre && Objects.equals(r.idMedecin, idUser)) {
                regles.add(new JournalRegle("MEME_PERSONNE", "La même personne a validé la feuille et sert l'ordonnance", 50));
            }
            final Map<String, Object> apresJson = new LinkedHashMap<>();
            apresJson.put("ligne", i + 1);
            apresJson.put("designation", designation);
            apresJson.put("quantiteServie", q);
            apresJson.put("quantitePrescrite", prescrit);
            apresJson.put("resteApres", prescrit - servie);
            apresJson.put("prixUnitaire", prix);
            apresJson.put("total", total);
            apresJson.put("partAssurance", ass);
            apresJson.put("partPatient", pat);
            final String numero = r.numero, nag = r.nag;
            apres.add(() -> {
                JournalEvenement e = Audit.evt(ex, cl, "PHARMACIE", "pharma.servir", "Médicament servi");
                e.ressourceType = "Feuille";
                e.ressourceId = numero;
                e.ressourceLibelle = designation;
                e.nagMasque = JournalService.masquerNag(nag);
                e.apres = Http.GSON.toJson(apresJson);
                e.reglesSupp = new ArrayList<>(regles);
                JournalService.log(e);
            });
        }
        if (livraisons == 0) return;

        int[] av = dao.avancementOrdonnance(c, idOrd);   // { lignes, lignes entièrement servies, lignes entamées }
        dao.statutOrdonnance(c, idOrd, av[1] >= av[0] ? "delivree" : (av[2] > 0 ? "partiellement_delivree" : "envoyee"));
        appliquerLivraisons(stored, dao.livraisonsPour(c, List.of(r.idPrestation)));   // le contenu stocké reflète la base
        r.contenu = stored.toString();
        dao.majContenu(c, r);
    }

    // ============================================================
    // SUPPRESSION (administrateur)
    // ============================================================
    public static void supprimer(HttpExchange ex, Claims cl, int id) throws Exception {
        FeuilleDAO.Row r;
        try (Connection c = Database.getConnection()) {
            c.setAutoCommit(false);
            try {
                r = dao.trouver(c, id, true);
                if (r == null) throw new Erreur(404, "Feuille introuvable.");
                if (r.idPrestation != null && dao.aDesLignesServies(c, r.idPrestation)) {
                    throw new Erreur(409, "Cette feuille a déjà été servie en pharmacie : suppression impossible.");
                }
                dao.supprimer(c, r);
                c.commit();
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
        }
        Audit.ok(ex, cl, "CONSULTATION", "feuille.supprimer", "Feuille supprimée", "Feuille", r.numero, null, r.nag,
            Map.of("statut", "validee".equals(r.statut) ? "Validée" : "En attente"), null);
    }

    // ============================================================
    // OUTILS
    // ============================================================

    /**
     * JSON envoyé à l'interface pour plusieurs feuilles. Pour les ordonnances, l'état de délivrance (quantité servie, statut,
     * livraisons avec prix, montants, pharmacie, pharmacien, date) est RELU DANS LA BASE, pas dans le JSON stocké.
     */
    public static List<JsonObject> versJsonList(List<FeuilleDAO.Row> rows) throws Exception {
        List<Integer> ids = new ArrayList<>();
        for (FeuilleDAO.Row r : rows) if (r.avecOrdonnance && r.idPrestation != null && "validee".equals(r.statut)) ids.add(r.idPrestation);
        Map<Integer, List<FeuilleDAO.Livraison>> parPrestation = new HashMap<>();
        if (!ids.isEmpty()) {
            try (Connection c = Database.getConnection()) {
                for (FeuilleDAO.Livraison l : dao.livraisonsPour(c, ids)) parPrestation.computeIfAbsent(l.idPrestation, k -> new ArrayList<>()).add(l);
            }
        }
        List<JsonObject> out = new ArrayList<>();
        for (FeuilleDAO.Row r : rows) {
            JsonObject o = versJson(r);
            List<FeuilleDAO.Livraison> l = r.idPrestation == null ? null : parPrestation.get(r.idPrestation);
            if (l != null) appliquerLivraisons(o, l);
            out.add(o);
        }
        return out;
    }

    /** Remplace, ligne par ligne, l'état de délivrance du JSON par celui de la base. */
    static void appliquerLivraisons(JsonObject feuille, List<FeuilleDAO.Livraison> rows) {
        if (!feuille.has("ordonnance") || !feuille.get("ordonnance").isJsonArray()) return;
        JsonArray lignes = feuille.getAsJsonArray("ordonnance");
        DateTimeFormatter heure = DateTimeFormatter.ofPattern("HH:mm");
        for (int i = 0; i < lignes.size(); i++) {
            if (!lignes.get(i).isJsonObject()) continue;
            JsonObject l = lignes.get(i).getAsJsonObject();
            int pos = i + 1, prescrit = 0, servie = 0;
            boolean trouvee = false;
            JsonArray livs = new JsonArray();
            BigDecimal ass = BigDecimal.ZERO, pat = BigDecimal.ZERO;
            JsonObject derniere = null;
            for (FeuilleDAO.Livraison d : rows) {
                if (d.position != pos) continue;
                trouvee = true;
                prescrit = d.quantitePrescrite;
                servie = d.quantiteServie;
                if (d.idDelivrance == null) continue;
                JsonObject o = new JsonObject();
                o.addProperty("quantite", d.quantite);
                o.addProperty("prixUnitaire", nombre(d.prix));
                o.addProperty("montantTotal", nombre(d.total));
                o.addProperty("partAssurance", nombre(d.assurance));
                o.addProperty("partPatient", nombre(d.patient));
                o.addProperty("servicePar", d.pharmacie == null ? "" : d.pharmacie);
                o.addProperty("idPharmacie", d.idPharmacie);
                o.addProperty("pharmacien", d.pharmacien == null ? "" : d.pharmacien);
                o.addProperty("idPharmacien", d.idPharmacien);
                o.addProperty("dateService", d.date == null ? "" : d.date.format(FR));
                o.addProperty("heureService", d.date == null ? "" : d.date.format(heure));
                livs.add(o);
                ass = ass.add(d.assurance);
                pat = pat.add(d.patient);
                derniere = o;
            }
            if (!trouvee) continue;
            l.addProperty("quantiteServie", servie);
            l.addProperty("statut", servie >= prescrit ? "Servi" : (servie > 0 ? "Partiel" : "Non servi"));
            l.add("livraisons", livs);
            // résumé de la ligne (compatibilité avec les écrans qui lisent un seul jeu de champs)
            l.addProperty("prixUnitaire", derniere == null ? "" : derniere.get("prixUnitaire").getAsString());
            l.addProperty("partAssurance", derniere == null ? "" : nombre(ass));
            l.addProperty("partPatient", derniere == null ? "" : nombre(pat));
            l.addProperty("servicePar", derniere == null ? "" : derniere.get("servicePar").getAsString());
            l.addProperty("dateService", derniere == null ? "" : derniere.get("dateService").getAsString());
        }
    }

    private static String nombre(BigDecimal v) {
        return v == null ? "" : v.stripTrailingZeros().toPlainString();
    }

    /** JSON envoyé à l'interface : contenu + champs gérés par le serveur. */
    public static JsonObject versJson(FeuilleDAO.Row r) {
        JsonObject o = parse(r.contenu);
        o.addProperty("id", r.idClient);
        o.addProperty("serverId", r.id);
        o.addProperty("numero", r.numero);
        o.addProperty("date", dateFr(r.dateFeuille));
        o.addProperty("statut", "validee".equals(r.statut) ? "Validée" : "En attente");
        o.addProperty("type", "examen".equals(r.type) ? "Examen" : "Consultation");
        return o;
    }

    private static JsonObject parse(String json) {
        return JsonParser.parseString(json).getAsJsonObject();
    }

    /** Copie sans les champs gérés par le serveur. */
    private static JsonObject nettoyerServeur(JsonObject in) {
        JsonObject o = new JsonObject();
        for (Map.Entry<String, JsonElement> e : in.entrySet()) if (!CLES_SERVEUR.contains(e.getKey())) o.add(e.getKey(), e.getValue());
        return o;
    }

    /** Remet à zéro les champs de délivrance de chaque ligne (jamais repris du client, sauf par le pharmacien). */
    private static void cleanOrdonnance(JsonObject contenu, boolean garderDelivrance) {
        if (!contenu.has("ordonnance") || !contenu.get("ordonnance").isJsonArray()) return;
        JsonArray lignes = contenu.getAsJsonArray("ordonnance");
        // Les lignes déjà servies (stockées) ne sont jamais réécrites par un médecin : on ne fait ici que fixer
        // l'état d'une prescription en cours de rédaction.
        for (JsonElement el : lignes) {
            if (!el.isJsonObject()) continue;
            JsonObject l = el.getAsJsonObject();
            if (garderDelivrance) continue;
            l.addProperty("statut", "Non servi");
            l.addProperty("servicePar", "");
            l.addProperty("dateService", "");
            l.addProperty("prixUnitaire", "");
            l.addProperty("partAssurance", "");
            l.addProperty("partPatient", "");
            l.addProperty("quantiteServie", 0);
            l.add("livraisons", new JsonArray());
        }
    }

    static double tauxTicketModerateur(String tm) {
        if (tm == null) return 0.8;
        String t = tm.toLowerCase();
        return t.contains("ald") || t.contains("exon") ? 1.0 : 0.8;
    }

    private static int quantite(JsonObject ligne) {
        String q = str(ligne, "quantite").replaceAll("[^0-9]", " ").trim();
        if (q.isEmpty()) return 1;
        try {
            return Math.max(1, Integer.parseInt(q.split(" ")[0]));
        } catch (NumberFormatException e) {
            return 1;
        }
    }

    /** « 12 500 », « 12500,50 », 12500 → BigDecimal ; null si vide ou illisible. */
    static BigDecimal montant(JsonElement el) {
        if (el == null || el.isJsonNull()) return null;
        String s = el.getAsString().replace(' ', ' ').replace(" ", "").replace(',', '.').replaceAll("[^0-9.]", "");
        if (s.isEmpty() || s.equals(".")) return null;
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String str(JsonObject o, String k) {
        if (o == null || !o.has(k) || o.get(k).isJsonNull()) return "";
        JsonElement e = o.get(k);
        return e.isJsonPrimitive() ? e.getAsString() : "";
    }

    private static Long longOrNull(JsonObject o, String k) {
        try {
            return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsBigDecimal().longValueExact() : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** Entier exact (2 ou 2.0 → 2) ; null si absent, vide, décimal (1.5) ou illisible. */
    private static Integer entierStrict(JsonObject o, String k) {
        try {
            if (!o.has(k) || o.get(k).isJsonNull()) return null;
            return o.get(k).getAsBigDecimal().intValueExact();
        } catch (Exception e) {
            return null;
        }
    }

    private static Integer intOrNull(JsonObject o, String k) {
        try {
            return o.has(k) && !o.get(k).isJsonNull() && !o.get(k).getAsString().isBlank() ? o.get(k).getAsInt() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String chiffres(String s) { return s == null ? "" : s.replaceAll("\\D", ""); }
    private static String cut(String s, int max) { return s == null ? null : (s.length() <= max ? s : s.substring(0, max)); }
    private static boolean vrai(String s) { return "1".equals(s) || "true".equalsIgnoreCase(s); }

    private static String statutDb(String s) {
        if (s == null || s.isBlank()) return null;
        return s.toLowerCase().startsWith("valid") ? "validee" : "en_attente";
    }

    private static String typeDb(String s) {
        if (s == null || s.isBlank()) return null;
        return s.toLowerCase().startsWith("exam") ? "examen" : "consultation";
    }

    /** AAAA-MM-JJ à partir de AAAA-MM-JJ ou JJ/MM/AAAA ; null sinon. */
    private static String dateIso(String s) {
        if (s == null || s.isBlank()) return null;
        if (s.matches("\\d{4}-\\d{2}-\\d{2}")) return s;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d{2})/(\\d{2})/(\\d{4})").matcher(s);
        return m.matches() ? m.group(3) + "-" + m.group(2) + "-" + m.group(1) : null;
    }

    private static String dateFr(String iso) {
        return iso == null || iso.length() < 10 ? "" : iso.substring(8, 10) + "/" + iso.substring(5, 7) + "/" + iso.substring(0, 4);
    }
}

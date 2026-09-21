package dao;

import db.Database;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Accès à la table Feuille_soins (une feuille de consultation ou d'examen).
 * Le contenu complet est un JSON (colonne « contenu ») ; les autres colonnes servent aux
 * recherches, aux droits d'accès et aux liens avec Prestation / Prise_en_charge / Ordonnance.
 * Les méthodes qui modifient prennent une Connection : l'appelant gère la transaction.
 */
public class FeuilleDAO {

    /** Une ligne de Feuille_soins. */
    public static class Row {
        public int     id;
        public long    idClient;
        public String  numero;
        public String  type;            // 'consultation' | 'examen'
        public String  statut;          // 'en_attente' | 'validee'
        public String  nag;
        public int     idPatient;
        public Integer idMedecin;
        public int     idAgent;
        public int     idStructure;
        public String  dateFeuille;     // AAAA-MM-JJ
        public boolean avecOrdonnance;
        public String  contenu;         // JSON
        public Integer idPrestation;
    }

    /** Critères de la liste ; la visibilité propre au rôle est ajoutée par l'appelant (visibiliteSql). */
    public static class Filtre {
        public String nag, statut, type, depuis, jusqua;
        public boolean avecOrdonnance;
        public String visibiliteSql;                 // fragment « AND (...) » avec des ?
        public List<Object> visibiliteParams = new ArrayList<>();
        public int limite = 1000;
    }

    private static final String COLS =
        "f.id_feuille, f.id_client, f.numero, f.type_feuille, f.statut, f.matricule_nag, f.id_patient, f.id_medecin, f.id_agent, " +
        "f.id_structure, f.date_feuille, f.avec_ordonnance, f.contenu, f.id_prestation";

    // ------------------------------------------------------------
    // Lecture
    // ------------------------------------------------------------
    public Row trouver(Connection c, int id, boolean verrou) throws SQLException {
        String sql = "SELECT " + COLS + " FROM Feuille_soins f " + (verrou ? "WITH (UPDLOCK, ROWLOCK) " : "") + "WHERE f.id_feuille = ?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? map(rs) : null;
            }
        }
    }

    public Row trouver(int id) throws SQLException {
        try (Connection c = Database.getConnection()) {
            return trouver(c, id, false);
        }
    }

    public boolean idClientExiste(Connection c, long idClient) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT 1 FROM Feuille_soins WHERE id_client = ?")) {
            ps.setLong(1, idClient);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    public List<Row> lister(Filtre f) throws SQLException {
        List<Object> p = new ArrayList<>();
        StringBuilder w = new StringBuilder(" WHERE 1=1");
        if (notBlank(f.nag))    { w.append(" AND f.matricule_nag = ?"); p.add(f.nag); }
        if (notBlank(f.statut)) { w.append(" AND f.statut = ?"); p.add(f.statut); }
        if (notBlank(f.type))   { w.append(" AND f.type_feuille = ?"); p.add(f.type); }
        if (f.avecOrdonnance)   w.append(" AND f.avec_ordonnance = 1");
        if (notBlank(f.depuis)) { w.append(" AND f.date_feuille >= ?"); p.add(f.depuis); }
        if (notBlank(f.jusqua)) { w.append(" AND f.date_feuille <= ?"); p.add(f.jusqua); }
        if (notBlank(f.visibiliteSql)) { w.append(" ").append(f.visibiliteSql); p.addAll(f.visibiliteParams); }

        String sql = "SELECT TOP (" + Math.max(1, Math.min(5000, f.limite)) + ") " + COLS + " FROM Feuille_soins f" + w + " ORDER BY f.id_feuille DESC";
        List<Row> out = new ArrayList<>();
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < p.size(); i++) ps.setObject(i + 1, p.get(i));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(map(rs));
            }
        }
        return out;
    }

    /** Nombre de PATIENTS différents ayant une feuille en attente (dans le périmètre donné). */
    public int patientsEnAttente(String visibiliteSql, List<Object> params) throws SQLException {
        String sql = "SELECT COUNT(DISTINCT f.matricule_nag) FROM Feuille_soins f WHERE f.statut = 'en_attente' " + (visibiliteSql == null ? "" : visibiliteSql);
        try (Connection c = Database.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.size(); i++) ps.setObject(i + 1, params.get(i));
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    /** Feuilles validées dont au moins une ligne d'ordonnance n'est pas encore servie. */
    public int ordonnancesAServir() throws SQLException {
        String sql = "SELECT COUNT(*) FROM Feuille_soins f WHERE f.statut = 'validee' AND f.avec_ordonnance = 1 AND EXISTS (" +
                     "SELECT 1 FROM Ordonnance o JOIN Ordonnance_ligne l ON l.id_ordonnance = o.id_ordonnance " +
                     "WHERE o.id_prestation = f.id_prestation AND l.statut_delivrance <> 'delivre')";
        try (Connection c = Database.getConnection(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    // ------------------------------------------------------------
    // Écriture (transaction gérée par l'appelant)
    // ------------------------------------------------------------
    public int inserer(Connection c, Row r) throws SQLException {
        String sql = "INSERT INTO Feuille_soins (id_client, type_feuille, statut, matricule_nag, id_patient, id_medecin, id_agent, id_structure, " +
                     "date_feuille, avec_ordonnance, contenu) VALUES (?,?,?,?,?,?,?,?,?,?,?)";
        int id;
        try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setLong(1, r.idClient);
            ps.setString(2, r.type);
            ps.setString(3, r.statut);
            ps.setString(4, r.nag);
            ps.setInt(5, r.idPatient);
            ps.setObject(6, r.idMedecin);
            ps.setInt(7, r.idAgent);
            ps.setInt(8, r.idStructure);
            ps.setString(9, r.dateFeuille);
            ps.setBoolean(10, r.avecOrdonnance);
            ps.setString(11, r.contenu);
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                id = k.getInt(1);
            }
        }
        // Numéro attribué par le serveur : Faaaa-00001 (unique, dérivé de la clé)
        String numero = String.format("F%s-%05d", r.dateFeuille.substring(0, 4), id);
        try (PreparedStatement ps = c.prepareStatement("UPDATE Feuille_soins SET numero = ? WHERE id_feuille = ?")) {
            ps.setString(1, numero);
            ps.setInt(2, id);
            ps.executeUpdate();
        }
        r.id = id;
        r.numero = numero;
        return id;
    }

    public void majContenu(Connection c, Row r) throws SQLException {
        String sql = "UPDATE Feuille_soins SET statut = ?, id_medecin = ?, avec_ordonnance = ?, contenu = ?, id_prestation = ?, " +
                     "date_modification = SYSDATETIME(), date_validation = CASE WHEN ? = 'validee' AND date_validation IS NULL THEN SYSDATETIME() ELSE date_validation END " +
                     "WHERE id_feuille = ?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, r.statut);
            ps.setObject(2, r.idMedecin);
            ps.setBoolean(3, r.avecOrdonnance);
            ps.setString(4, r.contenu);
            ps.setObject(5, r.idPrestation);
            ps.setString(6, r.statut);
            ps.setInt(7, r.id);
            ps.executeUpdate();
        }
    }

    // ------------------------------------------------------------
    // Prestation / PEC / Examen / Ordonnance créés à la validation
    // ------------------------------------------------------------
    public int insererPrestation(Connection c, String type, java.math.BigDecimal montant, String date, int idPatient, int idUtilisateur, int idStructure) throws SQLException {
        String sql = "INSERT INTO Prestation (montant, date_prs, type_prestation, id_patient, id_utilisateur, id_structure) VALUES (?,?,?,?,?,?)";
        try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setBigDecimal(1, montant);
            ps.setString(2, date);
            ps.setString(3, type);
            ps.setInt(4, idPatient);
            ps.setInt(5, idUtilisateur);
            ps.setInt(6, idStructure);
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                return k.getInt(1);
            }
        }
    }

    public void insererPec(Connection c, java.math.BigDecimal montantPec, String date, String numero, String typeFeuille, int idActeur, int idPrestation) throws SQLException {
        String sql = "INSERT INTO Prise_en_charge (montant_pec, date_pec, numero_de_feuille, type_feuille, id_acteur, statut, id_prestation) VALUES (?,?,?,?,?,'validee',?)";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setBigDecimal(1, montantPec);
            ps.setString(2, date);
            ps.setString(3, numero);
            ps.setString(4, typeFeuille);
            ps.setInt(5, idActeur);
            ps.setInt(6, idPrestation);
            ps.executeUpdate();
        }
    }

    public void insererExamen(Connection c, String typeExamen, String date, int idPrestation) throws SQLException {
        String sql = "INSERT INTO Examen (type_examen, date_examen, statut, id_prestation) VALUES (?,?,'en_attente',?)";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, typeExamen);
            ps.setString(2, date);
            ps.setInt(3, idPrestation);
            ps.executeUpdate();
        }
    }

    /** Crée l'ordonnance (statut « envoyee ») et retourne son identifiant. */
    public int insererOrdonnance(Connection c, String date, boolean signee, String codeRetrait, int idPrestation, int idMedecin) throws SQLException {
        String sql = "INSERT INTO Ordonnance (date_ordonnance, statut, signature_medecin, code_retrait, id_prestation, id_utilisateur) VALUES (?,'envoyee',?,?,?,?)";
        try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, date);
            ps.setString(2, signee ? "signee" : null);
            ps.setString(3, codeRetrait);
            ps.setInt(4, idPrestation);
            ps.setInt(5, idMedecin);
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                return k.getInt(1);
            }
        }
    }

    public void insererLigne(Connection c, int idOrdonnance, int position, String designation, int quantite, String posologie) throws SQLException {
        String sql = "INSERT INTO Ordonnance_ligne (id_ordonnance, position, designation, quantite, posologie) VALUES (?,?,?,?,?)";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idOrdonnance);
            ps.setInt(2, position);
            ps.setString(3, designation);
            ps.setInt(4, quantite);
            ps.setString(5, posologie);
            ps.executeUpdate();
        }
    }

    /** id_ordonnance de la feuille (via sa prestation), ou null. */
    public Integer ordonnanceDe(Connection c, int idPrestation) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT id_ordonnance FROM Ordonnance WHERE id_prestation = ?")) {
            ps.setInt(1, idPrestation);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : null;
            }
        }
    }

    /**
     * Enregistre UNE livraison (partielle ou totale) d'une ligne d'ordonnance : une ligne dans Ordonnance_delivrance
     * (quantité, prix unitaire, montants, pharmacie, pharmacien, date) + mise à jour de la ligne
     * (quantité servie cumulée, statut non_delivre / partiel / delivre, totaux).
     * @return la nouvelle quantité servie, ou -1 si la ligne n'existe pas ou si la quantité dépasserait celle prescrite
     */
    public int livrer(Connection c, int idOrdonnance, int position, int quantite, java.math.BigDecimal prix, java.math.BigDecimal total,
                      java.math.BigDecimal partAssurance, java.math.BigDecimal partPatient, int idStructure, int idPharmacien) throws SQLException {
        int idLigne, prescrit, servie;
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT id_ligne, quantite, quantite_servie FROM Ordonnance_ligne WITH (UPDLOCK, ROWLOCK) WHERE id_ordonnance = ? AND position = ?")) {
            ps.setInt(1, idOrdonnance);
            ps.setInt(2, position);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return -1;
                idLigne = rs.getInt(1);
                prescrit = rs.getInt(2);
                servie = rs.getInt(3);
            }
        }
        if (quantite < 1 || servie + quantite > prescrit) return -1;
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO Ordonnance_delivrance (id_ligne, quantite, prix_unitaire, montant_total, part_assurance, part_patient, id_structure_pharmacie, id_pharmacien) " +
                "VALUES (?,?,?,?,?,?,?,?)")) {
            ps.setInt(1, idLigne);
            ps.setInt(2, quantite);
            ps.setBigDecimal(3, prix);
            ps.setBigDecimal(4, total);
            ps.setBigDecimal(5, partAssurance);
            ps.setBigDecimal(6, partPatient);
            ps.setInt(7, idStructure);
            ps.setInt(8, idPharmacien);
            ps.executeUpdate();
        }
        int nouvelle = servie + quantite;
        try (PreparedStatement ps = c.prepareStatement(
                "UPDATE Ordonnance_ligne SET quantite_servie = ?, statut_delivrance = ?, prix_unitaire = ?, " +
                "montant_total = COALESCE(montant_total, 0) + ?, part_assurance = COALESCE(part_assurance, 0) + ?, part_patient = COALESCE(part_patient, 0) + ?, " +
                "id_structure_pharmacie = ?, id_pharmacien = ?, date_delivrance = ? WHERE id_ligne = ?")) {
            ps.setInt(1, nouvelle);
            ps.setString(2, nouvelle >= prescrit ? "delivre" : "partiel");
            ps.setBigDecimal(3, prix);
            ps.setBigDecimal(4, total);
            ps.setBigDecimal(5, partAssurance);
            ps.setBigDecimal(6, partPatient);
            ps.setInt(7, idStructure);
            ps.setInt(8, idPharmacien);
            ps.setString(9, java.time.LocalDate.now().toString());
            ps.setInt(10, idLigne);
            ps.executeUpdate();
        }
        return nouvelle;
    }

    /** Quantité déjà servie (toutes pharmacies confondues) d'une ligne, lue dans la base. */
    public int quantiteServie(Connection c, int idOrdonnance, int position) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT quantite_servie FROM Ordonnance_ligne WHERE id_ordonnance = ? AND position = ?")) {
            ps.setInt(1, idOrdonnance);
            ps.setInt(2, position);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    /** { nb de lignes, nb de lignes entièrement servies, nb de lignes déjà entamées } de l'ordonnance. */
    public int[] avancementOrdonnance(Connection c, int idOrdonnance) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT COUNT(*), SUM(CASE WHEN statut_delivrance = 'delivre' THEN 1 ELSE 0 END), SUM(CASE WHEN quantite_servie > 0 THEN 1 ELSE 0 END) " +
                "FROM Ordonnance_ligne WHERE id_ordonnance = ?")) {
            ps.setInt(1, idOrdonnance);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return new int[]{rs.getInt(1), rs.getInt(2), rs.getInt(3)};
            }
        }
    }

    /** Une livraison, avec l'état de sa ligne d'ordonnance (idDelivrance == null : ligne pas encore servie). */
    public static class Livraison {
        public int idPrestation, position, quantitePrescrite, quantiteServie;
        public String statutLigne;
        public Integer idDelivrance;
        public int quantite;
        public java.math.BigDecimal prix, total, assurance, patient;
        public Integer idPharmacie, idPharmacien;
        public String pharmacie, pharmacien;
        public java.time.LocalDateTime date;
    }

    /**
     * Livraisons (avec pharmacie et pharmacien) de toutes les ordonnances des prestations données, lues dans la base :
     * c'est cette lecture — et non le JSON de la feuille — qui fait foi pour l'affichage.
     */
    public List<Livraison> livraisonsPour(Connection c, java.util.Collection<Integer> idsPrestation) throws SQLException {
        List<Livraison> out = new ArrayList<>();
        if (idsPrestation.isEmpty()) return out;
        StringBuilder in = new StringBuilder();
        for (int i = 0; i < idsPrestation.size(); i++) in.append(i == 0 ? "?" : ",?");
        String sql = "SELECT o.id_prestation, l.position, l.quantite AS qte_prescrite, l.quantite_servie, l.statut_delivrance, " +
                     "d.id_delivrance, d.quantite, d.prix_unitaire, d.montant_total, d.part_assurance, d.part_patient, d.id_structure_pharmacie, " +
                     "s.raison_sociale AS pharmacie, d.id_pharmacien, LTRIM(RTRIM(COALESCE(u.prenom + ' ', '') + u.nom)) AS pharmacien, d.date_delivrance " +
                     "FROM Ordonnance o JOIN Ordonnance_ligne l ON l.id_ordonnance = o.id_ordonnance " +
                     "LEFT JOIN Ordonnance_delivrance d ON d.id_ligne = l.id_ligne " +
                     "LEFT JOIN Structure s ON s.id_structure = d.id_structure_pharmacie " +
                     "LEFT JOIN Utilisateur u ON u.id_utilisateur = d.id_pharmacien " +
                     "WHERE o.id_prestation IN (" + in + ") ORDER BY o.id_prestation, l.position, d.id_delivrance";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            for (Integer id : idsPrestation) ps.setInt(i++, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Livraison l = new Livraison();
                    l.idPrestation = rs.getInt("id_prestation");
                    l.position = rs.getInt("position");
                    l.quantitePrescrite = rs.getInt("qte_prescrite");
                    l.quantiteServie = rs.getInt("quantite_servie");
                    l.statutLigne = rs.getString("statut_delivrance");
                    int d = rs.getInt("id_delivrance");
                    l.idDelivrance = rs.wasNull() ? null : d;
                    if (l.idDelivrance != null) {
                        l.quantite = rs.getInt("quantite");
                        l.prix = rs.getBigDecimal("prix_unitaire");
                        l.total = rs.getBigDecimal("montant_total");
                        l.assurance = rs.getBigDecimal("part_assurance");
                        l.patient = rs.getBigDecimal("part_patient");
                        int ph = rs.getInt("id_structure_pharmacie");
                        l.idPharmacie = rs.wasNull() ? null : ph;
                        l.pharmacie = rs.getString("pharmacie");
                        int pn = rs.getInt("id_pharmacien");
                        l.idPharmacien = rs.wasNull() ? null : pn;
                        l.pharmacien = rs.getString("pharmacien");
                        l.date = rs.getObject("date_delivrance", java.time.LocalDateTime.class);
                    }
                    out.add(l);
                }
            }
        }
        return out;
    }

    public void statutOrdonnance(Connection c, int idOrdonnance, String statut) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("UPDATE Ordonnance SET statut = ? WHERE id_ordonnance = ?")) {
            ps.setString(1, statut);
            ps.setInt(2, idOrdonnance);
            ps.executeUpdate();
        }
    }

    // ------------------------------------------------------------
    // Suppression (feuille + ce que sa validation avait créé)
    // ------------------------------------------------------------
    /** Vrai si au moins une ligne d'ordonnance de la prestation a déjà été servie. */
    public boolean aDesLignesServies(Connection c, int idPrestation) throws SQLException {
        String sql = "SELECT 1 FROM Ordonnance o JOIN Ordonnance_ligne l ON l.id_ordonnance = o.id_ordonnance " +
                     "WHERE o.id_prestation = ? AND l.quantite_servie > 0";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, idPrestation);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    public void supprimer(Connection c, Row r) throws SQLException {
        exec(c, "DELETE FROM Feuille_soins WHERE id_feuille = ?", r.id);
        if (r.idPrestation != null) {
            exec(c, "DELETE FROM Ordonnance WHERE id_prestation = ?", r.idPrestation);   // les lignes partent en cascade
            exec(c, "DELETE FROM Examen WHERE id_prestation = ?", r.idPrestation);
            exec(c, "DELETE FROM Prise_en_charge WHERE id_prestation = ?", r.idPrestation);
            exec(c, "DELETE FROM Prestation WHERE id_prestation = ?", r.idPrestation);
        }
    }

    private void exec(Connection c, String sql, int param) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, param);
            ps.executeUpdate();
        }
    }

    // ------------------------------------------------------------
    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    private Row map(ResultSet rs) throws SQLException {
        Row r = new Row();
        r.id = rs.getInt("id_feuille");
        r.idClient = rs.getLong("id_client");
        r.numero = rs.getString("numero");
        r.type = rs.getString("type_feuille");
        r.statut = rs.getString("statut");
        r.nag = rs.getString("matricule_nag");
        r.idPatient = rs.getInt("id_patient");
        int m = rs.getInt("id_medecin");
        r.idMedecin = rs.wasNull() ? null : m;
        r.idAgent = rs.getInt("id_agent");
        r.idStructure = rs.getInt("id_structure");
        r.dateFeuille = rs.getString("date_feuille");
        r.avecOrdonnance = rs.getBoolean("avec_ordonnance");
        r.contenu = rs.getString("contenu");
        int p = rs.getInt("id_prestation");
        r.idPrestation = rs.wasNull() ? null : p;
        return r;
    }
}

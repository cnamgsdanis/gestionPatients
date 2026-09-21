package controller;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import dao.StructureDAO;
import dao.UtilisateurDAO;
import io.jsonwebtoken.Claims;
import model.JournalEvenement;
import model.JournalEvenement.JournalRegle;
import model.Utilisateur;
import security.AuthGuard;
import service.Audit;
import service.AuthService;
import service.JournalService;
import service.JwtService;
import service.Http;

import java.io.IOException;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Contrôleur HTTP des utilisateurs (comptes).
 *
 * Routes :
 *   GET    /api/utilisateurs                     → liste (avec les profils de chaque compte) (utilisateur.lire)
 *   GET    /api/utilisateurs/{id}                → détail                    (utilisateur.lire)
 *   POST   /api/utilisateurs                     → créer (mot de passe TEMPORAIRE : à changer à la 1re connexion) (utilisateur.creer)
 *   PUT    /api/utilisateurs/{id}                → modifier (champs présents seulement) (utilisateur.modifier)
 *   PATCH  /api/utilisateurs/{id}/actif          → activer / désactiver      (utilisateur.modifier)
 *   DELETE /api/utilisateurs/{id}                → supprimer                 (utilisateur.supprimer)
 *   POST   /api/utilisateurs/{id}/profils        → AJOUTER un profil        { "profil": "pharmacien" } (utilisateur.modifier)
 *   DELETE /api/utilisateurs/{id}/profils/{profil}    → RETIRER un profil   (utilisateur.modifier)
 *   PUT    /api/utilisateurs/{id}/profils/principal   → profil principal    { "profil": "..." } (utilisateur.modifier)
 *
 * Profils : un profil est un rôle ; il décide des interfaces et des droits. Un compte en porte au moins un et
 * peut en porter plusieurs (utilisateur.role = profil principal, celui de la connexion par défaut).
 *
 * Règles de sécurité : on ne peut ni supprimer ni désactiver son propre compte, ni retirer
 * (profil, désactivation, suppression) le DERNIER administrateur actif, ni se retirer soi-même le profil
 * administrateur. Un changement de profil, une désactivation ou une suppression invalide aussitôt les jetons déjà
 * émis pour ce compte.
 */
public class UtilisateurController {

    private final UtilisateurDAO dao = new UtilisateurDAO();
    private final StructureDAO structureDao = new StructureDAO();
    private final AuthService service = new AuthService();

    public void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String[] parts = ex.getRequestURI().getPath().split("/");   // ["", "api", "utilisateurs", "{id}", ...]
        try {
            if (parts.length == 5 && parts[4].equals("actif") && method.equals("PATCH")) {
                Integer id = idDe(ex, parts);
                if (id != null) handleSetActif(ex, id);
                return;
            }
            if (parts.length >= 5 && parts[4].equals("profils")) {
                Integer id = idDe(ex, parts);
                if (id == null) return;
                if (parts.length == 5 && method.equals("POST")) handleAjouterProfil(ex, id);
                else if (parts.length == 6 && parts[5].equals("principal") && method.equals("PUT")) handleProfilPrincipal(ex, id);
                else if (parts.length == 6 && method.equals("DELETE")) handleRetirerProfil(ex, id, parts[5]);
                else Http.error(ex, 404, "Route inconnue");
                return;
            }
            switch (method) {
                case "GET"    -> handleGet(ex, parts);
                case "POST"   -> handlePost(ex);
                case "PUT"    -> handlePut(ex, parts);
                case "DELETE" -> handleDelete(ex, parts);
                default       -> Http.error(ex, 405, "Methode non autorisee");
            }
        } catch (Exception e) {
            e.printStackTrace();
            Http.error(ex, 500, e.getMessage());
        }
    }

    private Integer idDe(HttpExchange ex, String[] parts) throws IOException {
        try {
            return Integer.parseInt(parts[3]);
        } catch (Exception e) {
            Http.error(ex, 400, "ID invalide");
            return null;
        }
    }

    // ============================================================
    // GET
    // ============================================================
    private void handleGet(HttpExchange ex, String[] parts) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "utilisateur.lire")) return;
        if (parts.length == 3) {
            List<Utilisateur> propres = new ArrayList<>();
            for (Utilisateur u : dao.findAll()) propres.add(u.sansMotDePasse());
            Http.json(ex, 200, propres);
        } else if (parts.length == 4) {
            Integer id = idDe(ex, parts);
            if (id == null) return;
            Utilisateur u = dao.findById(id);
            if (u == null) Http.error(ex, 404, "Utilisateur introuvable");
            else Http.json(ex, 200, u.sansMotDePasse());
        } else {
            Http.error(ex, 400, "Route invalide");
        }
    }

    // ============================================================
    // POST /api/utilisateurs  (même règles que /api/auth/register)
    // Le mot de passe donné est TEMPORAIRE : le titulaire devra le remplacer à sa première connexion.
    // Corps facultatif : "profils": ["pharmacien", ...] = profils supplémentaires en plus de "role" (principal).
    // ============================================================
    private void handlePost(HttpExchange ex) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "utilisateur.creer")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);
        Utilisateur u = Http.GSON.fromJson(Http.body(ex), Utilisateur.class);
        if (u == null || u.username == null || u.username.isBlank()) { Http.error(ex, 400, "username obligatoire"); return; }
        u.username = u.username.trim();
        if (u.mot_de_passe == null || u.mot_de_passe.length() < 4) { Http.error(ex, 400, "mot de passe trop court (min 4)"); return; }
        if (u.role == null || !Utilisateur.roleValide(u.role)) { Http.error(ex, 400, "role obligatoire et valide"); return; }
        String erreurProfils = Utilisateur.erreurProfils(u.profils);
        if (erreurProfils != null) { Http.error(ex, 400, erreurProfils); return; }
        if (u.nom == null || u.nom.isBlank()) { Http.error(ex, 400, "nom obligatoire"); return; }
        if (u.id_structure <= 0 || structureDao.findById(u.id_structure) == null) { Http.error(ex, 400, "id_structure obligatoire et existante"); return; }
        if (!typeValide(u.type_praticien)) { Http.error(ex, 400, "type_praticien : Généraliste, Spécialiste ou Autre"); return; }
        if (dao.findByUsername(u.username) != null) { Http.error(ex, 409, "Cet username est deja pris"); return; }

        u.mot_de_passe = service.hash(u.mot_de_passe);
        u.doit_changer_mdp = true;
        int id = dao.insert(u);
        Utilisateur cree = dao.findById(id);
        Audit.ok(ex, acteur, "ADMIN", "utilisateur.creer", "Compte créé", "Utilisateur", id, cree.nomComplet(), null, null,
            Map.of("username", cree.username, "role", cree.role, "profils", cree.profils, "id_structure", cree.id_structure));
        Http.json(ex, 201, cree.sansMotDePasse());
    }

    // ============================================================
    // PUT /api/utilisateurs/{id} — seuls les champs PRÉSENTS dans le corps changent
    // « role » REMPLACE le profil principal (l'ancien est retiré, les autres profils restent) ; pour ajouter un
    // profil sans retirer l'ancien, utiliser POST /api/utilisateurs/{id}/profils.
    // ============================================================
    private void handlePut(HttpExchange ex, String[] parts) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "utilisateur.modifier")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);
        Integer id = idDe(ex, parts);
        if (id == null) return;
        Utilisateur existant = dao.findById(id);
        if (existant == null) { Http.error(ex, 404, "Utilisateur introuvable"); return; }

        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject()) { Http.error(ex, 400, "Body invalide"); return; }
        JsonObject b = el.getAsJsonObject();

        Utilisateur m = existant.sansMotDePasse();
        if (b.has("prenom"))         m.prenom = texte(b, "prenom");
        if (b.has("nom"))            m.nom = texte(b, "nom");
        if (b.has("email"))          m.email = texte(b, "email");
        if (b.has("telephone"))      m.telephone = texte(b, "telephone");
        if (b.has("role"))           m.role = texte(b, "role");
        if (b.has("id_structure"))   m.id_structure = b.get("id_structure").getAsInt();
        if (b.has("code_praticien")) m.code_praticien = texte(b, "code_praticien");
        if (b.has("type_praticien")) m.type_praticien = texte(b, "type_praticien");
        if (b.has("actif"))          m.actif = b.get("actif").getAsBoolean();

        if (m.nom == null || m.nom.isBlank()) { Http.error(ex, 400, "nom obligatoire"); return; }
        if (!Utilisateur.roleValide(m.role)) { Http.error(ex, 400, "role invalide"); return; }
        if (structureDao.findById(m.id_structure) == null) { Http.error(ex, 400, "Structure introuvable"); return; }
        if (!typeValide(m.type_praticien)) { Http.error(ex, 400, "type_praticien : Généraliste, Spécialiste ou Autre"); return; }

        boolean roleChange = !existant.role.equals(m.role);
        // profils après modification : le principal est remplacé, les autres sont conservés
        List<String> apresProfils = new ArrayList<>(existant.profils);
        if (roleChange) { apresProfils.remove(existant.role); if (!apresProfils.contains(m.role)) apresProfils.add(0, m.role); }
        boolean perdAdmin = existant.actif && existant.aProfil("administrateur") && (!apresProfils.contains("administrateur") || !m.actif);
        if (!garde(ex, acteur, id, perdAdmin, !m.actif && existant.actif)) return;
        if (roleChange && existant.aProfil("administrateur") && !apresProfils.contains("administrateur") && estMoi(acteur, id)) {
            Http.error(ex, 409, "Vous ne pouvez pas vous retirer votre propre profil administrateur.");
            return;
        }

        if (!dao.update(m)) { Http.error(ex, 500, "Echec de la mise a jour"); return; }
        if (roleChange) dao.remplacerProfilPrincipal(id, existant.role, m.role);
        boolean desactive = existant.actif && !m.actif;
        if (roleChange || desactive) JwtService.invaliderUtilisateur(id);

        Utilisateur maj = dao.findById(id);
        Map<String, Object> avant = resume(existant), apres = resume(maj);
        String action = desactive ? "utilisateur.desactiver" : (!existant.actif && m.actif ? "utilisateur.activer" : "utilisateur.modifier");
        Audit.ok(ex, acteur, "ADMIN", action, "Compte modifié", "Utilisateur", id, m.nomComplet(), null, avant, apres);
        Http.json(ex, 200, maj.sansMotDePasse());
    }

    // ============================================================
    // PATCH /api/utilisateurs/{id}/actif   { "actif": true|false }
    // ============================================================
    private void handleSetActif(HttpExchange ex, int id) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "utilisateur.modifier")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);
        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject() || !el.getAsJsonObject().has("actif")) { Http.error(ex, 400, "actif obligatoire (true ou false)"); return; }
        boolean actif = el.getAsJsonObject().get("actif").getAsBoolean();

        Utilisateur existant = dao.findById(id);
        if (existant == null) { Http.error(ex, 404, "Introuvable"); return; }
        boolean perdAdmin = existant.actif && !actif && existant.aProfil("administrateur");
        if (!garde(ex, acteur, id, perdAdmin, !actif)) return;

        dao.setActif(id, actif);
        if (!actif) JwtService.invaliderUtilisateur(id);
        Audit.ok(ex, acteur, "ADMIN", actif ? "utilisateur.activer" : "utilisateur.desactiver", actif ? "Compte activé" : "Compte désactivé",
            "Utilisateur", id, existant.nomComplet(), null, Map.of("actif", existant.actif), Map.of("actif", actif));
        Http.raw(ex, 200, "{\"message\":\"Statut mis a jour\"}");
    }

    // ============================================================
    // DELETE /api/utilisateurs/{id}
    // ============================================================
    private void handleDelete(HttpExchange ex, String[] parts) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "utilisateur.supprimer")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);
        Integer id = idDe(ex, parts);
        if (id == null) return;
        Utilisateur existant = dao.findById(id);
        if (existant == null) { Http.error(ex, 404, "Introuvable"); return; }
        boolean perdAdmin = existant.actif && existant.aProfil("administrateur");
        if (!garde(ex, acteur, id, perdAdmin, true)) return;

        try {
            dao.delete(id);
        } catch (SQLException e) {
            if (e.getErrorCode() == 547) {   // contrainte de clé étrangère
                Audit.refus(ex, acteur, "ADMIN", "utilisateur.supprimer", "Suppression de compte refusée", "REFUSE",
                    "Le compte est lié à des données (feuilles, prestations…)", "Utilisateur", id, null);
                Http.error(ex, 409, "Ce compte est lié à des données (feuilles, prestations, messages…) : désactivez-le plutôt que de le supprimer.");
                return;
            }
            throw e;
        }
        JwtService.invaliderUtilisateur(id);
        Audit.ok(ex, acteur, "ADMIN", "utilisateur.supprimer", "Compte supprimé", "Utilisateur", id, existant.nomComplet(), null, resume(existant), null);
        Http.raw(ex, 200, "{\"message\":\"Supprime\"}");
    }

    // ============================================================
    // POST /api/utilisateurs/{id}/profils   { "profil": "pharmacien" } — AJOUTER un profil
    // ============================================================
    private void handleAjouterProfil(HttpExchange ex, int id) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "utilisateur.modifier")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);
        String profil = profilDuCorps(ex);
        if (profil == null || !Utilisateur.roleValide(profil)) { Http.error(ex, 400, "profil obligatoire et valide : " + String.join(", ", Utilisateur.ROLES_VALIDES)); return; }
        Utilisateur existant = dao.findById(id);
        if (existant == null) { Http.error(ex, 404, "Utilisateur introuvable"); return; }
        if (existant.aProfil(profil)) { Http.error(ex, 409, "Ce compte porte déjà le profil « " + profil + " »."); return; }

        dao.ajouterProfil(id, profil);
        Utilisateur maj = dao.findById(id);

        JournalEvenement e = Audit.evt(ex, acteur, "ADMIN", "utilisateur.profil.ajouter", "Profil ajouté à un compte");
        e.ressourceType = "Utilisateur";
        e.ressourceId = String.valueOf(id);
        e.ressourceLibelle = existant.nomComplet();
        e.avant = Http.GSON.toJson(Map.of("profils", existant.profils));
        e.apres = Http.GSON.toJson(Map.of("profils", maj.profils, "ajoute", profil));
        e.reglesSupp = reglesAjoutProfil(maj, profil);
        JournalService.log(e);
        Http.json(ex, 201, maj.sansMotDePasse());
    }

    /** Règles de risque à l'ajout d'un profil : droits d'administration, ou profils qu'un même compte ne devrait pas cumuler. */
    private static List<JournalRegle> reglesAjoutProfil(Utilisateur u, String ajoute) {
        List<JournalRegle> regles = new ArrayList<>();
        if ("administrateur".equals(ajoute)) {
            regles.add(new JournalRegle("PROFIL_ADMIN_AJOUTE", "Le profil administrateur a été donné à un compte", 30));
        }
        if (u.aProfil("medecin") && u.aProfil("pharmacien")) {
            regles.add(new JournalRegle("PROFILS_INCOMPATIBLES", "Un même compte peut désormais prescrire (médecin) et servir (pharmacien)", 30));
        }
        return regles;
    }

    // ============================================================
    // DELETE /api/utilisateurs/{id}/profils/{profil} — RETIRER un profil
    // Refusé s'il ne reste qu'un profil, s'il s'agit du profil administrateur du dernier administrateur actif,
    // ou de son propre profil administrateur. Retirer le profil principal promeut le plus ancien des autres.
    // ============================================================
    private void handleRetirerProfil(HttpExchange ex, int id, String profil) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "utilisateur.modifier")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);
        Utilisateur existant = dao.findById(id);
        if (existant == null) { Http.error(ex, 404, "Utilisateur introuvable"); return; }
        if (!Utilisateur.roleValide(profil)) { Http.error(ex, 400, "profil invalide"); return; }
        if (!existant.aProfil(profil)) { Http.error(ex, 404, "Ce compte ne porte pas le profil « " + profil + " »."); return; }
        if (existant.profils.size() <= 1) {
            Http.error(ex, 409, "Un compte doit garder au moins un profil : ajoutez-en un autre avant de retirer celui-ci.");
            return;
        }
        boolean profilAdmin = "administrateur".equals(profil);
        if (profilAdmin && estMoi(acteur, id)) { Http.error(ex, 409, "Vous ne pouvez pas vous retirer votre propre profil administrateur."); return; }
        if (!garde(ex, acteur, id, profilAdmin && existant.actif, false)) return;

        String nouveauPrincipal = dao.retirerProfil(id, profil);
        JwtService.invaliderUtilisateur(id);   // ses sessions ouvertes sur ce profil ne sont plus valables
        Utilisateur maj = dao.findById(id);

        JournalEvenement e = Audit.evt(ex, acteur, "ADMIN", "utilisateur.profil.retirer", "Profil retiré d'un compte");
        e.ressourceType = "Utilisateur";
        e.ressourceId = String.valueOf(id);
        e.ressourceLibelle = existant.nomComplet();
        e.avant = Http.GSON.toJson(Map.of("profils", existant.profils));
        Map<String, Object> apres = new LinkedHashMap<>();
        apres.put("profils", maj.profils);
        apres.put("retire", profil);
        if (nouveauPrincipal != null) apres.put("nouveau_principal", nouveauPrincipal);
        e.apres = Http.GSON.toJson(apres);
        JournalService.log(e);
        Http.json(ex, 200, maj.sansMotDePasse());
    }

    // ============================================================
    // PUT /api/utilisateurs/{id}/profils/principal   { "profil": "..." } — profil utilisé par défaut à la connexion
    // ============================================================
    private void handleProfilPrincipal(HttpExchange ex, int id) throws Exception {
        if (!AuthGuard.verifierPermission(ex, "utilisateur.modifier")) return;
        Claims acteur = AuthGuard.claimsOuNull(ex);
        String profil = profilDuCorps(ex);
        if (profil == null || !Utilisateur.roleValide(profil)) { Http.error(ex, 400, "profil obligatoire et valide"); return; }
        Utilisateur existant = dao.findById(id);
        if (existant == null) { Http.error(ex, 404, "Utilisateur introuvable"); return; }
        if (!existant.aProfil(profil)) { Http.error(ex, 409, "Ce compte ne porte pas le profil « " + profil + " » : ajoutez-le d'abord."); return; }
        if (!profil.equals(existant.role)) {
            dao.definirProfilPrincipal(id, profil);
            Audit.ok(ex, acteur, "ADMIN", "utilisateur.profil.principal", "Profil principal modifié", "Utilisateur", id, existant.nomComplet(), null,
                Map.of("profil_principal", existant.role), Map.of("profil_principal", profil));
        }
        Http.json(ex, 200, dao.findById(id).sansMotDePasse());
    }

    private String profilDuCorps(HttpExchange ex) throws IOException {
        var el = Http.jsonBody(ex);
        if (el == null || !el.isJsonObject()) return null;
        JsonObject o = el.getAsJsonObject();
        return o.has("profil") && !o.get("profil").isJsonNull() ? o.get("profil").getAsString().trim() : null;
    }

    private static boolean estMoi(Claims acteur, int idCible) {
        return acteur != null && AuthGuard.getIdUtilisateur(acteur) == idCible;
    }

    // ------------------------------------------------------------
    // Garde-fous : pas d'auto-suppression / auto-désactivation, pas de perte du dernier admin
    // ------------------------------------------------------------
    private boolean garde(HttpExchange ex, Claims acteur, int idCible, boolean perdAdmin, boolean retireLeCompte) throws Exception {
        if (retireLeCompte && estMoi(acteur, idCible)) {
            Http.error(ex, 409, "Vous ne pouvez pas désactiver ou supprimer votre propre compte.");
            return false;
        }
        if (perdAdmin && dao.compterAdministrateursActifs() <= 1) {
            Http.error(ex, 409, "Impossible : ce compte est le dernier administrateur actif.");
            return false;
        }
        return true;
    }

    private static boolean typeValide(String t) {
        return t == null || t.isBlank() || Arrays.asList("Généraliste", "Spécialiste", "Autre").contains(t);
    }

    private static String texte(JsonObject b, String cle) {
        return b.get(cle).isJsonNull() ? null : b.get(cle).getAsString();
    }

    private static Map<String, Object> resume(Utilisateur u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("role", u.role);
        m.put("profils", u.profils);
        m.put("actif", u.actif);
        m.put("id_structure", u.id_structure);
        return m;
    }
}

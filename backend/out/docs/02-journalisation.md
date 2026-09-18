```markdown
# 🕒 Module 02 — Journalisation des connexions

Instructions pour brancher la page front-end **Journalisation** (qui s'est
connecté, quand, avec quel résultat) sur une vraie source de données
côté serveur.

**Statut actuel** : la page `Journalisation` existe déjà côté front
(`frontend/index.html` + `frontend/app.js`, vue `view-journalisation`) mais
lit `state.connexionLog`, stocké dans le `localStorage` du navigateur.
**Limite connue** : chaque poste ne voit que ses propres connexions — il
n'y a pas de vue globale multi-utilisateurs/multi-postes tant que ce n'est
pas branché sur l'API. Ce document décrit ce qu'il faut ajouter côté
`backend/` pour lever cette limite, dans le même style que le module
`01-auth.md`.


## 📑 Sommaire

- [Vue d'ensemble](#-vue-densemble)
- [1. Table SQL `Journal_Connexion`](#1-table-sql-journal_connexion)
- [2. Modèle `JournalConnexion.java`](#2-modèle-journalconnexionjava)
- [3. DAO `JournalConnexionDAO.java`](#3-dao-journalconnexiondaojava)
- [4. Brancher l'écriture dans `AuthController.login()`](#4-brancher-lécriture-dans-authcontrollerlogin)
- [5. Nouvelle route `GET /api/journal`](#5-nouvelle-route-get-apijournal)
- [6. Câblage front-end](#6-câblage-front-end)
- [7. Points d'attention](#7-points-dattention)


## 🎯 Vue d'ensemble

Il manque une seule chose structurante : une **table qui garde une ligne
par tentative de connexion** (succès ou échec), alors qu'aujourd'hui
`Utilisateur.derniere_connexion` n'écrase qu'une seule date par
utilisateur. Le reste (modèle, DAO, route, filtres) suit exactement le
même patron que `AuthController` / `UtilisateurDAO` déjà en place.

---

## 1. Table SQL `Journal_Connexion`

À ajouter dans `backend/MPD/gestionpatient.sql`, après la table
`Utilisateur` (dépend d'elle) :

```sql
-- =====================================================================
-- JOURNAL_CONNEXION  (dépend de Utilisateur)
-- =====================================================================
CREATE TABLE Journal_Connexion (
    id_journal      INT IDENTITY(1,1) PRIMARY KEY,

    -- NULL si le username saisi ne correspond à aucun compte (échec)
    id_utilisateur  INT NULL,
    username_saisi  NVARCHAR(50)  NOT NULL,   -- ce qui a été tapé, même si invalide

    resultat        NVARCHAR(10)  NOT NULL
        CONSTRAINT CK_Journal_resultat CHECK (resultat IN ('succes', 'echec')),

    adresse_ip      NVARCHAR(45)  NULL,       -- IPv4/IPv6 du client, si disponible
    date_heure      DATETIME2     NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT FK_Journal_Utilisateur FOREIGN KEY (id_utilisateur)
        REFERENCES Utilisateur(id_utilisateur)
);
GO

CREATE INDEX IX_Journal_DateHeure ON Journal_Connexion(date_heure DESC);
GO
```

> 📌 `id_utilisateur` reste `NULL` sur un échec "username inconnu" (on ne
> peut pas relier la tentative à un compte). Sur un échec "mauvais mot de
> passe", en revanche, on connaît l'utilisateur : `id_utilisateur` est
> renseigné et `resultat = 'echec'`.

---

## 2. Modèle `JournalConnexion.java`

`backend/model/JournalConnexion.java` — même style que `Utilisateur.java` :

```java
package model;

public class JournalConnexion {
    public int    id_journal;
    public Integer id_utilisateur;   // null si username inconnu
    public String usernameSaisi;
    public String resultat;          // "succes" | "echec"
    public String adresseIp;
    public String dateHeure;

    // Champs enrichis pour l'affichage (jointure avec Utilisateur, non stockés)
    public String nomUtilisateur;
    public String role;

    public JournalConnexion() {}
}
```

---

## 3. DAO `JournalConnexionDAO.java`

`backend/dao/JournalConnexionDAO.java` :

```java
package dao;

import db.Database;
import model.JournalConnexion;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class JournalConnexionDAO {

    // ------------------------------------------------------------
    // Enregistre une tentative de connexion (succès ou échec).
    // ------------------------------------------------------------
    public void insert(Integer idUtilisateur, String usernameSaisi,
                        String resultat, String adresseIp) throws SQLException {

        String sql = "INSERT INTO Journal_Connexion " +
                     "(id_utilisateur, username_saisi, resultat, adresse_ip) " +
                     "VALUES (?, ?, ?, ?)";

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            if (idUtilisateur == null) ps.setNull(1, Types.INTEGER);
            else ps.setInt(1, idUtilisateur);
            ps.setString(2, usernameSaisi);
            ps.setString(3, resultat);
            ps.setString(4, adresseIp);

            ps.executeUpdate();
        }
    }

    // ------------------------------------------------------------
    // Liste les connexions, plus récentes en premier, avec filtres
    // optionnels (tous nullable → filtre ignoré si null/vide).
    // ------------------------------------------------------------
    public List<JournalConnexion> findFiltered(String role, String resultat,
                                                String du, String au) throws SQLException {

        StringBuilder sql = new StringBuilder(
            "SELECT j.*, u.nom AS nom_utilisateur, u.role AS role " +
            "FROM Journal_Connexion j " +
            "LEFT JOIN Utilisateur u ON u.id_utilisateur = j.id_utilisateur " +
            "WHERE 1=1"
        );
        List<Object> params = new ArrayList<>();

        if (role != null && !role.isBlank())      { sql.append(" AND u.role = ?"); params.add(role); }
        if (resultat != null && !resultat.isBlank()) { sql.append(" AND j.resultat = ?"); params.add(resultat); }
        if (du != null && !du.isBlank())          { sql.append(" AND j.date_heure >= ?"); params.add(du); }
        if (au != null && !au.isBlank())          { sql.append(" AND j.date_heure <= ?"); params.add(au); }
        sql.append(" ORDER BY j.date_heure DESC");

        try (Connection c = Database.getConnection();
             PreparedStatement ps = c.prepareStatement(sql.toString())) {

            for (int i = 0; i < params.size(); i++) ps.setObject(i + 1, params.get(i));

            List<JournalConnexion> liste = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    JournalConnexion j = new JournalConnexion();
                    j.id_journal      = rs.getInt("id_journal");
                    Object idU        = rs.getObject("id_utilisateur");
                    j.id_utilisateur  = idU == null ? null : ((Number) idU).intValue();
                    j.usernameSaisi   = rs.getString("username_saisi");
                    j.resultat        = rs.getString("resultat");
                    j.adresseIp       = rs.getString("adresse_ip");
                    j.dateHeure       = rs.getString("date_heure");
                    j.nomUtilisateur  = rs.getString("nom_utilisateur");
                    j.role            = rs.getString("role");
                    liste.add(j);
                }
            }
            return liste;
        }
    }
}
```

---

## 4. Brancher l'écriture dans `AuthController.login()`

Dans `backend/controller/AuthController.java`, ajouter une instance du DAO :

```java
private final JournalConnexionDAO journalDao = new JournalConnexionDAO();
```

Puis, dans `login(HttpExchange ex)`, enregistrer **chacune** des trois
issues possibles (le code existant est indiqué en commentaire pour situer
où insérer) :

```java
// 2. Chercher l'utilisateur par son username
Utilisateur u = dao.findByUsername(demande.username);

String ip = ex.getRemoteAddress() != null
    ? ex.getRemoteAddress().getAddress().getHostAddress() : null;

if (u == null) {
    journalDao.insert(null, demande.username, "echec", ip);   // ← ajout
    sendJson(ex, 401, "{\"error\":\"Identifiants invalides\"}");
    return;
}

if (!u.actif) {
    journalDao.insert(u.id_utilisateur, demande.username, "echec", ip); // ← ajout
    sendJson(ex, 403, "{\"error\":\"Compte desactive\"}");
    return;
}

if (!service.verifier(demande.mot_de_passe, u.mot_de_passe)) {
    journalDao.insert(u.id_utilisateur, demande.username, "echec", ip); // ← ajout
    sendJson(ex, 401, "{\"error\":\"Identifiants invalides\"}");
    return;
}

// 5. Mettre à jour la date de dernière connexion
dao.updateDerniereConnexion(u.id_utilisateur);
journalDao.insert(u.id_utilisateur, demande.username, "succes", ip);    // ← ajout

// 6. Réponse 200 OK (sans le hash)
sendJson(ex, 200, gson.toJson(u.sansMotDePasse()));
```

> ⚠️ Ne fait pas échouer le login si l'écriture du journal plante — entourer
> ces trois appels d'un `try { ... } catch (SQLException e) { e.printStackTrace(); }`
> silencieux plutôt que de laisser l'exception remonter au bloc `catch`
> général de `handle()`, pour que la journalisation ne devienne jamais un
> point de panne de l'authentification.

---

## 5. Nouvelle route `GET /api/journal`

Dans `AuthController.handle()`, ajouter une branche :

```java
else if (path.equals("/api/journal") && method.equals("GET")) {
    listerJournal(ex);
}
```

Et la méthode correspondante, avec les filtres en query string
(`?role=medecin&resultat=echec&du=2026-09-01&au=2026-09-30`) :

```java
private void listerJournal(HttpExchange ex) throws Exception {
    var params = java.net.URLEncodedUtils.parse(ex.getRequestURI().getRawQuery(), StandardCharsets.UTF_8)
    // (ou un parsing manuel de getRawQuery() si URLEncodedUtils n'est pas déjà une dépendance)
    // ... extraire role / resultat / du / au ...
    List<JournalConnexion> liste = journalDao.findFiltered(role, resultat, du, au);
    sendJson(ex, 200, gson.toJson(liste));
}
```

*(Adapter le parsing de query string au style déjà utilisé ailleurs dans
`index.java` pour rester cohérent avec le reste du projet — l'important
est que `role`, `resultat`, `du`, `au` soient optionnels.)*

### Réponse — `200 OK`

```json
[
  {
    "id_journal": 42,
    "id_utilisateur": 1,
    "usernameSaisi": "danis",
    "resultat": "succes",
    "adresseIp": "192.168.1.12",
    "dateHeure": "2026-09-16T16:42:03.1234567",
    "nomUtilisateur": "Administrateur",
    "role": "administrateur"
  }
]
```

---

## 6. Câblage front-end

Une fois l'API dispo, remplacer dans `frontend/app.js` :

- `logConnexion(...)` (écrit dans `state.connexionLog` / `localStorage`) →
  ne plus rien faire côté front, le serveur journalise déjà lui-même à
  chaque appel `POST /api/auth/login`.
- `renderJournalisation()` → au lieu de lire `state.connexionLog`,
  faire `fetch('/api/journal?' + new URLSearchParams({role, resultat, du, au}))`
  et peupler le tableau avec la réponse.

Le HTML (`view-journalisation`, filtres, cartes KPI) n'a besoin d'aucun
changement — seule la source de données change.

---

## 7. Points d'attention

| Sujet | Détail |
|---|---|
| **Ne jamais logger le mot de passe** | Ni en clair ni hashé, dans aucune colonne de `Journal_Connexion`. |
| **Volume** | Cette table grossit à chaque tentative — prévoir une purge/archivage (ex. job qui supprime au-delà de 12 mois) une fois en production. |
| **RGPD / vie privée** | `adresse_ip` est une donnée personnelle — vérifier la durée de conservation avec le responsable du projet avant de l'activer. |
| **Cohérence des rôles** | Le front (`frontend/data.js`) utilise encore des libellés d'affichage (`"Agent de guichet"`, `"Médecin-conseil"`…) différents des valeurs SQL (`agent_accueil`, `medecin`…) — prévoir une table de correspondance si `role` doit filtrer via l'API plutôt qu'en front. |
| **`Structure` en dur côté front** | Le formulaire "Ajouter un utilisateur" du prototype front-end saisit la structure en texte libre ; la vraie table `Utilisateur.id_structure` est une FK vers `Structure` → prévoir un `<select>` peuplé par `GET /api/structures` (à créer si absent) plutôt qu'un champ texte. |
| **Photo assuré** | `Patient.photo_url` existe déjà en base — le prototype front (page *Nouvelle prise en charge*) n'affiche pour l'instant qu'un avatar à initiales en attendant un vrai upload/stockage de fichier. |

---

*Module **02 - Journalisation** — Projet GestionPatients — 2026*
```

# À faire — GestionPatients

Récapitulatif de tout ce qu'il reste à implémenter, à la date du **17 septembre 2026**, établi après
avoir lu l'intégralité du code backend et connecté le frontend à l'API réelle (voir le PDF
`GestionPatients - Connexion Frontend-Backend.pdf` pour le détail de cette connexion). Organisé par
zone, du plus bloquant au plus secondaire.

> **Backend fonctionnel en local, testé de bout en bout le 17/09/2026** (voir §2) : un compte
> `admin` / `admin123` (rôle `administrateur`) a été créé via `POST /api/auth/register` pour pouvoir
> tester — à changer ou supprimer avant toute mise en partage/production.
>
> **17/09/2026, après remplissage des tables par Lionel** : deux comptes ajoutés directement en base
> (`j.dupont`, `a.moussavou`) avaient un hash de mot de passe incomplet (56/57 caractères au lieu des
> 60 attendus par BCrypt — `IllegalArgumentException: Invalid salt revision` à la vérification),
> probablement collé/tronqué à la main plutôt que généré par le code. Impossible de se connecter avec
> ces comptes quel que soit le mot de passe essayé. Corrigé en régénérant un vrai hash BCrypt (via la
> même bibliothèque `jbcrypt` que le backend) : `j.dupont` / `dupont123` et `a.moussavou` /
> `moussavou123` — **mots de passe temporaires, à changer**. Les deux comptes se connectent maintenant
> normalement (testé en conditions réelles, JWT + accès aux vues selon le rôle). Vérifié aussi : la
> matrice de permissions ajoutée en base (35 permissions, `administrateur` en a bien les 35, les 5
> autres rôles en ont une part cohérente) — rien à corriger de ce côté.
>
> **⚠️ 17/09/2026 — Table `Patient` incomplète, bloque "Nouvelle prise en charge" (action requise) :**
> le front a été branché sur `GET /api/patients` pour rechercher un assuré par matricule (uniquement des
> données réelles désormais, plus aucune donnée générique — voir §3 mis à jour). Mais la table `Patient`
> réelle en base n'a pas la colonne `id_assure_principal`, alors que `PatientDAO.java` la lit sur chaque
> ligne (`rs.getInt("id_assure_principal")`) — conforme à `backend/MPD/gestionpatient.sql` (colonne bien
> définie dans le script), donc le code Java n'est pas en cause, c'est la table déployée qui a divergé du
> script. Résultat : `GET /api/patients` échoue actuellement à 100% avec `500 — Le nom de colonne
> id_assure_principal n'est pas valide`, quel que soit le matricule recherché.
>
> Je n'ai pas pu corriger ça moi-même (permission refusée pour modifier la base partagée). À exécuter
> une fois, par quelqu'un qui a la main sur SQL Server :
> ```sql
> ALTER TABLE Patient ADD id_assure_principal INT NULL;
> ALTER TABLE Patient ADD CONSTRAINT FK_Patient_AssurePrincipal
>     FOREIGN KEY (id_assure_principal) REFERENCES Patient(id_patient);
> ```
> Sans risque pour les données existantes (colonne nullable, purement additive). Autre écart repéré au
> passage, non corrigé (pas de risque de perte de données identifié, donc pas de correctif proposé) :
> `fonds` est `DECIMAL` dans la table réelle avec des valeurs qui ressemblent à des montants (150000.00,
> 45000.50...), alors que le script SQL le définit en `TINYINT` avec `CHECK (fonds IN (1,2,3,4))` (un
> niveau, pas un montant). Le front affiche la valeur réelle telle quelle (montant formaté), sans
> supposer laquelle des deux définitions est la bonne — à trancher avec qui a rempli ces données.

---

## 1. Backend — modules métier manquants (priorité haute)

L'API actuelle n'expose que 4 modules : **Auth**, **Patient**, **Utilisateur**, **Permission**. Tout le
cœur métier de l'application (le frontend l'a déjà entièrement, en local) n'a aucun équivalent côté API :

- [ ] **Structure** — table déjà en base (`Structure`), mais aucun `StructureController` /
      `StructureDAO` / `Structure.java`. Nécessaire pour : résoudre un nom de structure à partir de
      `Utilisateur.id_structure` (aujourd'hui affiché "Structure #N" côté front, faute de mieux), et
      proposer un vrai sélecteur de structure dans "Ajouter un utilisateur" (au lieu d'un ID fixé à 1
      en dur côté front).
- [ ] **Prise en charge** — aucune notion de "prise en charge" côté API. C'est le blocage principal :
      tant que ce module n'existe pas, "Nouvelle prise en charge" (le cœur de l'application) ne pourra
      jamais être branché sur de vraies données.
- [ ] **Prestation** — le code de permission `prestation.lire` / `prestation.creer` existe déjà dans le
      module Permission (table de référence), mais aucune route ne les utilise. Nécessaire pour la
      feuille de soins (Consultation).
- [ ] **Ordonnance** — codes de permission `ordonnance.lire` / `ordonnance.creer` /
      `ordonnance.delivrer` déjà réservés, mais pas de route. Nécessaire pour l'Ordonnance (côté
      médecin) et l'Espace Pharmacien (délivrance).
- [ ] **Examen** — pas de module ni de code de permission dédié. Nécessaire pour le bon d'examen.

> Une fois ces modules posés côté API, le frontend a déjà tout le code d'affichage prêt — il "suffira"
> d'écrire l'équivalent de `frontend/api.js` pour ces entités (voir §3 ci-dessous) en suivant le même
> patron que pour Auth/Utilisateur.

## 2. Backend — configuration et infrastructure

- [x] **Port SQL Server** — ✅ résolu le 17/09/2026. `backend/db/Database.java` pointait sur
      `localhost:1433;databaseName=gestionpatient`, alors que l'instance SQL Server Express de cette
      machine écoute en réalité sur un port dynamique et que la base réelle s'appelle `gestionPatients`
      (avec majuscule et un "s"). L'URL de connexion a été corrigée pour utiliser le nom d'instance
      (`localhost\SQLEXPRESS`, résolu via SQL Browser) et le vrai nom de base — seule ligne modifiée
      dans `Database.java`, aucune autre logique touchée. Le mot de passe du compte SQL `sa` a aussi été
      aligné sur celui déjà présent dans le code (aucune valeur de code changée). Testé de bout en bout
      avec un vrai compte (`admin` / `admin123`) : inscription, connexion, JWT, et liste des
      utilisateurs fonctionnent contre la vraie base SQL Server.
- [x] **Permission / RolePermission vides** — ✅ trouvé et résolu le 17/09/2026, en marge du point
      précédent. Ces deux tables sont bien définies dans `backend/MPD/gestionpatient.sql` mais n'ont
      jamais été peuplées : `PermissionService` chargeait donc un cache totalement vide au démarrage, et
      **toutes** les routes protégées par permission (y compris pour le rôle `administrateur`)
      répondaient `403`, même avec un token JWT valide. Un script `tools/seed-database.sql` (nouveau,
      hors de `backend/`) crée ces deux tables si absentes et les remplit avec les permissions de base
      et les permissions par défaut déjà documentées dans `backend/docs/04-permission.md` — aucune
      permission ni règle inventée, uniquement ce qui était déjà écrit dans la documentation du projet.
      À rejouer sur toute autre base fraîchement créée à partir du script SQL (ex. poste d'un autre
      développeur).
- [ ] **CORS** — le backend ne renvoie aucun en-tête `Access-Control-Allow-*` et ne répond pas aux
      requêtes `OPTIONS`. Un proxy de développement (`tools/dev-proxy.js`) contourne le problème sans
      toucher au backend, mais en production il serait plus propre de gérer le CORS nativement dans
      `index.java` (code prêt à copier en annexe du PDF).
- [ ] **Refresh token** — le JWT expire au bout d'1h sans mécanisme de renouvellement ; l'utilisateur
      doit se reconnecter entièrement. À envisager si des sessions plus longues sont nécessaires.
- [ ] **Pool de connexions** (HikariCP ou équivalent) — chaque requête ouvre actuellement sa propre
      connexion SQL Server via `DriverManager.getConnection()`. Mentionné comme piste dans
      `backend/GUIDE.md`, jamais fait.
- [ ] **Migration vers Maven** — le projet compile aujourd'hui à la main (`javac` + classpath manuel
      listant chaque `.jar`). Simplifierait la gestion des dépendances. Mentionné dans
      `backend/GUIDE.md`, jamais fait.

## 3. Frontend — brancher le reste sur l'API réelle

Une fois les modules du §1 disponibles côté backend, il restera à écrire côté front l'équivalent de ce
qui a déjà été fait pour Auth/Utilisateur (fonctions dans `api.js`, adaptation des données, bascule
avec repli local — voir le PDF pour le patron à suivre) :

- [x] **Recherche d'assuré (Nouvelle prise en charge)** — ✅ branchée le 17/09/2026 sur
      `GET /api/patients` (recherche par `matricule_nag`, filtrage côté front faute de route de
      recherche dédiée). Plus aucune donnée générique locale : un matricule qui n'existe pas
      réellement en base n'affiche plus d'assuré fictif. Bloquée en pratique tant que la colonne
      `id_assure_principal` manque en base (voir l'encart au-dessus) — le code est prêt et attend
      juste ce correctif SQL pour fonctionner. Champs non disponibles dans le schéma réel de `Patient`
      (date de naissance, lien assuré principal/ayant droit) affichés en "—" plutôt qu'inventés ; la
      vraie photo (`photo_url`) est utilisée si elle charge, avec repli sur les initiales sinon.
- [ ] **Création de la prise en charge elle-même** (ticket modérateur, médecin, type de soins...) —
      reste sur le futur module Prise en charge, absent de l'API (seule la recherche de l'assuré est
      branchée pour l'instant).
- [ ] **Feuille de soins / bon d'examen** — sur les futurs modules Prestation / Examen.
- [ ] **Ordonnance et Espace Pharmacien** — sur le futur module Ordonnance.
- [ ] **Historique, Statistiques, Rapports** — tous les trois agrègent des prises en charge ; ils
      suivront naturellement une fois "Nouvelle prise en charge" connectée.
- [ ] **Gestion des permissions** — le backend gère des permissions par action d'API
      (`patient.supprimer`...), le front gère des permissions par vue d'écran (`dashboard`, `rapports`...).
      Il faut d'abord décider comment faire correspondre les deux avant de brancher cet écran sur
      `/api/permissions` (fonctions déjà écrites et prêtes dans `api.js` :
      `apiListPermissions`, `apiGetPermissionMatrix`, `apiGrantPermission`, `apiRevokePermission`).
- [ ] **Journalisation** — pas de route backend pour un historique de connexions (seul
      `derniere_connexion`, une simple date, est stocké côté `Utilisateur`). Nécessiterait une nouvelle
      table + route côté API si on veut remplacer le journal actuellement tenu en local
      (`backend/docs/02-journalisation.md` contient déjà un plan détaillé pour ça, jamais implémenté).

## 4. Frontend — dette technique / architecture

- [ ] **Découpage de `app.js` et `style.css` en fichiers séparés** — ces deux fichiers sont
      aujourd'hui uniques et volumineux (plusieurs milliers de lignes). Un découpage par domaine
      (`js/auth.js`, `js/nouvelle-pec.js`, `css/feuille-soins.css`...) avait été fait une fois sur la
      branche `develop`, mais n'a pas été reporté sur `Modif-Feuille` : les deux versions du code
      avaient trop divergé entre-temps pour le refaire sans risque à ce moment-là. Reste une
      amélioration possible si l'équipe veut une base de code plus facile à naviguer à plusieurs.
- [ ] **Séparation prénom / nom côté backend** — `Utilisateur.nom` est aujourd'hui un seul champ
      "nom complet" côté base/API, alors que le front distingue `prenom` et `nom`. Le frontend fait une
      approximation (découpe sur le premier espace) qui échoue sur les noms composés ou titres
      ("Dr House" → prénom "Dr"). Un vrai champ `prenom` séparé côté `Utilisateur` (table + modèle +
      contrôleur) réglerait ça proprement.

## 5. Qualité / process

- [ ] **Suite de tests automatisée formelle** — tous les tests effectués jusqu'ici (frontend comme
      connexion backend) l'ont été manuellement avec Playwright, sans suite persistante ni intégration
      continue. Envisager des tests qui tournent automatiquement (GitHub Actions ou équivalent) à
      chaque *pull request*.
- [ ] **`README.md` du projet** — décrit l'organisation en branches (`main` / `develop` /
      `feature/...`) mais ne mentionne pas encore l'existence du proxy CORS (`tools/dev-proxy.js`) ni
      comment lancer l'ensemble (backend + proxy + frontend) — voir le PDF, §11, pour le contenu à
      reprendre.

---

*Document de suivi — à mettre à jour au fur et à mesure que les points sont traités.*

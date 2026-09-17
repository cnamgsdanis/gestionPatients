# À faire — GestionPatients

Récapitulatif de tout ce qu'il reste à implémenter, à la date du **17 septembre 2026**, établi après
avoir lu l'intégralité du code backend et connecté le frontend à l'API réelle (voir le PDF
`GestionPatients - Connexion Frontend-Backend.pdf` pour le détail de cette connexion). Organisé par
zone, du plus bloquant au plus secondaire.

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

- [ ] **Port SQL Server** — sur la machine de développement actuelle, SQL Server Express écoute sur un
      port dynamique (observé : 55463) et non sur le port fixe 1433 attendu par
      `backend/db/Database.java`. Toute requête qui touche la base échoue actuellement avec une erreur
      de connexion TCP. Deux solutions (détaillées dans le PDF, §10) : configurer un port fixe côté SQL
      Server (aucune modification de code), ou adapter l'URL de connexion dans `Database.java` pour
      utiliser le nom d'instance (`localhost\SQLEXPRESS`, via SQL Browser).
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

- [ ] **Nouvelle prise en charge** — recherche d'assuré, création de PEC, sur `/api/patients` +
      futur module Prise en charge.
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

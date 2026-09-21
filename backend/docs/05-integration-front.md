# 05 — Intégration du front-end : tout ce qui a été modifié côté back-end

**Date : 19/09/2026 — mis à jour le 20/09/2026 (sections 13 à 15) — base : SQL Server `gestionpatient` — Java 21, `com.sun.net.httpserver`.**
Ce document décrit **chaque modification** faite au back-end et à la base pour que le front (`frontend/`)
fonctionne avec de vraies données : ce qui a été ajouté, corrigé, la manière de démarrer et de tester,
les règles appliquées par le serveur et les limites connues.

Sommaire : [1. Résumé](#1-résumé) · [2. Démarrer](#2-démarrer-et-configurer) · [3. Base de données](#3-base-de-données)
· [4. Sécurité](#4-sécurité-et-session) · [5. Nouvelles routes](#5-nouvelles-routes) · [6. Routes modifiées](#6-routes-existantes-modifiées)
· [7. Bugs corrigés](#7-bugs-corrigés) · [8. Règles métier](#8-règles-métier-appliquées-par-le-serveur)
· [9. Journal d'audit](#9-journal-daudit) · [10. Fichiers](#10-fichiers-ajoutés-et-modifiés) · [11. Tests](#11-tests) · [12. Limites et recommandations](#12-limites-connues-et-recommandations)
· **[13. Livraison partielle et contrôles anti-fraude](#13-livraison-partielle-et-interrupteur-des-contrôles-anti-fraude)** · **[14. Profils multiples](#14-profils-multiples-par-utilisateur)** · **[15. Mot de passe temporaire](#15-mot-de-passe-temporaire-à-la-première-connexion)**

---

## 1. Résumé

| Domaine | Avant | Maintenant |
|---|---|---|
| NAG | `INT`, plage 1 000 000 000 – 2 147 483 647 | **texte de 10 chiffres** (`NVARCHAR(20)` + `CK_Patient_nag_10`) : `2345678901` est valide ; fourni ou généré |
| Assuré : nature / statut | absents de l'API | `nature` (texte) + `nature_assure` (1/2/3) ; `statut_assure` (BIT) exposé aussi comme `statut` : `actif` / `suspendu` |
| Assuré suspendu | aucune règle | **aucune prestation** : refus 409 à la création / validation d'une feuille, à la délivrance, à `/api/prestations` et `/api/pharmacie/recherche` |
| Feuilles de soins | inexistantes | module complet `/api/feuilles` (accueil → médecin → pharmacie), numérotation par le serveur, droits par champ |
| Médecins, catalogue | inexistants | `/api/medecins`, `/api/catalogue/medicaments` (CRUD du catalogue) |
| Règlements | inexistants | `/api/reglements` (plafond = reste à payer, avances) |
| Messages, alertes | inexistants | `/api/notifications` (envoi ciblé, lu, accusé, suivi) |
| Journal d'audit | inexistant | `/api/journal/*` : tout est tracé par le **serveur**, score de risque, alertes, chaîne d'empreintes HMAC, table en ajout seul |
| Session | jeton 1 h, `logout` sans effet, `register` **ouvert à tous** | jeton révocable, renouvelable (`/refresh`), `/me`, blocage après 5 échecs, `register` protégé |
| CORS / photos | absents | en-têtes CORS + `OPTIONS` ; photos servies sous `/media/…` (protégées) |
| Bugs | voir §7 | 7 corrigés |
| Livraison en pharmacie | une ligne servie en une fois | **partielle ou totale**, par **plusieurs pharmacies** (rupture de stock) : quantité servie, une ligne par livraison (`Ordonnance_delivrance`) — §13 |
| Contrôles anti-fraude | toujours actifs | **interrupteur du Super Admin** (`/api/parametres/controles`) : désactivés = l'administrateur peut réaliser tout le circuit ; les autres rôles restent contrôlés — §13 |
| Profils | un rôle par compte | **plusieurs profils par compte** (ajout / retrait par l'administrateur, changement de profil actif en session) — §14 |
| Premier mot de passe | choisi par l'administrateur | **temporaire** : le titulaire doit en choisir un à sa première connexion (le serveur bloque le reste tant que ce n'est pas fait) — §15 |

Le front n'utilise plus aucun stockage local (voir `frontend/README.md`) : **tout est lu et écrit dans cette base**.

---

## 2. Démarrer et configurer

### Lancer en local

Guide pas à pas : **[../../LANCER-EN-LOCAL.md](../../LANCER-EN-LOCAL.md)**. En résumé :

```
lancer-local.bat        (racine du dépôt : compile, démarre l'API et le site, ouvre http://localhost:5500)
backend\compile.bat     compile (s'arrête avec un code d'erreur si la compilation échoue)
backend\run.bat         java -cp "out;lib/*" index      (ou start.bat = compile + run)
```

Les commandes de compilation existantes (GUIDE.md) restent valables : la classe utilitaire `Http` est dans `service/` (il n'y a pas de dossier `util/`).

**Réglages locaux** : `backend/db/local.properties` (NON versionné ; modèle `local.properties.example`) — mêmes noms que les variables ci-dessous.
Priorité : variable d'environnement > option `-D` > `local.properties` > valeur par défaut du code. Le fichier est cherché dans `db/` puis `backend/db/`
(ou au chemin donné par `PEC_CONFIG_FILE`) ; pas d'antislash dans les valeurs (pour une instance nommée : `instanceName=SQLEXPRESS`).

Sur ce poste : SQL Server n'écoute pas sur le port 1433 (instances nommées `SQLEXPRESS` et `LIONEL`, ports dynamiques) et **Apache (WAMP) occupe
déjà les ports 8080 et 8090**. `local.properties` y règle donc l'instance `SQLEXPRESS` et `PEC_PORT=8081` ; `frontend/config.js` vise `http://localhost:8081`
quand la page est ouverte sur `localhost` (à adapter, ou à laisser vide en production sous la même origine).

### Réglages (variables d'environnement ou `local.properties` — toutes facultatives, les valeurs par défaut sont celles de l'ancienne version)

| Variable | Rôle | Défaut |
|---|---|---|
| `PEC_DB_URL` | URL JDBC. Instance nommée : `jdbc:sqlserver://localhost;instanceName=SQLEXPRESS;databaseName=gestionpatient;encrypt=true;trustServerCertificate=true` | `jdbc:sqlserver://localhost:1433;databaseName=gestionpatient;…` |
| `PEC_DB_USER` / `PEC_DB_PASSWORD` | compte SQL | `sa` / (ancien mot de passe du code) |
| `PEC_PORT` | port HTTP | `8080` |
| `PEC_JWT_SECRET` | clé de signature des jetons (≥ 32 caractères) | ancienne clé du code — **à changer en production** |
| `PEC_JWT_MINUTES` | durée d'un jeton | `60` |
| `PEC_AUDIT_KEY` | clé HMAC de la chaîne d'empreintes du journal | dérivée de `PEC_JWT_SECRET` |
| `PEC_CORS_ORIGINS` | origines autorisées, séparées par des virgules (`*` = toutes) | `*` |
| `PEC_MEDIA_DIR` | dossier des photos | `media` (donc `backend/media`) |

> ⚠️ `db/Database.java` contenait le mot de passe `sa` **en clair, dans un dépôt public**. Le comportement par
> défaut est inchangé pour ne rien casser, mais ce mot de passe est compromis : **changez-le**, définissez
> `PEC_DB_PASSWORD` et retirez la valeur par défaut du code. Idem pour `db/CONFIG LIONEL.txt` (versionné).

### Base de données : ordre d'exécution (UTF-8, option `-I` obligatoire)

```
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\gestionpatient.sql          (schéma v4, déjà fait)
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v5_integration_front.sql   (NOUVEAU — idempotent)
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v6_livraison_partielle_controles.sql   (livraison partielle + interrupteur des contrôles — idempotent)
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v7_profils_et_mdp_initial.sql          (profils multiples + mot de passe temporaire — idempotent)
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\donnees_demo.sql             (facultatif : 3 assurés de démonstration)
```

> ⚠️ **Après une mise à jour du code, exécutez les migrations v6 et v7** : le serveur lit `Ordonnance_delivrance`, `Parametre_systeme`, `Utilisateur_profil` et `Utilisateur.doit_changer_mdp` ; sans elles, la connexion et les feuilles échouent (« nom de colonne non valide »).

`tools/seed-database.sql` est **remplacé** par la migration v5 (elle crée les 38 permissions, y compris celles
que le code utilise et que l'ancien seed n'avait pas : `pec.*`, `examen.*`, `ordonnance.modifier|signer|annuler`, `prestation.modifier|supprimer`).
Il ne faut plus l'exécuter.

### Premier compte

Tant que la table `Utilisateur` est **vide**, `POST /api/auth/register` accepte, sans jeton, la création du tout premier
compte (forcé au rôle `administrateur`). Ensuite, il faut un jeton avec la permission `utilisateur.creer`.
Le compte `admin` / `admin` a été créé ainsi (structure « CNAMGS - Administration »).
**`admin` / `admin` est un mot de passe de test : changez-le avant toute exposition** (écran *Utilisateurs* →
« Réinitialiser le mot de passe », ou `PUT /api/auth/change-password`).

---

## 3. Base de données

Script : `MPD/migration_v5_integration_front.sql` — **100 % additif et idempotent** (aucune donnée supprimée ;
relancé, il ne change rien ; il ne rend pas un droit qu'un administrateur aurait retiré).

### 3.0 Script de création `MPD/gestionpatient.sql` (v4.2)

Mis à jour pour refléter la base réelle : `matricule_nag NVARCHAR(20)` (+ `CK_Patient_nag_10` en `LIKE` 10 chiffres), colonne `nature`, colonnes de délivrance de `Prescription`,
statuts d'`Ordonnance` incluant `partiellement_delivree`, `SET QUOTED_IDENTIFIER ON` (option `-I`), et deux nouvelles sections :
**13 bis — mise à niveau** (une base créée avec l'ancienne version passe en v4.1 : NAG `INT` → `NVARCHAR(20)` avec conservation des valeurs, ajout de `nature`,
colonnes et statuts de délivrance) et **14 — données de départ** : 33 permissions (les codes du code Java, plus `examen.supprimer`, `pec.creer` et `medicament.*` ajoutés en base)
et les droits par défaut de chaque rôle. `migrate_nag_int.sql` (conversion vers `INT`) est **obsolète** : ne plus l'exécuter.
**v4.2 (20/09/2026)** : nouvelle section **13 ter** (`Utilisateur_profil`, `Utilisateur.doit_changer_mdp`, `Parametre_systeme` + réglage `controles_antifraude`) et permission `controle.gerer` dans les données de départ — ce que les migrations v6 et v7 ajoutent aux tables que ce script crée. Les tables des modules (`Feuille_soins`, `Ordonnance_ligne`, **`Ordonnance_delivrance`**, `Reglement`, `Notification`, `Journal_evenement`) restent créées par les migrations v5 et v6, à exécuter **ensuite** (v7 est alors sans effet). Vérifié sur une base neuve temporaire : v4.2 → v5 → v6 → v7 = 45 permissions, 99 droits, tous les objets présents ; v6 et v7 rejouées sans erreur.
Vérifié : script v4.1 + migration v5 sur une base neuve = exactement la base réelle (44 permissions, 98 droits) ; le même sur une base créée avec l'ancien script (NAG `INT`) la met à niveau ; les deux scripts sont idempotents.

> ℹ️ Les permissions `medicament.*`, `pec.creer` et `examen.supprimer` existent en base mais **ne sont pas encore vérifiées par le code** : `MedicamentController` contrôle `structure.lire` / `structure.gerer`.
> À brancher (et à répartir entre rôles) le jour où l'on souhaite les utiliser.

### 3.1 Colonnes / contraintes modifiées

| Table | Changement |
|---|---|
| `Structure` | `CK_Structure_type` accepte aussi `'administration'` (rattachement des comptes d'administration ; `Utilisateur.id_structure` est NOT NULL) |
| `Utilisateur` | + `prenom NVARCHAR(100)`, `code_praticien NVARCHAR(30)`, `type_praticien NVARCHAR(20)` (`Généraliste` / `Spécialiste` / `Autre`, contrôlé). Si `prenom` est renseigné, `nom` est le nom de famille seul ; sinon (anciens comptes) `nom` est le nom complet |
| `Patient` | unicité du téléphone : index unique **filtré** `UX_Patient_contact … WHERE contact IS NOT NULL` (remplace `UQ_Patient_contact`, qui faisait double emploi ; sur une base dont l'unicité était une contrainte UNIQUE classique, elle corrige aussi la limite « un seul assuré sans téléphone ») |

`Patient.matricule_nag` (`NVARCHAR(20)`), `nature` (`NVARCHAR(50)`) et `statut_assure` (`BIT`) existent déjà dans la base :
le code Java a été adapté (voir §6). **Il n'y a pas de colonne `statut` distincte** : le statut *actif / suspendu* est porté par
`statut_assure` (`1` = actif, `0` = suspendu).

### 3.2 Nouvelles tables

| Table | Contenu |
|---|---|
| `Catalogue_medicament` | désignations + prix de référence proposés aux médecins (8 lignes de départ, à compléter par le métier) |
| `Feuille_soins` | une feuille de consultation ou d'examen : colonnes de recherche (`id_client`, `numero`, `type_feuille`, `statut`, `matricule_nag`, `id_patient`, `id_medecin`, `id_agent`, `id_structure`, `date_feuille`, `avec_ordonnance`, `id_prestation`) + `contenu` (**JSON**, contrôlé par `ISJSON`) |
| `Ordonnance_ligne` | lignes d'ordonnance en **texte libre**, avec le **prix unitaire saisi par le pharmacien**, la part assurance / patient, la pharmacie et la date de délivrance (`Prescription` reste réservée au flux « stock d'une pharmacie ») |
| `Reglement` | paiements et avances aux hôpitaux / pharmacies |
| `Notification`, `Notification_destinataire` | messages de l'administrateur et alertes de sécurité ; lu / accusé par destinataire |
| `Ordonnance_delivrance` *(v6)* | **une ligne par livraison** : `id_ligne`, `quantite`, `prix_unitaire`, `montant_total`, `part_assurance`, `part_patient`, `id_structure_pharmacie`, `id_pharmacien`, `date_delivrance` (voir §13) |
| `Parametre_systeme` *(v6)* | réglages modifiables par l'administrateur : `cle`, `valeur`, `modifie_par`, `modifie_le` — pour l'instant `controles_antifraude` = `1` / `0` (voir §13) |
| `Utilisateur_profil` *(v7)* | les profils (rôles) de chaque compte : `id_utilisateur`, `profil`, `date_ajout` (voir §14) |
| `Journal_evenement` | journal d'audit **en ajout seul** (déclencheurs `TR_Journal_no_delete`, `TR_Journal_no_update`), chaîné par HMAC |

Statuts stockés en ASCII : `Feuille_soins.statut` = `en_attente` / `validee` (l'API renvoie « En attente » / « Validée »).
Toutes les dates du journal, des messages sont en **UTC** ; l'API les renvoie au format ISO-8601 avec `Z`.

### 3.3 Permissions (39 avec la v6 ; 45 en base avec les codes hérités) et droits par défaut

Codes déjà utilisés par le code Java mais absents de l'ancien seed, plus les nouveaux : `feuille.creer|lire|modifier|valider|delivrer|supprimer`,
`reglement.lire|creer`, `notification.envoyer`, `journal.lire|gerer`.

| Rôle | Nouveaux droits par défaut |
|---|---|
| `administrateur` | tous |
| `agent_accueil` | `feuille.creer`, `feuille.lire`, `feuille.modifier` |
| `medecin` | `feuille.creer` (feuilles d'examen), `feuille.lire`, `feuille.modifier`, `feuille.valider` + `examen.*`, `ordonnance.modifier|signer` |
| `pharmacien` | `feuille.lire`, `feuille.modifier`, `feuille.delivrer` |
| `directeur_structure` | `feuille.lire`, `reglement.lire|creer`, `journal.lire` |
| `caissier_structure` | `feuille.lire`, `reglement.lire|creer` |

Modifiables ensuite depuis l'écran *Permissions* (`/api/permissions`).

**v6** : `controle.gerer` (activer / désactiver les contrôles anti-fraude) — `administrateur` uniquement. Un profil ajouté à un compte (§14) lui donne les droits de ce rôle, aucune permission nouvelle.

### 3.4 Données de départ

`CNAMGS - Administration` (structure), grille `TauxCouverture` (**80 % pour chaque fonds et chaque type de prestation** — valeur par
défaut à confirmer par le métier : `UPDATE TauxCouverture SET pourcentage_pec = …`), catalogue de 8 médicaments.
`Tarif` reste **vide** (les tarifs fixes de consultation / hospitalisation, utilisés seulement par l'ancienne route `/api/prestations`, sont à définir).

### 3.5 Retour arrière

Tout est additif : supprimer les 10 tables ci-dessus et les colonnes ajoutées (`Utilisateur.prenom`, `code_praticien`, `type_praticien`, `doit_changer_mdp` ; `Ordonnance_ligne.quantite_servie`) suffit (`DROP TABLE …`, `ALTER TABLE … DROP COLUMN …`).
Le journal étant protégé, désactiver d'abord le déclencheur : `DISABLE TRIGGER TR_Journal_no_delete ON Journal_evenement`.

---

## 4. Sécurité et session

| Sujet | Modification |
|---|---|
| `POST /api/auth/register` | était **ouvert à tous** (n'importe qui pouvait créer un administrateur). Désormais : jeton + `utilisateur.creer`, sauf le tout premier compte (§2). Validations : identifiant (`[A-Za-z0-9._@-]`, 50 max), mot de passe ≥ 4, rôle, structure existante, type de praticien |
| Jeton JWT | identifiant unique (`jti`) ; secret et durée configurables ; **révocation réelle** : `POST /api/auth/logout` et `POST /api/auth/refresh` révoquent l'ancien jeton ; désactivation, suppression, changement de rôle, **retrait d'un profil**, changement ou réinitialisation du mot de passe d'un compte **invalident tous ses jetons** aussitôt (liste tenue en mémoire ; le jeton neuf d'un changement de mot de passe est émis APRÈS l'invalidation) |
| `POST /api/auth/refresh` | nouveau jeton tant que le compte est actif — le front le déclenche à moins de 10 min de l'expiration (session glissante) |
| `GET /api/auth/me` | `{ user, permissions[] }` **du profil actif** : le menu du front s'en déduit ; pour l'administrateur, `controles_antifraude` (§13) |
| Mot de passe temporaire | jeton `chgmdp` : tout est refusé (403, `code: MDP_A_CHANGER`) sauf `/api/auth/{change-password, me, logout, refresh}` — §15 |
| Profil actif | le claim `role` du jeton est le profil ACTIF ; changer de profil délivre un nouveau jeton (`POST /api/auth/profil`) — §14 |
| Connexion | 5 échecs en 10 minutes sur un identifiant → **429** pendant 10 minutes ; chaque connexion (réussie **ou non**) est journalisée avec l'adresse IP |
| Comptes | on ne peut ni supprimer ni désactiver **son propre compte**, ni retirer le **dernier administrateur actif** (409) ; on ne se retire pas son propre profil administrateur ; un compte garde au moins un profil |
| CORS | `CorsFilter` : en-têtes + réponse `204` aux requêtes `OPTIONS` sur toutes les routes (`PEC_CORS_ORIGINS`). Le jeton étant un en-tête Bearer (pas un cookie), `*` est acceptable ; en production, listez les origines |
| Photos | `GET /media/patients/x.jpg` : jeton valide + `patient.lire` (en-tête, ou `?token=` pour une balise `<img>`) ; sortie du dossier impossible |
| Adresse IP | lue dans `X-Forwarded-For` si un reverse proxy est devant |

---

## 5. Nouvelles routes

Format : JSON UTF-8, `Authorization: Bearer <jeton>`, erreurs `{ "error": "message lisible" }` (affiché tel quel par le front).
Codes : 400 requête invalide · 401 jeton absent/expiré/révoqué · 403 droit manquant · 404 introuvable · 409 refus métier · 429 trop d'essais.

### 5.1 Authentification

| Route | Droit | Réponse |
|---|---|---|
| `POST /api/auth/login` | — | `{ username, mot_de_passe, profil? }` → `{ token, expires_in, user }` ; `profil` (facultatif) ouvre la session avec un profil précis du compte (403 s'il ne le porte pas) |
| `POST /api/auth/logout` | jeton | révoque le jeton |
| `POST /api/auth/refresh` | jeton | `{ token, expires_in, user }` — le profil actif est conservé |
| `POST /api/auth/profil` | jeton | `{ profil }` → nouveau jeton, `user.role` = profil actif ; 403 si le compte ne le porte pas (§14) |
| `GET /api/auth/me` | jeton | `{ user, permissions: ["patient.lire", …], controles_antifraude? }` |
| `PUT /api/auth/change-password` | jeton | `{ ancien, nouveau }` → `{ message, token, expires_in, user }` (§15) |
| `POST /api/auth/reset-password` | `utilisateur.modifier` | `{ id_utilisateur, nouveau }` : mot de passe **temporaire** (§15) |

`user` contient, en plus des champs habituels : `role` (profil **actif** de la session), `profil_principal`, `profils[]`, `doit_changer_mdp`.

### 5.2 Feuilles de soins — `/api/feuilles`

| Route | Droit | Description |
|---|---|---|
| `GET /api/feuilles` | `feuille.lire` | liste selon le rôle. Filtres : `nag`, `statut=En attente\|Validée`, `type=Consultation\|Examen`, `avec_ordonnance=1`, `servi_par_moi=1`, `depuis`, `jusqua` |
| `GET /api/feuilles/compteurs` | `feuille.lire` | `{ en_attente_medecin, ordonnances_a_servir }` |
| `GET /api/feuilles/{id}` | `feuille.lire` | une feuille (`id` = `serverId`) |
| `POST /api/feuilles` | `feuille.creer` | crée ; le serveur attribue `serverId`, `numero` (`F2026-00042`), `date` ; répond 201 |
| `PUT /api/feuilles/{id}` | `feuille.modifier` | brouillon, **validation** ou **délivrance** selon le rôle (ci-dessous) |
| `DELETE /api/feuilles/{id}` | `feuille.supprimer` | administrateur ; 409 si une ligne a déjà été servie ; supprime aussi Prestation, PEC, Examen, Ordonnance créés à la validation |

Le JSON d'une feuille est celui de l'interface (voir `frontend/INTEGRATION-BACKEND.md` §5.1) : `id` (identifiant **client**, unique),
`matricule`, `ticketModerateur`, `medecinId`, `prestations[]`, `ordonnance[]` (`designation`, `quantite`, `posologie`, `statut`, `servicePar`, `dateService`,
`prixUnitaire`, `partAssurance`, `partPatient`), `examens[]`, `signature`, `totalMontant`, `totalTm`, `totalPart`…

**Visibilité** : administrateur / directeur / caissier voient tout ; l'accueil, les feuilles de sa structure ; le médecin, celles qui lui sont désignées
ou de sa structure ; le **pharmacien ne peut pas parcourir** : il faut un `nag` (feuilles validées avec ordonnance) ou `servi_par_moi=1`.

**Droits par champ** (le serveur ignore le reste) :

| Rôle | Peut |
|---|---|
| `agent_accueil` | créer une feuille de **consultation** ; corriger la partie accueil tant qu'elle est « En attente » (jamais l'identité de l'assuré) ; ni valider ni écrire de délivrance |
| `medecin` | créer une feuille d'**examen** ; remplir sa partie ; passer `statut` à « Validée » ; jamais la partie accueil ni les champs de délivrance ; plus rien après validation (409) |
| `pharmacien` | uniquement la **délivrance** d'une feuille validée avec ordonnance : `ordonnance[i].aServir = { quantite, prixUnitaire }` (tout ou partie de la ligne — §13) ; ancien protocole `statut = "Servi"` + `prixUnitaire` = tout le reste |
| `administrateur` | **contrôles actifs** : ne modifie pas (403, message explicite) ; **contrôles désactivés** (§13) : réalise toutes les étapes |

**Validation** (transaction unique) : `Prestation` (montant = `totalMontant`) + `Prise_en_charge` (`montant_pec` = `totalPart`, statut `validee`) ;
feuille d'examen → ligne `Examen` (`en_attente`) ; consultation avec médicaments → `Ordonnance` (`envoyee`) + `Ordonnance_ligne`. Sans médicament :
pas d'ordonnance, jamais visible en pharmacie. Le dossier patient (`/api/consultations`, `/api/examens`) se met donc à jour seul — **le front ne les appelle plus**.

**Délivrance** (détail en §13) : le serveur **recalcule** `total = prix × quantité servie`, `partAssurance = round(total × taux)` avec le taux du ticket modérateur
(`Plein` 80 %, `Plein (ALD)` et `Exonéré` 100 %), `partPatient = total − partAssurance`, fixe la pharmacie, le pharmacien et la date, et **enregistre une livraison**
(`Ordonnance_delivrance`). Prix ≤ 0 ou quantité hors de `1 … reste à servir` refusés (400) ; une ligne entièrement servie ne peut pas être « désservie » (409) ;
l'ordonnance passe à `partiellement_delivree` dès qu'une ligne est entamée, puis à `delivree` quand toutes sont entièrement servies.
Le prix vient de la saisie du pharmacien, **jamais** du stock (`Medicaments`). Les champs de délivrance des feuilles renvoyées (`quantiteServie`, `statut`, `livraisons[]`…) sont **relus dans la base**.

### 5.3 Annuaires — `AnnuaireController`

| Route | Droit | Description |
|---|---|---|
| `GET /api/medecins` | `feuille.lire` | médecins actifs : `id_utilisateur`, `nom` (« prénom nom »), `code_praticien`, `type_praticien`, `id_structure`, `structure_nom` |
| `GET /api/catalogue/medicaments` | `feuille.lire` | `[{ id_catalogue, designation, prix_reference }]` (catalogue + désignations du stock des pharmacies) |
| `POST` / `PUT /{id}` / `DELETE /{id}` `/api/catalogue/medicaments` | `structure.gerer` | ajouter, modifier, retirer (`actif = 0`) ; doublon → 409 |

### 5.4 Règlements — `/api/reglements`

`GET` (`reglement.lire`) → `[{ id_reglement, kind, structure, montant, type, note, date }]`.
`POST` (`reglement.creer`) `{ kind: "hopital"|"pharmacie", structure, montant, type: "reglement"|"avance", note }` → 201.
La structure doit exister avec ce type ; un **règlement** ne peut pas dépasser le **reste à payer** (409) :
dû hôpital = somme des `montant_pec` validés de ses médecins ; dû pharmacie = somme des `part_assurance` de **ses livraisons** (`Ordonnance_delivrance` : une livraison partielle est due à la pharmacie qui l'a faite) ; moins ce qui a déjà été versé.
Une **avance** peut le dépasser.

### 5.5 Notifications — `/api/notifications`

| Route | Droit |
|---|---|
| `GET /api/notifications` | tout compte : **mes** messages non expirés (`lu`, `accuse`…) |
| `PUT /{id}/lu`, `PUT /{id}/accuse` | le destinataire (l'accusé vaut « lu ») |
| `POST /api/notifications` | `notification.envoyer` : `{ cible_type: all\|role\|etablissement\|user, cible_valeur, titre, message, priorite, categorie, accuse_requis, expire_le? }` → `{ id_notification, destinataires }` ; comptes **actifs** visés, sans l'expéditeur |
| `GET /api/notifications/envoyees?page&taille` | `notification.envoyer` : `{ items, total }` avec `destinataires`, `lus`, `accuses` |

Les alertes de sécurité (§9) sont créées par le serveur (catégorie `securite`, accusé requis) pour tous les administrateurs actifs.

### 5.6 Journal — `/api/journal`

| Route | Droit |
|---|---|
| `POST /evenements` | tout compte : l'interface signale **ses** actions (pages, recherches, exports). L'acteur, l'IP et l'heure sont ceux du serveur ; les actions que le serveur trace déjà sont ignorées (pas de doublon) |
| `GET /evenements`, `/connexions`, `/alertes`, `/resume` | `journal.lire` (filtres, pagination `page`/`taille`) |
| `PUT /alertes/{id}/revue` `{ statut: Vu\|Faux positif\|Confirmé, note }` | `journal.gerer` |
| `GET /integrite` | `journal.lire` : `{ ok, verifies, rupture:{seq,why} }` |

### 5.7 Photos — `GET /media/…` (voir §4)

---

## 6. Routes existantes modifiées

| Route | Modification |
|---|---|
| `/api/patients` | NAG en **texte** (10 chiffres) partout ; `POST` : NAG fourni (déjà attribué → 409) ou généré (max + 1, à partir de 1 000 000 000) ; **`nature` et `statut`** lus et écrits (`nature` : texte ou code 1/2/3 ; `statut` : `actif`/`suspendu`) ; un assuré créé **sans statut est actif** ; `PUT` **partiel** (les champs absents ne changent pas — avant, ils étaient effacés) ; contact vide → `NULL` ; suppression liée à des données → 409 ; création / modification / suspension / suppression journalisées |
| `/api/utilisateurs` | **profils** (§14 : `profils[]`, `POST/DELETE /{id}/profils`, `PUT /{id}/profils/principal`), création avec mot de passe **temporaire** (§15) ; `prenom`, `code_praticien`, `type_praticien` ; **`PUT` partiel** (avant, `{nom,email,role}` **désactivait le compte** car `actif` absent valait `false`) ; `id_structure` modifiable ; garde-fous (§4) ; suppression d'un compte lié à des données → 409 (« désactivez-le ») ; dates en ISO UTC ; toutes les opérations journalisées |
| `/api/structures` | type `administration` accepté (POST et PUT, avec validation du type) ; création / modification / suppression journalisées |
| `/api/permissions` | rôle validé ; chaque octroi / retrait journalisé (`permissions.modifier`) |
| `/api/prestations` (POST) | **409 si l'assuré est suspendu** ; taux de couverture selon le **type** de prestation |
| `/api/pharmacie/recherche` | NAG comparé en texte (voir §7) ; 409 si suspendu |
| `/api/ordonnances/{id}/statut` | accepte `partiellement_delivree` |

---

## 7. Bugs corrigés

| # | Bug constaté | Correction |
|---|---|---|
| 1 | `PharmacieController` comparait un `String` à un `Integer` (`nag.equals(p.matricule_nag)`) : toujours faux → toujours 404 ; il rechargeait tous les patients | recherche directe `findByNag` (NAG en texte) |
| 2 | `CouvertureService` lisait `taux_pourcent` (colonne inexistante ; la table a `pourcentage_pec` **par fonds et par type**) : grille vide, tous les `montant_pec` à 0 | lecture de `pourcentage_pec`, clé (fonds, type) |
| 3 | `TarifService` lisait `montant` (colonne : `montant_tarif`) | corrigé (tarif le plus bas défini pour le type) |
| 4 | `changerStatut` refusait `partiellement_delivree` (que le script SQL autorise) | ajouté |
| 5 | `PUT /api/utilisateurs/{id}` sans `actif` désactivait le compte | mise à jour par champs présents |
| 6 | `POST /api/auth/register` ouvert à tous | protégé (§4) |
| 7 | `logout` sans effet ; jeton non renouvelable ; pas de CORS ; photos non servies | §4 |
| — | Non modifié : `Patient.fonds` est `TINYINT 1..4` (le script v4 disait parfois `DECIMAL`) — la base réelle est bien `TINYINT` |

---

## 8. Règles métier appliquées par le serveur

* **Assuré suspendu = aucune prestation** (409, message explicite, refus journalisé) : création de feuille, validation, délivrance, `/api/prestations`, `/api/pharmacie/recherche`.
* **Numérotation** des feuilles par le serveur (`F<année>-<id sur 5 chiffres>`), jamais par le navigateur ; identifiant client en double → 409.
* **Séparation des rôles** : accueil = partie accueil ; médecin = partie médicale et validation ; pharmacien = délivrance seulement. Les montants sont **toujours recalculés** côté serveur.
* **Une consultation sans médicament n'est jamais visible en pharmacie.**
* **Ayant droit** : la couverture (`fonds_couverture`) est celle de l'assuré principal.
* **Suppression** d'une feuille déjà servie : refusée.

---

## 9. Journal d'audit

Le **serveur** écrit dans `Journal_evenement` : connexions (réussies et échecs, avec IP), créations / modifications / suppressions de comptes,
d'assurés, de structures, de permissions, feuilles créées et validées, médicaments servis, paiements, messages, revues d'alertes, et — par un filtre
sur toutes les routes — les **401**, **403** et **5xx** (1 événement par adresse, route et code et par minute).

**Score de risque (0-100)** = somme des règles déclenchées ; sévérité : `INFO` < 25 ≤ `ATTENTION` < 50 ≤ `ALERTE` < 80 ≤ `CRITIQUE`.

| Règle | Points |
|---|---|
| Échecs de connexion répétés (≥ 3 / ≥ 5 en 10 min) | 50 / 80 |
| Échecs sur ≥ 3 comptes depuis la même adresse | 40 |
| Connexion réussie après ≥ 3 échecs | 40 |
| Connexion hors horaires (avant 6 h, après 21 h) / week-end | 15 / 10 |
| Compte dormant (> 60 jours) / compte désactivé | 25 / 30 |
| Accès refusé (droits ou règle métier) | 20 |
| Création / modification de compte | 20 / 15 |
| Désactivation / réinitialisation de mot de passe / suppression de structure | 30 |
| Suppression de compte / modification des permissions | 40 |
| Paiement ≥ 5 000 000 FCFA | 30 |
| Prix unitaire > 3 × ou < 1/5 du tarif de référence | 25 |
| Même personne qui valide et sert | 50 |
| > 60 actions en une minute / ≥ 10 assurés consultés en 10 min / exports en rafale | 30 / 30 / 20 |

Score ≥ 25 : « alerte à examiner » (écran *Alertes*) ; **≥ 50** : notification de sécurité aux administrateurs (au plus une par action et compte tous les 15 min) ;
≥ 80 : « urgente ».

**Intégrité** : chaque événement porte `hash` = HMAC-SHA256 de ses champs + `hash_precedent`. `GET /api/journal/integrite` relit tout et détecte
une modification (« contenu modifié ») ou une suppression (« chaîne rompue »). La base refuse `UPDATE` (hors colonnes `revue_*`) et `DELETE` (déclencheurs).
Un seul serveur doit écrire dans le journal.

---

## 10. Fichiers ajoutés et modifiés

**Base (`MPD/`)** : `gestionpatient.sql` (v4.2, voir §3.0), `migration_v5_integration_front.sql`, `migration_v6_livraison_partielle_controles.sql`, `migration_v7_profils_et_mdp_initial.sql` (nouveaux), `donnees_demo.sql` (facultatif), `migrate_nag_int.sql` (marqué obsolète).

**Lancement** : `lancer-local.bat`, `LANCER-EN-LOCAL.md` (racine), `backend/db/local.properties.example`, `frontend/config.js`.

**Nouveaux (Java)** — `service/Http.java` (utilitaires HTTP + réglages) · `security/CorsFilter.java`, `AuditFilter.java` · `service/Audit.java`, `JournalService.java`, `FeuilleService.java` ·
`dao/FeuilleDAO.java`, `CatalogueDAO.java`, `ReglementDAO.java`, `NotificationDAO.java`, `JournalDAO.java` · `model/JournalEvenement.java` ·
`controller/FeuilleController.java`, `AnnuaireController.java`, `ReglementController.java`, `NotificationController.java`, `JournalController.java`, `MediaController.java` ·
**20/09/2026** : `service/ControleService.java`, `controller/ParametreController.java` (interrupteur des contrôles).

**Modifiés** — `index.java` (routes, filtres, port) · `db/Database.java` (variables d'environnement) · `service/JwtService.java`, `CouvertureService.java`, `TarifService.java` ·
`security/AuthGuard.java` (`claimsOuNull`) · `controller/AuthController.java`, `UtilisateurController.java`, `PatientController.java`, `StructureController.java`,
`PermissionController.java`, `PrestationController.java`, `PharmacieController.java`, `OrdonnanceController.java` · `dao/UtilisateurDAO.java`, `PatientDAO.java` ·
`model/Utilisateur.java`, `Patient.java` · `compile.bat` (code de sortie en cas d'échec), `start.bat`.

**Modifiés le 20/09/2026** — `service/FeuilleService.java` (livraison partielle, lecture des livraisons dans la base, mode supervision de l'administrateur) · `dao/FeuilleDAO.java` (`livrer`, `livraisonsPour`, `avancementOrdonnance`) · `dao/ReglementDAO.java` (dû des pharmacies) · `dao/UtilisateurDAO.java`, `model/Utilisateur.java` (profils, `doit_changer_mdp`) · `dao/NotificationDAO.java` (destinataires par profil) · `service/JwtService.java` (profil actif, claim `chgmdp`) · `security/AuthGuard.java` (blocage tant que le mot de passe est temporaire) · `controller/AuthController.java`, `UtilisateurController.java` (profils, mot de passe temporaire) · `controller/JournalController.java` (actions tracées par le serveur) · `index.java` (route `/api/parametres`).

---

## 11. Tests

Les modules ont été validés sur la **vraie base** (`localhost\SQLEXPRESS`, base `gestionpatient`) :

* `backend/tests/api-integration.test.js` — **270** vérifications sur l'API (dont, depuis le 20/09 : première connexion et mot de passe temporaire, livraison partielle sur deux pharmacies, interrupteur des contrôles, profils multiples) (Node ≥ 18, `node backend/tests/api-integration.test.js`) : comptes et droits, CRUD, assuré suspendu,
  circuit accueil → médecin → pharmacie avec contrôle des lignes créées en base, règlements, messages, journal (alertes, intégrité, refus de falsification), CORS, photos.
  Variables : `API` (défaut `http://localhost:8080`), `PEC_SQL_SERVER` (défaut `localhost\SQLEXPRESS`), `PEC_SQL_DB`.
  Il crée des données préfixées `ZTEST` / `zt_` ; `backend/tests/cleanup-tests.sql` **ne supprime que celles-ci** (les comptes, assurés, feuilles et messages réels sont conservés ; les compteurs du test se comparent
  à l'état de départ). Le journal d'audit étant en ajout seul, les événements des tests y restent (acteurs `zt_…`) ; `backend/tests/purge-journal.sql` le **vide entièrement** (à n'utiliser que sur une base de test
  ou de recette : il efface aussi les événements des vrais utilisateurs). **Redémarrez le serveur entre deux exécutions** : ses anti-doublons en mémoire (une alerte de sécurité par quart d'heure, un refus par minute) feraient sinon échouer
  les deux vérifications qui attendent ces événements.
* Le front, piloté dans Chrome contre ce back-end : **110** vérifications (première connexion et changement de mot de passe, comptes et profils, PEC, validation, délivrance partielle par deux pharmacies, historique, changement de profil actif, interrupteur des contrôles, session).

---

## 12. Limites connues et recommandations

1. **Secrets** : mot de passe SQL et clé JWT par défaut sont dans le code public → variables d'environnement, rotation, `admin`/`admin` à changer.
2. **HTTPS** obligatoire en production (le jeton circule dans chaque requête ; `?token=` des photos apparaît dans les journaux d'accès du proxy).
3. **Révocation des jetons en mémoire** : perdue au redémarrage du serveur ; les jetons restent alors valides jusqu'à leur expiration.
4. **Journal** : une seule instance du serveur doit écrire ; prévoir l'archivage / la rétention (la table est en ajout seul).
5. **Volumes** : la liste des feuilles est plafonnée à 1 000 lignes ; les rapports du front sont calculés à partir des feuilles reçues → prévoir des agrégats serveur et la pagination.
6. **`Tarif` vide** : définir les tarifs fixes si `/api/prestations` doit calculer les montants de consultation / hospitalisation.
7. **Taux de couverture** (80 % partout) et taux du ticket modérateur (80 % / 100 %) : à confirmer par le métier.
8. **Prestations pharmacie** : la délivrance est tracée ligne par ligne dans `Ordonnance_ligne` (pharmacie, prix, parts). Elle ne crée pas de `Prestation` de type `pharmacie`
   (une ordonnance peut être servie par plusieurs pharmacies) ; les états de règlement s'appuient sur `Ordonnance_ligne`.
9. **Structures** : aucune route ne calcule d'agrégats par hôpital / pharmacie ; le front le fait à partir des feuilles.
10. **Interrupteur des contrôles** : il n'expire pas tout seul (un réglage « se réactive après N minutes » est possible) ; il reste réservé à l'administrateur et chaque changement est une alerte de sécurité (§13).
11. **Profils cumulés** : un même compte peut porter *médecin* **et** *pharmacien* (le serveur le signale au journal, 30 points) ; la règle « la même personne ne valide pas et ne sert pas » reste vérifiée à la délivrance.
12. **Retrait d'un profil** : il ferme toutes les sessions du compte (y compris celles d'un administrateur qui se l'applique à lui-même : il doit se reconnecter).

---

## 13. Livraison partielle et interrupteur des contrôles anti-fraude

*(Migration `migration_v6_livraison_partielle_controles.sql` — idempotente.)*

### 13.1 Livraison partielle : servir tout ou partie, par une ou plusieurs pharmacies

**Besoin** : une ordonnance arrive avec une quantité à servir par médicament ; une pharmacie en rupture de stock sert ce qu'elle peut et le patient va chercher le reste dans une autre pharmacie.

**Base**

| Objet | Détail |
|---|---|
| `Ordonnance_ligne.quantite_servie` | quantité déjà servie, **toutes pharmacies confondues** (défaut 0) |
| `Ordonnance_ligne.statut_delivrance` | `non_delivre` → `partiel` → `delivre` (`CK_OrdLigne_statut` élargie) |
| **`Ordonnance_delivrance`** | **une ligne par livraison** : `quantite`, **`prix_unitaire`**, **`montant_total`**, **`part_assurance`**, **`part_patient`**, **`id_structure_pharmacie`**, **`id_pharmacien`**, **`date_delivrance`** (défaut `SYSDATETIME()`). Suppression en cascade avec la ligne ; les lignes déjà servies en une fois ont été converties en une livraison |
| `Ordonnance.statut` | `envoyee` → **`partiellement_delivree`** dès qu'une ligne est entamée → `delivree` quand **toutes** les lignes sont entièrement servies |

`Ordonnance_ligne` garde des colonnes de résumé (prix de la dernière livraison, montants **cumulés**, dernière pharmacie) ; **la vérité, c'est `Ordonnance_delivrance`**.

**Protocole** — `PUT /api/feuilles/{id}` par un pharmacien :

```json
{ "ordonnance": [ {}, { "aServir": { "quantite": 2, "prixUnitaire": "900" } } ] }
```

Les lignes sont lues **par rang** (une ligne sans `aServir` est ignorée). Pour chaque ligne demandée le serveur, dans **une seule transaction** :

1. relit la quantité déjà servie **dans la base** (verrou `UPDLOCK` : deux pharmacies qui servent en même temps ne peuvent pas dépasser la quantité prescrite) ;
2. exige un **entier** `1 ≤ quantite ≤ reste à servir` (sinon 400 : « Quantité à servir invalide pour « … » : entre 1 et N ») et un prix unitaire > 0 ;
3. **recalcule** `montant_total = prix × quantité`, `part_assurance` (taux du ticket modérateur : 80 % / 100 %), `part_patient` ;
4. insère la livraison (pharmacie et pharmacien = ceux du **jeton**, jamais ceux envoyés), met à jour la ligne et le statut de l'ordonnance ;
5. refuse (409) une ligne déjà entièrement servie, un assuré suspendu, une feuille non validée.

L'ancien protocole (`statut: "Servi"` + `prixUnitaire`) reste accepté : il sert **tout le reste** de la ligne.

**Réponse** — la feuille telle que la base la connaît ; pour chaque ligne d'ordonnance :

| Champ | Contenu |
|---|---|
| `quantite` | quantité prescrite |
| `quantiteServie` | déjà servie (toutes pharmacies) |
| `statut` | `Non servi` / `Partiel` / `Servi` |
| `livraisons[]` | `quantite`, `prixUnitaire`, `montantTotal`, `partAssurance`, `partPatient`, `servicePar` (nom de la pharmacie), `idPharmacie`, `pharmacien` (nom), `idPharmacien`, `dateService` (JJ/MM/AAAA), `heureService` (HH:MM) |
| `prixUnitaire`, `partAssurance`, `partPatient`, `servicePar`, `dateService` | résumé (parts cumulées, dernière livraison) pour les écrans qui lisent un seul jeu de champs |

Les champs de délivrance du JSON stocké dans `Feuille_soins.contenu` ne servent plus à l'affichage : `versJsonList` les **remplace par la lecture de la base** à chaque réponse.

**Autres effets**

* `GET /api/feuilles/compteurs` : `ordonnances_a_servir` = ordonnances dont une ligne n'est pas entièrement servie.
* `GET /api/feuilles?servi_par_moi=1` (pharmacien) : les feuilles où **sa** pharmacie a fait au moins une livraison.
* Règlements : le dû d'une pharmacie = somme des `part_assurance` de **ses** livraisons (§5.4).
* Suppression d'une feuille : refusée dès qu'une quantité a été servie.
* Journal : chaque livraison est un événement `pharma.servir` (quantité servie / prescrite, reste, prix, montants) ; règles `PRIX_ANORMAL` et `MEME_PERSONNE` inchangées.

### 13.2 Interrupteur des contrôles anti-fraude (Super Admin)

**Besoin** : parfois l'administrateur doit pouvoir faire tout le circuit pour l'observer ; d'où un bouton pour suspendre les contrôles du serveur.

**Mise en œuvre**

| Élément | Détail |
|---|---|
| Table `Parametre_systeme` | `controles_antifraude` = `1` (actifs, **défaut**) ou `0` ; `modifie_par`, `modifie_le` |
| Permission | `controle.gerer` (administrateur) |
| `GET /api/parametres/controles` | `{ actif, modifie_par, modifie_le }` |
| `PUT /api/parametres/controles` | `{ "actif": true \| false }` → même réponse. 400 si le corps est invalide ; 403 pour tout autre rôle |
| `GET /api/auth/me` | pour un administrateur : `controles_antifraude: true \| false` (le front s'en sert pour son bouton) |
| `ControleService` | lit le réglage (cache de 2 s) ; **en cas d'erreur de lecture, les contrôles restent ACTIFS** |

**Contrôles ACTIFS (défaut — fonctionnement habituel)** : chaque rôle ne fait que son étape ; l'administrateur ne modifie pas les feuilles (`403 Contrôles anti-fraude actifs : l'administrateur ne modifie pas les feuilles. Désactivez-les (bouton « Contrôles » de l'en-tête) pour superviser le circuit.` — c'est ce message qui remplace l'ancien « Ce rôle ne peut pas modifier une feuille »).

**Contrôles DÉSACTIVÉS (« mode supervision », administrateur seulement)** — l'administrateur peut, par `PUT /api/feuilles/{id}` :

| Étape | Ce que fait le serveur |
|---|---|
| feuille « En attente » | comme un **médecin**, sans limite de périmètre : remplir la partie médicale, corriger la partie accueil (coordonnées, ticket modérateur, médecin désigné — **jamais l'identité de l'assuré**), puis **valider** (Prestation, PEC, Ordonnance créées ; la prestation est attribuée au **médecin désigné**, sinon à l'administrateur) |
| feuille validée | comme un **pharmacien** : `aServir` (§13.1) ; la livraison est attribuée à **sa** structure et à son compte |
| création | l'administrateur crée des feuilles ; la structure de la feuille est celle du médecin désigné |

**Ce que l'interrupteur NE désactive PAS** : l'authentification et les droits de chaque route ; le refus d'un assuré suspendu ; l'intégrité (feuille validée non modifiable par un autre chemin, ligne servie non annulable, quantité servie ≤ prescrite) ; les montants recalculés par le serveur ; le journal ; les contrôles appliqués aux **autres** rôles (l'accueil ne valide toujours pas, etc.).

**Traçabilité** : chaque changement est un événement `controles.modifier` (catégorie `SECURITE`, avant / après) ; **désactiver** ajoute la règle `CONTROLES_DESACTIVES` (**60 points** → alerte de sécurité à tous les administrateurs) ; chaque action faite en mode supervision est un événement `feuille.supervision` (règle de 15 points). Les deux actions sont « réservées au serveur » (une interface ne peut pas les journaliser à sa place).

**Front** : pastille « Contrôles actifs / désactivés » dans l'en-tête du Super Admin (confirmation avant de désactiver, réactivation immédiate), bandeau « Mode supervision » tant que c'est désactivé, état resynchronisé toutes les 20 s.

---

## 14. Profils multiples par utilisateur

*(Migration `migration_v7_profils_et_mdp_initial.sql`.)*

**Définition** : un **profil** est un rôle (`administrateur`, `medecin`, `pharmacien`, `agent_accueil`, `directeur_structure`, `caissier_structure`). Il décide des **interfaces** (écrans du front) et des **droits** (permissions du rôle). Un compte peut en porter plusieurs
(ex. un médecin qui tient aussi la pharmacie de l'hôpital) ; l'administrateur en **ajoute** ou en **retire** depuis *Gestion des utilisateurs* (icône « Profils du compte » de la liste, ou « Gérer les profils » dans la fiche d'un compte).

**Base** : `Utilisateur_profil (id_utilisateur, profil, date_ajout)` — clé primaire (compte, profil), suppression en cascade avec le compte. `Utilisateur.role` reste le **profil principal** (celui de la connexion par défaut) et figure toujours dans la table ; la migration donne à chaque compte existant son rôle comme unique profil.

**Session** : le jeton porte le profil **actif** (claim `role`) ; c'est lui que lisent toutes les vérifications de droits (`AuthGuard`, `FeuilleService`…), donc une session n'a **jamais** les droits de deux profils à la fois (la séparation « prescrire / servir » reste vérifiée). `user.role` = profil actif, `user.profil_principal` = celui de la base, `user.profils[]` = tous.

| Route | Droit | Description |
|---|---|---|
| `GET /api/utilisateurs`, `/{id}` | `utilisateur.lire` | chaque compte avec `role` (principal), `profils[]` |
| `POST /api/utilisateurs/{id}/profils` `{ profil }` | `utilisateur.modifier` | **ajoute** un profil (201 ; 409 s'il le porte déjà ; 400 profil inconnu) |
| `DELETE /api/utilisateurs/{id}/profils/{profil}` | `utilisateur.modifier` | **retire** un profil ; si c'est le principal, le plus ancien des autres le devient ; ferme les sessions du compte |
| `PUT /api/utilisateurs/{id}/profils/principal` `{ profil }` | `utilisateur.modifier` | change le profil principal (le compte doit déjà le porter ; 409 sinon) |
| `PUT /api/utilisateurs/{id}` `{ role }` | `utilisateur.modifier` | comportement historique : le profil principal est **remplacé** (l'ancien est retiré, les autres profils restent) |
| `POST /api/utilisateurs` / `POST /api/auth/register` | `utilisateur.creer` | `role` = principal, `profils: [...]` = profils supplémentaires (facultatif) |
| `POST /api/auth/login` `{ …, profil? }` | — | session ouverte avec ce profil |
| `POST /api/auth/profil` `{ profil }` | jeton | change de profil **actif** (nouveau jeton ; l'ancien est révoqué) |

**Garde-fous** : un compte garde **au moins un profil** (409) ; on ne retire pas le profil *administrateur* du **dernier administrateur actif**, ni à **soi-même** (409) ; ajouter *administrateur* ou cumuler *médecin* + *pharmacien* déclenche une règle de risque
(`PROFIL_ADMIN_AJOUTE` et `PROFILS_INCOMPATIBLES`, 30 points chacune) ; `PUT` d'un compte qui perdrait son profil administrateur applique les mêmes contrôles.

**Effets sur le reste du serveur** : l'annuaire `/api/medecins` et la désignation d'un médecin sur une feuille reconnaissent tout compte qui **porte** le profil `medecin` ; un message adressé à un **rôle** (`cible_type = role`) atteint tout compte qui porte ce profil ; les alertes de sécurité
vont à tout compte qui porte le profil administrateur ; le décompte du « dernier administrateur » suit la même règle.

**Journal** : `utilisateur.profil.ajouter`, `utilisateur.profil.retirer`, `utilisateur.profil.principal` (catégorie `ADMIN`), `auth.profil.changer` (`AUTH`) — actions réservées au serveur.

**Interfaces de chaque profil** (côté front, `ROLE_ACCESS_DEFAULT` ; la fenêtre « Profils » les affiche) :

| Profil | Interfaces |
|---|---|
| Super Admin (`administrateur`) | Tableau de bord, Rapports, Nouvelle prise en charge, Espace Médecin, Espace Pharmacien, Historique PEC, Gestion des utilisateurs, Structures, Journalisation, Gestion des permissions |
| DG (`directeur_structure`) | Tableau de bord, Rapports, Journalisation |
| Médecin (`medecin`) | Espace Médecin (+ feuille de soins et dossier patient) |
| Agent hospitalier (`agent_accueil`) | Nouvelle prise en charge, Historique PEC |
| Pharmacien (`pharmacien`) | Espace Pharmacien |
| Caisse (`caissier_structure`) | Tableau de bord, Rapports |

**Vocabulaire du front (21/09/2026)** : *profil* = ensemble d'interfaces (le libellé du profil `pharmacien` est désormais « **Pharmacien** » ; « Pharmacie » ne désigne plus que le **type de structure**) ; le menu du compte propose « Mon compte ». Aucune route ni aucune donnée n'a changé : seuls les libellés de l'interface.

**Écran « Structures »** (front seul, aucune route nouvelle) : page propre du menu *Administration* (`structure.lire` ; boutons d'écriture selon `structure.gerer`), qui remplace le bloc « structures » de *Gestion des utilisateurs*. Il s'appuie sur `GET /api/structures` (liste, groupée par type puis alphabétique), `POST` (ajout, type `hopital` / `pharmacie` / `administration`), `PUT /{id}` (modification) et `DELETE /{id}` (suppression : le bouton est désactivé tant qu'un compte est rattaché — colonne « Comptes » calculée depuis `GET /api/utilisateurs` — et le serveur répond de toute façon 409 si des données y sont liées).

---

## 15. Mot de passe temporaire à la première connexion

*(Migration `migration_v7_profils_et_mdp_initial.sql` : `Utilisateur.doit_changer_mdp BIT NOT NULL DEFAULT 0` — les comptes existants ne sont pas concernés.)*

**Règle** : le mot de passe donné par un administrateur est **temporaire**. Le drapeau `doit_changer_mdp` passe à 1 quand un administrateur

* **crée** un compte (`POST /api/utilisateurs` ou `POST /api/auth/register` avec jeton) — pas pour le tout premier compte, créé sans jeton par l'installateur ;
* **réinitialise** un mot de passe (`POST /api/auth/reset-password`) — sauf s'il réinitialise le sien.

**Blocage côté serveur** : le jeton d'un compte à mot de passe temporaire porte `chgmdp = true`. `AuthGuard` refuse alors **toute** route sauf `/api/auth/change-password`, `/api/auth/me`, `/api/auth/logout` et `/api/auth/refresh` :
`403 { "error": "Vous devez d'abord choisir votre mot de passe personnel.", "code": "MDP_A_CHANGER" }`. Ce n'est donc pas qu'une fenêtre du front : l'API elle-même reste fermée.

**Changement** — `PUT /api/auth/change-password { ancien, nouveau }` : ancien correct (401 sinon), `nouveau` ≥ 4 caractères et **différent** de l'ancien (400). Le drapeau retombe à 0, **tous les jetons du compte sont invalidés** et un **jeton neuf** est renvoyé
(`{ message, token, expires_in, user }`) : la personne reste connectée. Événement `auth.mdp.initial` (premier choix) ou `auth.mdp.changer`.

**Front** : après une connexion réussie d'un compte à mot de passe temporaire, la fenêtre « Choisissez votre mot de passe » (mot de passe temporaire déjà repris, nouveau mot de passe, confirmation) s'ouvre **avant** l'application ; « Annuler la connexion » révoque le jeton restreint.
La liste des utilisateurs signale les comptes « Mot de passe à changer ».

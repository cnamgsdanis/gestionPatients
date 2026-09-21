# Intégration front ↔ back-end — contrat et état

**État au 19/09/2026 : le back-end implémente tout ce que le front utilise** (base `gestionpatient`, API Java). Ce document est la
référence du **contrat** entre l'interface et l'API ; le détail côté serveur (base, sécurité, règles, journal, tests, limites) est dans
[`backend/docs/05-integration-front.md`](../backend/docs/05-integration-front.md).

## 1. Résumé

| | |
|---|---|
| **Front** | Aucun stockage local de données : ni `localStorage`, ni jeu de démonstration, ni compte local, ni repli. Tout est lu et écrit dans la base par l'API. Reste seulement, dans `sessionStorage` (propre à l'onglet, effacé à sa fermeture) : le jeton JWT, la session (utilisateur, page) et de petites préférences d'affichage. |
| **Branché sur l'API réelle** | connexion / session / renouvellement du jeton, utilisateurs (avec code et type de praticien), structures (écran de gestion), permissions, recherche d'un assuré par NAG (10 chiffres, nature, statut), dossier patient, feuilles de soins (accueil → médecin → pharmacie), annuaire des médecins, catalogue des médicaments, règlements, messages, journalisation et alertes. |
| **Validé** | 158 vérifications de l'API sur la vraie base + 59 vérifications du front dans Chrome contre ce back-end (voir `backend/docs/05-integration-front.md` §11). |
| **Reste à la charge de l'exploitation** | secrets (mot de passe SQL, clé JWT, compte `admin`/`admin` de test), HTTPS, sauvegarde, taux de couverture et ticket modérateur à confirmer par le métier (voir §7). |

## 2. Ce qui change côté navigateur

- `api.js` : nouvelle couche d'accès (jeton dans `sessionStorage`, message clair si le serveur ne répond pas,
  401 → retour à la connexion avec « votre session a expiré »). `data.js` est supprimé (il ne contenait que des
  données fictives). Adresse de l'API : `window.PEC_API_BASE_URL` (à définir avant `api.js`), sinon
  `http://localhost:8090` en local (proxy de `tools/dev-proxy.js`), sinon **la même origine que le site**.
- Chaque écran charge ses données au moment où il s'ouvre et toutes les 20 s (nouvelles feuilles des autres
  utilisateurs, compteurs, messages). Une feuille en cours de saisie n'est jamais écrasée.
- Créer une prise en charge, valider une feuille, servir un médicament, enregistrer un paiement : **l'écran ne
  confirme qu'une fois la base a répondu** ; en cas de refus (droits, assuré suspendu, feuille déjà validée…),
  rien n'est affiché comme fait et le message du serveur est montré.
- Le menu suit les droits du rôle, affinés par les permissions renvoyées par `GET /api/auth/me` quand cette route existe.
- « Gestion des permissions » n'a plus de matrice locale : uniquement celle du serveur.

## 3. Carte fonctionnalité → route (toutes implémentées ✅)

| Fonctionnalité | Route(s) |
|---|---|
| Connexion, déconnexion, renouvellement, compte courant | `POST /api/auth/login` (`profil?`), `/logout`, `/refresh` ; `GET /api/auth/me` (avec `controles_antifraude` pour l'administrateur) |
| Profil actif (compte à plusieurs profils) | `POST /api/auth/profil` `{ profil }` → nouveau jeton |
| Mot de passe (temporaire à la première connexion) | `PUT /api/auth/change-password` (renvoie un jeton neuf), `POST /api/auth/reset-password` |
| Utilisateurs (CRUD, activer, code et type de praticien) | `GET/POST/PUT/DELETE /api/utilisateurs[/{id}]`, `PATCH /api/utilisateurs/{id}/actif`, `POST /api/auth/register` |
| Profils d'un utilisateur | `POST /api/utilisateurs/{id}/profils`, `DELETE …/profils/{profil}`, `PUT …/profils/principal` |
| Contrôles anti-fraude (Super Admin) | `GET/PUT /api/parametres/controles` |
| Structures (hôpitaux, pharmacies, administration) | `GET/POST/PUT/DELETE /api/structures[/{id}]` |
| Permissions | `GET /api/permissions[/matrix]`, `POST/DELETE /api/permissions/role/{role}/{code}` |
| Recherche d'un assuré (NAG en texte, nature, statut) | `GET /api/patients/nag/{nag}` |
| Dossier patient | `GET /api/consultations?id_patient=`, `GET /api/examens?id_patient=` (alimentés par la validation des feuilles) |
| Annuaire des médecins, catalogue des médicaments | `GET /api/medecins`, `GET /api/catalogue/medicaments` |
| Feuilles de soins, compteurs, délivrance | `GET/POST /api/feuilles`, `GET/PUT/DELETE /api/feuilles/{id}`, `GET /api/feuilles/compteurs` |
| Règlements des hôpitaux et pharmacies | `GET/POST /api/reglements` |
| Messages de l'administrateur | `GET/POST /api/notifications`, `PUT …/{id}/lu`, `PUT …/{id}/accuse`, `GET …/envoyees` |
| Journalisation, alertes, intégrité | `POST/GET /api/journal/evenements`, `GET …/connexions`, `…/alertes`, `…/resume`, `…/integrite`, `PUT …/alertes/{id}/revue` |
| Photos des assurés | `GET /media/…?token=` |

## 4. Anomalies signalées précédemment : traitées

Le NAG en texte, `nature` / `statut`, les bugs de `PharmacieController`, `CouvertureService`, `TarifService`, `changerStatut`, l'absence de CORS,
le jeton sans renouvellement ni révocation, les photos non servies et `register` ouvert à tous sont **corrigés** (liste et détails :
`backend/docs/05-integration-front.md` §7). Le statut *actif / suspendu* est porté par la colonne existante `statut_assure` (pas de colonne `statut`).

## 5. Contrat des routes (implémenté)

Format : JSON, en-têtes `Authorization: Bearer <jeton>`, erreurs `{ "error": "message lisible" }` (le front l'affiche
tel quel). Codes : 401 jeton refusé, 403 droit manquant, 404 inconnu, 409 refus métier (assuré suspendu, feuille déjà
validée, identifiant déjà utilisé…).

### 5.1 Feuille de soins

Une feuille est une consultation ou une feuille d'examen. **Le JSON est celui que l'interface manipule** ; le serveur peut
le stocker tel quel (colonne `NVARCHAR(MAX)` JSON `contenu`) et tenir à jour des colonnes de recherche
(`id_client`, `numero`, `type`, `statut`, `matricule_nag`, `id_medecin`, `id_agent`, `id_structure`, dates).

```json
{
  "id": 1789012345678123,          // identifiant CLIENT (unique) : le serveur le garde (UNIQUE) et le renvoie tel quel
  "serverId": 42,                  // clé du serveur (id_feuille) — utilisée dans /api/feuilles/{serverId}
  "numero": "F2026-00042",         // ATTRIBUÉ PAR LE SERVEUR (séquence, sans doublon) ; la valeur envoyée est ignorée
  "date": "19/09/2026",            // attribuée par le serveur (JJ/MM/AAAA)
  "type": "Consultation",          // ou "Examen"
  "statut": "En attente",          // "En attente" | "Validée"
  "matricule": "1345678901", "patientNom": "Sylvie MOUSSAVOU", "dateNaissance": "1988-03-14", "estAssure": true, "fonds": "Fonds Secteur Privé",
  "ticketModerateur": "Plein",     // "Plein" | "Plein (ALD)" | "Exonéré"
  "medecinId": 3, "medecin": "Dr. Rosine AKUE", "medecinCode": "MED-00456", "medecinType": "Spécialiste", "medecinEtab": "Polyclinique El Rapha",
  "quartier": "", "telephone": "", "service": "Médecine générale",
  "accidentTiers": "", "grossesse": "",
  "prestations": [], "prestaDate": "", "prestaDomicile": "", "prestaCode": "",
  "ordonnance": [ { "designation": "Paracétamol 500mg (boîte de 16)", "quantite": "2", "posologie": "…", "statut": "Non servi",
                    "servicePar": "", "dateService": "", "prixUnitaire": "", "partAssurance": "", "partPatient": "" } ],
  "examens": [], "examNature": "", "examSituation": "", "examCodePraticien": "", "examEtablissement": "", "examCodeEtablissement": "",
  "examDate": "", "examMotif": "", "examPubSignature": "", "examSpecialisteSignature": "",
  "signature": "", "totalMontant": "0", "totalTm": "0", "totalPart": "0",
  "linkedExamenIds": [], "linkedConsultationId": null
}
```

| Route | Qui | Comportement |
|---|---|---|
| `GET /api/feuilles` | tous les rôles concernés | Renvoie **ce que le rôle a le droit de voir** (agent : celles de sa structure ; médecin : les siennes ; pharmacien : voir ci-dessous ; admin / DG / caisse : toutes). Filtres : `nag`, `statut` (`En attente` / `Validée`), `type`, `avec_ordonnance=1` (consultations validées portant au moins un médicament), `servi_par_moi=1` (au moins une ligne servie par la structure du pharmacien connecté), `depuis`, `jusqua`. Tri : plus récentes d'abord. Prévoir la pagination (`page`, `taille`) dès que les volumes le demandent. |
| `POST /api/feuilles` | agent d'accueil (`prestation.creer`) | Crée la feuille. **409 si l'assuré est suspendu.** Le serveur attribue `serverId`, `numero`, `date`, `id_agent`, et renvoie la feuille complète (201). |
| `PUT /api/feuilles/{serverId}` | selon le champ (voir §6) | Enregistre le contenu : brouillon du médecin, **validation** (`statut` → `Validée`), **délivrance** (lignes `ordonnance[i]`). Renvoie la feuille à jour. |
| `DELETE /api/feuilles/{serverId}` | administrateur | Suppression depuis l'historique. |
| `GET /api/feuilles/compteurs` | tous | `{ "en_attente_medecin": 3, "ordonnances_a_servir": 2 }` (barre latérale, léger). |

Le pharmacien voit : les consultations **validées** avec ordonnance (recherche par `nag`) et celles qu'il a servies.

### 5.2 Validation et délivrance (effets côté serveur)

- **Validation** (`statut` passe à `Validée`) : refuser si l'assuré est suspendu, si le rôle n'a pas le droit, si la
  feuille est déjà validée ; créer la `Prestation` (+ `Prise_en_charge` avec `montant_pec` calculé par la grille de
  couverture) et l'`Ordonnance` + lignes de prescription **en une transaction**. Une consultation sans médicament ne crée
  pas d'ordonnance et n'est jamais visible par la pharmacie.
- **Délivrance, totale ou partielle** (le pharmacien envoie `ordonnance[i].aServir = { quantite, prixUnitaire }` ; les lignes
  sont lues par rang, `apiServirLignes()` construit le corps) : le serveur vérifie `1 ≤ quantité ≤ reste à servir` (toutes
  pharmacies confondues), **recalcule** `total = prixUnitaire × quantité servie`, `partAssurance` (taux du ticket modérateur :
  Plein 80 %, Plein (ALD) et Exonéré 100 % — table `TM_RATE` du front, à confirmer par le métier), `partPatient = total −
  partAssurance`, enregistre **une livraison** (table `Ordonnance_delivrance` : quantité, prix unitaire, montant total, parts,
  pharmacie, pharmacien, date), refuse un prix ≤ 0, une ligne déjà entièrement servie, un assuré suspendu. Il ne doit **pas**
  utiliser le prix du stock. **La réponse est la feuille relue dans la base** : pour chaque ligne `quantite` (prescrite),
  `quantiteServie`, `statut` (`Non servi` / `Partiel` / `Servi`) et `livraisons[]` (`quantite`, `prixUnitaire`, `montantTotal`,
  `partAssurance`, `partPatient`, `servicePar`, `idPharmacie`, `pharmacien`, `idPharmacien`, `dateService`, `heureService`) ;
  l'écran (dont l'historique des délivrances) n'affiche que ces valeurs. L'ancien protocole (`statut: "Servi"` + `prixUnitaire`)
  sert tout le reste de la ligne. Détail : `backend/docs/05-integration-front.md` §13.

### 5.3 Annuaires

- `GET /api/medecins` → `[ { "id_utilisateur": 3, "nom": "Rosine AKUE", "code_praticien": "MED-00456", "type_praticien": "Spécialiste", "id_structure": 1, "structure_nom": "Polyclinique El Rapha" } ]` — utilisateurs `medecin` actifs, lisible par tout compte connecté ayant `patient.lire`.
- `GET /api/catalogue/medicaments` → `[ { "designation": "Paracétamol 500mg (boîte de 16)", "prix_reference": 800 } ]` — lisible avec `ordonnance.lire`.
- `GET /api/auth/me` → `{ "user": { …comme au login… }, "permissions": ["patient.lire", "prestation.creer", …] }`.

### 5.4 Règlements

- `GET /api/reglements` → `[ { "id_reglement": 1, "kind": "hopital" | "pharmacie", "structure": "Polyclinique El Rapha", "montant": 100000, "type": "reglement" | "avance", "note": "", "date": "2026-09-19" } ]`
- `POST /api/reglements` `{ kind, structure, montant, type, note }` → 201 avec l'enregistrement. Réservé à administrateur / directeur / caissier. `reglement` ≤ reste à payer ; `avance` peut le dépasser (l'excédent se déduit des prestations suivantes).

### 5.5 Notifications

- `GET /api/notifications` → mes messages : `{ id_notification, expediteur_nom, expediteur_role, titre, message, priorite ("info"|"importante"|"urgente"), categorie ("message"|"securite"|"systeme"), date_envoi, expire_le, accuse_requis, lu, accuse }`.
- `PUT /api/notifications/{id}/lu`, `PUT /api/notifications/{id}/accuse` (l'accusé marque aussi lu).
- `POST /api/notifications` (administrateur) `{ cible_type: "all"|"role"|"etablissement"|"user", cible_valeur, titre, message, priorite, categorie, accuse_requis }` → `{ id_notification, destinataires }` (le serveur résout les comptes **actifs** visés, hors l'expéditeur).
- `GET /api/notifications/envoyees?page&taille` → `{ items: [ { id_notification, expediteur_nom, cible_type, cible_libelle, titre, message, priorite, categorie, date_envoi, accuse_requis, destinataires, lus, accuses } ], total }`.
- Tables : `Notification` + `NotificationDestinataire(id_notification, id_utilisateur, lu_le, accuse_le)`.
- Le serveur crée lui-même les notifications de catégorie `securite` (alerte du §5.6) à destination des administrateurs.

### 5.6 Journalisation et audit

Le **serveur** trace tout ce qui passe par l'API (connexion réussie **et échec**, avec l'adresse IP ; création / modification /
suppression ; refus 403 / 409), calcule le score de risque, chaîne les empreintes et notifie l'administrateur. L'interface
n'envoie que ses propres actions (page ouverte, recherche, export…).

- `POST /api/journal/evenements` `{ "evenements": [ { horodatage, sessionId, correlationId, categorie, action, libelle, resultat, message, ressource: { type, id, libelle, nag (masqué) }, avant, apres, contexte: { vue, ecran, appareil, … } } ] }` → 201.
- `GET /api/journal/evenements?page&taille&recherche&categorie&resultat&severite&du&au` → `{ items, total }` ; un élément : `{ id, seq, horodatage, acteur: { nom, login, role, etab }, categorie, action, libelle, resultat, message, ressource, avant, apres, contexte: { …, ip }, severite ("INFO"|"ATTENTION"|"ALERTE"|"CRITIQUE"), score (0–100), regles: [ { code, label, points } ], statutRevue, revuePar, revueLe, revueNote, hash, hashPrec }`.
- `GET /api/journal/connexions?page&taille&recherche&role&resultat&du&au` → `{ items: [ { id, nom, username, role, date_heure, resultat: "succes"|"echec" } ], total, resume: { connexions_aujourdhui, utilisateurs_uniques_30j, echecs_30j, derniere_connexion } }`.
- `GET /api/journal/resume` → `{ evenements_aujourdhui, utilisateurs_actifs_24h, alertes_a_examiner }`.
- `GET /api/journal/alertes?statut&page&taille` → `{ items (même forme que les événements, score ≥ 25), total, a_examiner }` ; `PUT /api/journal/alertes/{id}/revue` `{ statut: "Vu"|"Faux positif"|"Confirmé", note }`.
- `GET /api/journal/integrite` → `{ ok, verifies, rupture: { seq, why } }`.
- Table en **ajout seul** (aucun UPDATE / DELETE), empreinte SHA-256 ou HMAC de l'événement précédent, conservation à fixer.
- Règles à rejouer côté serveur (seuils indicatifs) : échecs de connexion répétés (≥ 3 en 10 min : 50 pts ; ≥ 5 : 80), sur plusieurs comptes, réussite après échecs ; connexion hors horaires (avant 6 h, après 21 h), week-end, compte dormant (> 60 j) ou désactivé, nouvel appareil ; ≥ 10 assurés consultés en 10 min, recherches d'ordonnance sans résultat ; prix unitaire > 3 × le tarif de référence (ou < 1/5) ; même utilisateur qui valide la feuille et sert l'ordonnance ; paiement ≥ 5 000 000 FCFA ; création / suppression / désactivation de compte, changement de rôle ou de permissions, réinitialisation de mot de passe ; exports en rafale ; plus de 60 actions par minute. Score ≥ 25 : alerte à examiner ; ≥ 50 : notification de sécurité ; ≥ 80 : urgente, verrouillage temporaire du compte possible.

## 6. Règles appliquées par le serveur (le front ne suffit pas)

Toutes sont **en place** (voir `backend/docs/05-integration-front.md` §8) : refus 409 d'un assuré suspendu (création, validation, délivrance),
numérotation des feuilles, droits par champ et par rôle, montants recalculés, séparation des tâches, journal tracé par le serveur.

## 7. Ce qui reste à décider ou à faire

1. **Secrets et exploitation** : changer le mot de passe SQL et la clé JWT (variables d'environnement), remplacer `admin` / `admin`, HTTPS, sauvegardes.
2. **Métier** : confirmer le taux de prise en charge par fonds et type (80 % par défaut dans `TauxCouverture`), le ticket modérateur (80 % / 100 %), les tarifs fixes (`Tarif` vide).
3. **Volumes** : agrégats de rapports côté serveur et pagination des feuilles quand les volumes l'exigeront (le front calcule aujourd'hui les totaux à partir des feuilles reçues, plafonnées à 1 000).
4. **Assurés** : l'interface ne crée pas d'assuré (règle du projet : ils viennent de la base). `POST /api/patients` existe pour l'import ; `backend/MPD/donnees_demo.sql` fournit 3 assurés de démonstration.

## 8. Déploiement du front

Deux possibilités :

* **Même origine** (recommandé) : un reverse proxy sert `index.html`, `style.css`, `api.js`, `app.js` et les images, et relaie `/api` et `/media` vers le serveur Java.
* **Origines différentes** : définir avant `api.js` `<script>window.PEC_API_BASE_URL = "https://api.exemple.ga";</script>` ; le back-end répond désormais aux
  requêtes `OPTIONS` avec les en-têtes CORS (variable `PEC_CORS_ORIGINS` pour restreindre les origines).

Prévoir HTTPS : le jeton circule dans chaque requête. Le serveur Java écoute sur `PEC_PORT` (8080 par défaut).

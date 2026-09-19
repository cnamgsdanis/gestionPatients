# Intégration front ↔ back-end — analyse et travail restant

Document établi le 19/09/2026 après lecture complète de `backend/` (contrôleurs, DAO, modèles, services,
`MPD/gestionpatient.sql`, docs). **Le back-end n'a pas été modifié** : ce document dit ce qu'il faut y faire.

## 1. Résumé

| | |
|---|---|
| **Front** | Il n'y a plus aucun stockage local de données : ni `localStorage`, ni jeu de démonstration, ni compte local, ni repli. Tout est lu et écrit dans la base par l'API. Reste seulement, dans `sessionStorage` (propre à l'onglet, effacé à sa fermeture) : le jeton JWT, la session (utilisateur, page) et de petites préférences d'affichage (barre latérale). |
| **Déjà branché sur des routes qui existent** | connexion / déconnexion / mot de passe, utilisateurs, structures, permissions (matrice), recherche d'un assuré par NAG, dossier patient (consultations et examens enregistrés). |
| **Branché sur des routes à créer** | feuilles de soins (accueil → médecin → pharmacie), annuaire des médecins, catalogue des médicaments, règlements des hôpitaux et pharmacies, notifications de l'administrateur, journalisation / audit, `GET /api/auth/me`. Tant qu'une route répond 404 / 405, l'écran concerné le dit (« fonction non disponible côté serveur ») au lieu de faire semblant. |
| **Pourquoi des routes à créer** | Le modèle du back-end (Prestation + Prise_en_charge + Ordonnance + Prescription liées au stock d'une pharmacie) ne peut pas porter ce que l'interface fait aujourd'hui : ticket modérateur, médecin désigné à l'accueil, feuille de soins complète, ordonnance en texte libre, **prix unitaire saisi par le pharmacien**, règlements, messages. Voir §3 et §5. |

Le front a été validé de bout en bout contre un faux serveur qui applique **exactement** le contrat du §5
(54 vérifications : connexion, accueil, assuré suspendu, médecin, pharmacie, actualisation de la page,
messages, journal, utilisateurs, permissions, règlements, session expirée, serveur arrêté).

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

## 3. Carte fonctionnalité → route

✅ existe · ⚠️ existe mais à corriger · ❌ à créer

| Fonctionnalité | Route | État |
|---|---|---|
| Connexion, déconnexion, changement de mot de passe | `POST /api/auth/login`, `POST /api/auth/logout`, `PUT /api/auth/change-password` | ✅ |
| Réinitialiser un mot de passe (admin), créer un compte | `POST /api/auth/reset-password`, `POST /api/auth/register` | ✅ |
| Utilisateurs | `GET/PUT/DELETE /api/utilisateurs[/{id}]`, `PATCH /api/utilisateurs/{id}/actif` | ✅ |
| Structures (choix du rattachement, hôpitaux / pharmacies partenaires) | `GET /api/structures` | ✅ |
| Permissions (matrice, attribuer, retirer) | `GET /api/permissions[/matrix]`, `POST/DELETE /api/permissions/role/{role}/{code}` | ✅ |
| Permissions du compte connecté (menu) | `GET /api/auth/me` | ❌ (un non-admin n'a pas `permission.lire`, il ne peut pas lire son propre rôle) |
| Recherche d'un assuré | `GET /api/patients/nag/{nag}` | ✅ — mais `nature_assure` et `statut` (actif / suspendu) manquent (§4.1) |
| Dossier patient : consultations, examens enregistrés | `GET /api/consultations?id_patient=`, `GET /api/examens?id_patient=` | ✅ |
| Annuaire des médecins (choix à l'accueil, file « Mes patients ») | `GET /api/medecins` | ❌ (un agent n'a pas `utilisateur.lire`) |
| Catalogue des médicaments (liste du médecin, tarif de référence) | `GET /api/catalogue/medicaments` | ❌ (`/api/medicaments` est le stock d'**une pharmacie**, avec `structure.lire`) |
| Feuilles de soins : créer, lire, enregistrer, valider, supprimer, compteurs | `GET/POST /api/feuilles`, `GET/PUT/DELETE /api/feuilles/{id}`, `GET /api/feuilles/compteurs` | ❌ |
| Délivrance à la pharmacie (prix saisi, parts) | inclus dans `PUT /api/feuilles/{id}` (voir §5.2) | ❌ |
| Règlements des hôpitaux et pharmacies (paiement, avance) | `GET/POST /api/reglements` | ❌ |
| Notifications de l'administrateur | `GET/POST /api/notifications`, `PUT …/{id}/lu`, `PUT …/{id}/accuse`, `GET /api/notifications/envoyees` | ❌ |
| Journalisation : connexions, activité, alertes, intégrité | `GET/POST /api/journal/…` | ❌ (plan dans `backend/docs/02-journalisation.md`) |

## 4. Anomalies trouvées dans le back-end (à corriger)

1. **Patient : `nature_assure` et `statut` absents.** Le front lit `nature_assure` (1 principal, 2 ayant droit, 3 conjoint)
   et `statut` (`actif` / `suspendu`). À défaut, il lit le BIT `statut_assure` (vrai = actif). Or dans le back-end
   `statut_assure` veut dire « est assuré » (il déclenche la création automatique de la PEC). Décider : réutiliser le BIT
   ou ajouter une vraie colonne `statut`. **Un assuré suspendu ne peut recevoir aucune prestation** : le serveur doit le
   refuser (409) à la création et à la validation d'une feuille et à la délivrance ; le front le refuse aussi.
   `fonds` est `DECIMAL` dans la base déployée (montants) et `TINYINT 1..4` dans le script : à trancher.
2. **`PharmacieController.rechercher`** : `nag.equals(p.matricule_nag)` compare un `String` à un `Integer` → jamais vrai →
   toujours 404. Il ne renvoie que la première ordonnance en attente (un assuré peut en avoir plusieurs le même jour) et
   recharge toutes les ordonnances du patient dans une boucle. À remplacer par `GET /api/patients/nag/{nag}` puis la liste.
3. **`CouvertureService.reload()`** lit `TauxCouverture.taux_pourcent` ; le script définit `pourcentage_pec` (et un taux
   par fonds **et** par type de prestation). La requête échoue, la grille reste vide : tous les `montant_pec` valent 0.
4. **`TarifService.reload()`** lit `Tarif.montant` ; le script définit `montant_tarif`, `libelle`, `code_acte`, `id_structure`.
   Aucun contrôleur n'expose les tarifs.
5. **`OrdonnanceController.delivrer`** calcule le prix avec `Medicaments.prix` (stock de la pharmacie) et décrémente le
   stock. L'interface demande au **pharmacien de saisir le prix unitaire** : la délivrance doit accepter un
   `prix_unitaire` par ligne (§5.2). `changerStatut` refuse `partiellement_delivree` que le script autorise.
6. **`ConsultationController.POST`** prend le médecin dans le jeton : un agent d'accueil ne peut pas désigner le médecin
   qui examinera (or l'accueil le fait). `POST /api/prestations` accepte `id_utilisateur` mais crée une PEC sans
   `numero_de_feuille` / `type_feuille`, et rien ne garde le ticket modérateur, le service, le quartier, le téléphone.
7. **`Prescription`** référence `Medicaments` (stock d'une pharmacie précise) : un médecin d'hôpital ne peut donc pas
   prescrire librement. Il faut une désignation libre (ou un catalogue national) sur la ligne de prescription.
8. **CORS absent** (aucun `Access-Control-*`, pas de `OPTIONS`) : le front doit être servi **sous la même origine** que
   l'API (reverse proxy `/api` → `:8080`) ou le back-end doit gérer CORS. Les photos (`Patient.photo_url`,
   `\backend\media\…`) ne sont pas servies par le serveur Java : à exposer sous `/media/…`.
9. **Jeton de 1 h sans renouvellement** ; `POST /api/auth/logout` n'invalide rien. Le front renvoie à la connexion sur 401.
   Prévoir un refresh ou une durée adaptée (journée de travail).
10. **Utilisateur.nom = nom complet.** Le front sépare le prénom au premier espace (« Dr House » → prénom « Dr »). Prévoir
    un champ `prenom` séparé. **`code_praticien`** et **`type_praticien`** (généraliste / spécialiste) manquent : ils
    apparaissent sur la feuille de soins.
11. **Rôle sans droit de lecture des feuilles** : `seed-database.sql` ne contient que 17 permissions ; le code en utilise
    davantage (`pec.lire`, `pec.valider`, `prestation.modifier`, `examen.*`, `ordonnance.modifier|annuler|signer`, …).
    Vérifier la matrice réelle et ajouter les nouvelles (`feuille.*`, `reglement.*`, `notification.envoyer`, `journal.lire`).

## 5. Contrat des routes à créer

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
- **Délivrance** (le pharmacien met à jour `ordonnance[i]` : `statut: "Servi"`, `prixUnitaire`, `dateService`) : le serveur
  **recalcule** `total = prixUnitaire × quantité`, `partAssurance` (taux du ticket modérateur : Plein 80 %, Plein (ALD) et
  Exonéré 100 % — table `TM_RATE` du front, à confirmer par le métier), `partPatient = total − partAssurance`, renseigne
  `servicePar` (nom de la structure du jeton), refuse un prix ≤ 0, une ligne déjà servie, un assuré suspendu, et crée la
  prestation « pharmacie ». Il ne doit **pas** utiliser le prix du stock.

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

## 6. Règles à faire respecter par le serveur (le front ne suffit pas)

- **Droits par champ** : l'agent crée mais ne remplit pas la partie médicale ; le médecin remplit sa partie et valide ; le
  pharmacien ne modifie que la délivrance (`servicePar`, `dateService`, `prixUnitaire`, `partAssurance`, `partPatient`,
  `statut` des lignes) d'une feuille **validée** ; une feuille validée n'est plus modifiable par le médecin.
- **Assuré suspendu** : aucune création, validation ni délivrance (409, message clair).
- **Numérotation** des feuilles par le serveur (jamais par le navigateur) ; identifiant client unique (409 sinon, le front en régénère un).
- **Séparation des tâches** : la même personne ne doit pas valider la feuille et servir l'ordonnance (alerte du §5.6).
- **Cohérence** : le montant d'une PEC et les parts sont toujours recalculés côté serveur.

## 7. Ordre de mise en œuvre conseillé

1. Corriger les anomalies bloquantes : `CouvertureService` / `TarifService` (§4.3–4.4), CORS ou reverse proxy (§4.8), `nature_assure` / `statut` (§4.1), `GET /api/auth/me`.
2. `GET /api/medecins`, `GET /api/catalogue/medicaments`, colonnes `code_praticien` / `type_praticien` / `prenom`.
3. Module **feuilles** (§5.1–5.2) : c'est lui qui débloque accueil, médecin, pharmacie, historique, rapports, tableau de bord.
4. **Règlements** (§5.4) : débloque les paiements des Rapports.
5. **Journalisation** (§5.6), puis **notifications** (§5.5).
6. Rapports agrégés côté serveur et pagination des feuilles quand les volumes l'exigent (le front calcule aujourd'hui les totaux à partir des feuilles reçues).

## 8. Déploiement du front

Servir `index.html`, `style.css`, `api.js`, `app.js` et les images comme fichiers statiques **sous la même origine que
l'API**, ou définir avant `api.js` : `<script>window.PEC_API_BASE_URL = "https://api.exemple.ga";</script>` (dans ce cas le
back-end doit répondre aux requêtes `OPTIONS` avec les en-têtes CORS). Prévoir HTTPS : le jeton circule dans chaque requête.

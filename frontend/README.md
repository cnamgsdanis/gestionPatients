# PEC — Guide de design & de contribution (À LIRE AVANT TOUT AJOUT)

Ce document fixe les règles **strictes** à respecter pour toute nouvelle interface,
page ou fonctionnalité ajoutée à cette application. Le but : que toutes les
interfaces (agent, médecin, admin, et celles à venir) aient l'air d'avoir été
construites par la même équipe, avec le même langage visuel.

**Avant d'ajouter quoi que ce soit : lis ce fichier en entier.** Si une règle ici
bloque un besoin réel, on en discute avant de la contourner — on ne dévie pas en
silence.

---

## 1. Stack et contraintes non négociables

- **Front-end pur, branché sur l'API (application en production).** Toutes les
  données vivent dans la **base de données** et passent par `api.js`.
  **Aucun `localStorage`, aucune donnée de démonstration, aucun repli local** :
  si le serveur ne répond pas, l'écran le dit, il n'invente rien. Seuls
  restent dans `sessionStorage` (propre à l'onglet, effacé à sa fermeture) le
  jeton de session et de petites préférences d'affichage (voir §8 et §13).
  N'ajoutez jamais de `fetch()` en dehors de `api.js`.
- **Aucun framework, aucun bundler, aucune dépendance externe.** Pas de React,
  Vue, Tailwind, jQuery, ni de CDN. Tout est écrit à la main en HTML/CSS/JS
  natifs (`index.html`, `style.css`, `api.js`, `app.js`).
- **4 fichiers, à plat, à la racine.** N'introduisez pas de dossier `src/`,
  de build step, ni de découpage en modules ES. Si le fichier grossit trop,
  on en reparle — on ne fragmente pas silencieusement l'architecture.
- **Français partout** dans l'interface (labels, boutons, messages). Pas
  d'anglais dans le texte visible par l'utilisateur.
- **Toujours tester dans un vrai navigateur** avant de livrer (voir §10).
  Un changement qui casse `app.js` casse **toute** l'application (script
  unique, chargé une fois).

---

## 2. Architecture des fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Toute la structure DOM : écran de connexion + coquille applicative (`#appShell`) avec une section `<section class="view" id="view-XXX">` par page. Une seule page est visible à la fois (SPA maison, pas de routeur). |
| `style.css` | Tous les styles, organisés en blocs commentés par zone (`/* LOGIN */`, `/* APP SHELL */`, `/* FEUILLE DE SOINS */`, etc.). |
| `app.js` | Toute la logique : état applicatif, navigation entre vues, rendu des listes/tableaux, gestion des formulaires. |
| `api.js` | Seul point d'accès au serveur : session (jeton JWT), `apiFetch`, une fonction par route (`apiListFeuilles`, `apiCreateUser`…), conversion des données du serveur vers celles de l'écran, aides NAG. **Aucune donnée en dur.** Contrat des routes : `INTEGRATION-BACKEND.md`. |

**Pas de nouveaux fichiers `.js`/`.css`** sans concertation — un seul `app.js`
et un seul `style.css` pour l'instant. Si vous ajoutez une interface, ajoutez
sa section dans ces mêmes fichiers, au bon endroit (voir §8).

---

## 3. Jetons de design (design tokens) — à utiliser, jamais à réinventer

Toutes les couleurs sont définies en variables CSS dans `:root` (`style.css`,
tout en haut). **N'écrivez jamais un code couleur en dur** (`#4d9e63`,
`rgb(...)`) dans une nouvelle règle si une variable existe déjà pour ça.

```css
--green-dark: #2f7d45;   /* accents forts, texte sur fond clair, état "validé/actif" */
--green:      #4d9e63;   /* couleur de marque principale (boutons primaires, liens actifs) */
--green-light:#abdfb7;   /* fonds des sections "verrouillées" de la feuille de soins */
--green-bg:   #eef3ee;   /* fond général de l'application (body, content) */
--blue:       #14479c;   /* accent secondaire (liens, badge "Examen") */
--red:        #cc0000;   /* danger, suppression, statut "Inactif" / "Suspendu" */
--teal:       #1f8a8a;   /* avance versée (paiements) */
--amber-dark: #8a5a06;   /* reste à payer / en attente (texte) */
--amber-bg:   #fbf0da;   /* reste à payer / en attente (fond) */
--track:      #e4ece6;   /* fond des barres d'avancement */
--ink:        #1a1a1a;   /* texte principal */
--muted:      #5c6b60;   /* texte secondaire / labels */
--border:     #d7e4da;   /* bordures de champs, séparateurs */
--white:      #ffffff;
--sidebar-1:  #0d2116;   /* dégradé bas de la sidebar */
--sidebar-2:  #1c4a30;   /* dégradé haut de la sidebar */
--radius:     10px;      /* rayon standard des cartes */
--shadow:     0 6px 20px rgba(20, 40, 25, .08);  /* ombre standard des cartes */
```

Si une nouvelle couleur est vraiment nécessaire (ex. un nouveau statut), ajoutez
une variable dans `:root` avec un nom clair, ne collez pas une valeur brute
dispersée dans le fichier.

**Typographie :** `"Segoe UI", Arial, Helvetica, sans-serif` (défini une fois
sur `body`). Ne chargez pas de Google Fonts ni de fichier de police.

**Tailles de police en usage** (ne pas en inventer d'autres sans raison) :
`9px`–`11.5px` (méta-infos, légendes), `12px`–`13.5px` (texte de formulaire,
tableaux), `14px`–`17px` (titres de section, `h2`/`h3`), `19px`+ (titres
d'accueil uniquement, écran de connexion).

---

## 4. Structure d'une page applicative (après connexion)

Toute interface *interne* (une fois connecté) suit le même squelette,
déjà en place dans `index.html` :

```
.app-shell
├── .sidebar          → navigation, logo, bouton réduire/étendre, déconnexion
└── .main
    ├── .topbar        → titre de la page + fil d'Ariane + horloge + user-pill
    ├── .content       → LE CONTENU DE LA VUE ACTIVE VIT ICI
    └── .app-footer    → pied de page fixe (copyright + version)
```

Chaque page est une `<section class="view" id="view-XXX" hidden>` **à
l'intérieur de `.content`**. La navigation ne recharge jamais la page :
`goToView(name)` (dans `app.js`) cache toutes les `.view`, affiche celle
demandée, met à jour le titre/fil d'Ariane, et déclenche le rendu de son
contenu dynamique si besoin.

**Ne créez jamais une nouvelle page en dehors de ce squelette.** Pas de
`<div>` flottant en dehors de `.app-shell`, pas de nouvelle balise
`<header>`/`<footer>` par page.

---

## 5. Composants réutilisables — piochez dedans, n'en recréez pas

Avant d'écrire un nouveau bloc de CSS, vérifiez si un composant existant
fait déjà le travail. Liste des classes à réutiliser telles quelles :

- **`.card` / `.card-head` / `.card-body`** — le conteneur de base pour
  tout bloc de contenu (liste, formulaire, tableau).
- **`.stat-card`** (+ `.clickable` si l'encart doit être cliquable) — les
  chiffres-clés en haut du tableau de bord.
- **`.btn-primary`, `.btn-secondary`, `.btn-sm`** — tous les boutons
  d'action. `.btn-primary` = action principale (vert), `.btn-secondary` =
  action secondaire (contour vert, fond blanc).
- **`.data-table`** — tout tableau de données (historique, utilisateurs,
  file d'attente médecin). Colonnes `<th>`, lignes `<tr>`, actions dans une
  dernière colonne `.row-actions` avec des `.icon-btn`.
- **`.pill`** + variante (`.consultation`, `.examen`, `.actif`, `.inactif`,
  `.attente`, `.validee`) — tout badge de statut dans un tableau. N'inventez
  pas une nouvelle pastille de statut sans variante `.pill.xxx` cohérente
  avec la palette (vert = positif/validé, bleu = secondaire/examen, ambre
  `#8a5a06` sur `#fbf0da` = en attente, rouge = négatif/inactif).
- **`.modal-overlay` / `.modal`** (+ `.modal-lg` pour une modale large) —
  toute fenêtre modale. Réutilisez le modèle (`.modal-head` avec `.close-x`,
  `.modal-body`, `.modal-foot`).
- **`.field`** — tout champ de formulaire (`label` + `input`/`select`).
  Regardez comment les variantes sont **scopées** (`.login-card .field`,
  `.search-row .field`, `.modal-body .field`, `.filters-row .field`) : ne
  redéfinissez **jamais** `.field` sans le faire descendre d'un parent
  précis, sinon vous cassez le style ailleurs dans l'app.
- **`.section-head` / `.section-body`** (+ `.locked` sur `.section-body`) —
  le motif des sections de la feuille de soins (bandeau vert + corps).
- **`.icon-btn`** — petit bouton icône dans un tableau (aperçu, suppression,
  activer/désactiver). Icônes en SVG inline uniquement (voir §6).
- **`.chip` / `.chip-row`** — sélecteur à choix unique façon "pilule"
  (utilisé pour le Ticket modérateur). `.chip.active` = sélectionné.
- **Pagination : `pageSlice(clé, liste, taille)` + `renderPager(hôte, clé, info, rerender, unité)`** —
  toute liste susceptible d'être longue. Le pager (« Affichage de 1–8 sur 32 »,
  numéros de page) n'existe pas quand la liste tient sur une page. Ajoutez un
  `<div class="pager-host" id="…">` sous le tableau, appelez `pageSlice` dans le rendu,
  `resetPage(clé)` quand un filtre change. Tailles actuelles : historique PEC et file
  du médecin 8, utilisateurs 10, délivrances 10, journal 12, chronologie du dossier 5,
  dates de prestation 5, rapports 8.
- **`toast({ kind, title, text, sticky, ms, onClick })`** — message éphémère en haut
  à droite (`info`, `success`, `warn`, `urgent`, `security`).
- **Tableaux `.data-table`** — sur téléphone (≤ 640 px) chaque ligne devient une fiche
  « LIBELLÉ … valeur » **automatiquement** (`labelDataTables()` recopie les `<th>` sur
  les cellules). Ajoutez `no-stack` au tableau pour garder un tableau qui défile
  (tableaux de chiffres, grilles de cases à cocher).
- **`animateNumber(el, valeur, ms)`** — compteur qui « roule » jusqu'à sa valeur
  (immédiat si `prefers-reduced-motion`).
- **`.lock-note` / `.lock-note-inline`** — le texte discret qui explique
  *pourquoi* un champ est verrouillé (ex. "Pré-rempli via le médecin
  sélectionné — non modifiable"). Voir §7 pour la convention des champs
  verrouillés.

**Règle d'or :** si vous vous surprenez à copier-coller un bloc de CSS
existant pour l'adapter légèrement, c'est probablement que la classe
générique doit être réutilisée avec une nouvelle variante plutôt que
dupliquée.

---

## 6. Icônes

- **SVG inline uniquement**, à la main, dans le HTML ou généré en JS sous
  forme de chaîne (voir `iconEye()`, `iconTrash()`, `iconToggle()` dans
  `app.js`).
- Style constant : `viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2"`, taille `14`–`20px` selon le contexte (barre latérale
  vs bouton icône dans un tableau).
- **Aucune bibliothèque d'icônes** (Font Awesome, Lucide, etc.) ne doit être
  ajoutée — ça introduirait une dépendance externe interdite par §1.
- **Aucun emoji** dans l'interface.

---

## 7. Le motif du "champ verrouillé" — cœur du design de cette app

Le concept central de l'application est le **circuit de l'assuré** : chaque
étape (agent → médecin) ne peut modifier que ce qui relève de son rôle, et
voit en lecture seule ce qu'une étape précédente a déjà renseigné. Ce motif
**doit** être respecté pour toute nouvelle interface impliquant plusieurs
rôles :

1. Le champ verrouillé reste **visible**, jamais masqué. L'utilisateur doit
   voir la donnée, comprendre qu'elle existe, et comprendre pourquoi il ne
   peut pas la changer.
2. Verrouillage technique : attribut `disabled` sur l'`input`/`select`, pas
   `readonly` seul (sauf pour un champ généré automatiquement comme le
   numéro de feuille).
3. Habillage visuel : fond `.section-body.locked` (vert clair `#dff0e3`) ou
   classe `.on` / `.locked` sur le `<label>` de la valeur sélectionnée
   (texte en gras, `var(--green-dark)`), et un `.lock-note` à côté du titre
   de section expliquant la source de la donnée.
4. Ne réactivez jamais un champ verrouillé par un raccourci CSS global :
   le verrouillage se fait **par JS, champ par champ**, dans la fonction qui
   ouvre la vue (voir `openSoinsForValidation()` dans `app.js` : tout ce que
   l'accueil a renseigné arrive verrouillé, le médecin ne complète que sa
   partie).
5. **La feuille de soins garde son design d'origine** : n'y ajoutez ni
   bandeau, ni pastille d'état, ni note à côté des libellés. L'aide à
   l'orientation se met ailleurs (fil d'Ariane, file du médecin, modales).

Si votre nouvelle interface introduit un nouveau rôle avec sa propre étape,
suivez exactement ce patron plutôt que d'inventer un nouveau système de
verrouillage.

---

## 8. Ajouter une nouvelle interface — checklist obligatoire

1. **Sidebar** (`index.html`) : ajoutez un `<button class="nav-item"
   data-view="mon-id" data-tip="Libellé">` avec une icône SVG (voir §6) et
   un `<span class="nav-txt">Libellé</span>` (le `nav-txt` est ce qui se
   cache quand la sidebar est réduite — ne l'oubliez pas).
2. **Section de vue** (`index.html`, dans `.content`) : `<section
   class="view" id="view-mon-id" hidden>` contenant un ou plusieurs `.card`.
3. **`VIEW_META`** (`app.js`) : ajoutez une entrée `{ title, crumb }` avec la
   clé identique à `data-view`/`id="view-XXX"`.
4. **`goToView()`** (`app.js`) : si la vue a besoin de recalculer son
   contenu à chaque affichage (comme une liste), ajoutez `if (name ===
   "mon-id") renderMaListe();` dans la fonction existante — n'écrivez pas
   un second système de navigation.
5. **Rendu dynamique** : suivez le patron `renderXxx()` déjà utilisé
   (`renderHistorique`, `renderUsers`, `renderMedecinQueue`) : on vide le
   `innerHTML` du conteneur, on reconstruit les lignes, on rebranche les
   écouteurs d'événements sur les nouveaux éléments à chaque rendu.
6. **État** : une donnée métier est **toujours** lue et écrite dans la base.
   Ajoutez la fonction d'accès dans `api.js` (une route = une fonction), la
   copie de travail dans l'objet `state` en tête d'`app.js` (commentaire sur sa
   forme), et chargez-la à l'ouverture de la vue (`goToView` / `refreshViewData`).
   Une action qui compte (créer, valider, servir, payer) **attend la réponse du
   serveur** avant de s'afficher comme faite, et annule son changement si le
   serveur refuse. Ne stockez rien dans `localStorage` ; `uiPref()` (préférence
   d'affichage, `sessionStorage`) est réservé à ce qui n'est pas une donnée
   (barre latérale réduite, onglet ouvert).
7. **Évolution des données** : un nouveau champ doit exister dans la base et dans
   le contrat (`INTEGRATION-BACKEND.md`) ; côté écran, lisez-le avec une valeur
   par défaut (`x.champ || ""`) pour qu'une ancienne ligne reste affichable.
8. **Testez** avant de livrer (voir §10).

---

## 9. Animations — réservées à l'écran de connexion (sauf exceptions demandées)

> **Exceptions assumées (demandées par le porteur du projet, septembre 2026)** :
> la **barre latérale** (aurore, pastille qui glisse, halo au survol, « pouls du
> circuit »), l'**en-tête** (fil lumineux, jauge de défilement, salutation, cloche) et
> l'**Espace Pharmacien** (bandeau animé, étapes, compteurs, confettis de fin
> d'ordonnance) sont volontairement spectaculaires. Elles respectent toutes
> `prefers-reduced-motion` (voir la fin de chaque bloc CSS). Le reste de la règle
> ci-dessous s'applique aux **autres** vues.

L'écran de connexion (`#view-login`) a un traitement visuel volontairement
spectaculaire : hélice ADN, particules, ligne ECG, nappe "aurore". C'est
**la seule zone de l'application où ce niveau d'animation est autorisé.**

Le reste de l'application (tout ce qui est après connexion) doit rester
**sobre et professionnel** :
- Transitions autorisées : le `fadein` léger sur `.view` à la navigation,
  les micro-interactions de survol (`transform: translateY(-1px)`,
  changement d'ombre/bordure) déjà en place sur les boutons et cartes.
- **N'ajoutez pas** de nouvelle animation "spectaculaire" (particules,
  formes flottantes, dégradés animés) dans une vue applicative interne.
  Si une interface a besoin d'attirer l'attention (ex. une nouvelle
  notification), utilisez un badge coloré (`.nav-badge`) ou une pastille
  `.pill`, pas une animation.

---

## 10. Avant de livrer un changement

1. **Aucune balise cassée** : si vous ouvrez une nouvelle `<section>` ou un
   nouveau `<div>` avec une classe de layout (`.card`, `.modal`, etc.),
   vérifiez la fermeture — une balise mal fermée casse silencieusement tout
   ce qui suit dans le DOM.
2. **Zéro erreur console.** Ouvrez l'app dans un navigateur (ou via un
   serveur statique local, ex. `python -m http.server`), ouvrez les outils
   de développement, et vérifiez qu'aucune erreur n'apparaît en naviguant
   dans toutes les vues touchées par votre changement.
3. **Testez le cycle complet concerné**, pas juste l'écran que vous avez
   modifié : par exemple, un changement sur la feuille de soins doit être
   vérifié à la fois côté agent (`openSoins`) et côté médecin
   (`openSoinsForValidation`), puisque les deux partagent le même HTML.
4. **Responsive** : vérifiez au moins un rendu desktop (~1440px) et un
   rendu mobile (~390px) si votre changement touche une zone visible sur
   les deux (voir les media queries déjà en place dans `style.css` comme
   modèle : `@media (max-width: 1024px)`, `@media (max-width: 780px)`).
5. Ne modifiez jamais le fichier `fond.png` ni `CNAMGS.png` (logos/images
   de marque fournis) — référencez-les, ne les recadrez pas, ne les
   remplacez pas.

---

## 11. Conventions de nommage

- **Classes CSS** : kebab-case (`stat-card`, `nav-badge`, `soins-wrap`).
- **Id HTML** utilisés par JS : camelCase (`loginEmail`, `matriculeInput`,
  `medecinNavBadge`).
- **Fonctions JS** : camelCase, verbe d'action explicite
  (`renderHistorique`, `openSoinsForValidation`, `updateActionButtons`).
- **Clés `sessionStorage`** (session et préférences d'affichage uniquement) :
  `pec_snake_case` (`pec_session`, `pec_api_session`, `pec_ui_*`).
- **Statuts métier** (chaînes stockées telles quelles, en français, avec
  majuscule) : `"En attente"`, `"Validée"`, `"Actif"`, `"Inactif"`,
  `"Consultation"`, `"Examen"`. Ne traduisez pas, ne changez pas la casse
  d'un statut existant — d'autres parties du code comparent ces chaînes
  littéralement.

---

## 12. En résumé

Avant de merger une nouvelle interface, demandez-vous :

- [ ] Ai-je réutilisé les classes existantes (`.card`, `.btn-primary`,
      `.data-table`, `.pill`, `.modal`, `.field`) plutôt que d'en recréer ?
- [ ] Ai-je utilisé les variables de couleur (`var(--green)`, etc.) plutôt
      que des couleurs en dur ?
- [ ] Ma vue suit-elle le squelette `.view` + `goToView()` + `VIEW_META` ?
- [ ] Les champs qui ne relèvent pas du rôle de l'utilisateur actuel
      sont-ils verrouillés selon le motif du §7 (visibles, `disabled`,
      fond `locked`, `.lock-note`) plutôt que masqués ou laissés éditables ?
- [ ] Ai-je évité toute nouvelle dépendance, tout nouveau fichier, toute
      animation spectaculaire hors écran de connexion ?
- [ ] Ai-je testé sans erreur console, en desktop et en mobile ?

Si vous répondez non à l'une de ces questions, corrigez avant de livrer.


---

## 13. Mise en route, données et règles métier (production)

**Tout vient de la base.** Il n'y a plus ni jeu de démonstration, ni comptes locaux, ni
mode hors ligne. Les comptes, assurés, médecins, structures, feuilles, règlements,
messages et journaux sont ceux du serveur. **Ne touchez pas au dossier `backend/` ni à
`tools/` depuis le front** : ce qui manque côté serveur est listé dans
[`INTEGRATION-BACKEND.md`](INTEGRATION-BACKEND.md) (routes à créer, corrections, contrat JSON).

**Servir le front.** Fichiers statiques (`index.html`, `style.css`, `api.js`, `app.js`, images)
**sous la même origine que l'API** (reverse proxy : `/api` → serveur Java). Sinon, avant
`api.js` : `<script>window.PEC_API_BASE_URL = "https://api.exemple.ga";</script>` (le serveur
doit alors gérer CORS). Sans réglage : `http://localhost:8090` sur un poste de développement
(le proxy `tools/dev-proxy.js`), la même origine ailleurs.

**Tester sans risque.** Un test crée de **vraies données** (prises en charge, ordonnances,
paiements, journal). Pointez le front sur une **base de recette** — pas sur la production.

**Ce que le navigateur retient.** Uniquement dans `sessionStorage` (par onglet, effacé à la
fermeture de l'onglet) : le jeton de session (`pec_api_session`), l'identité et la page en
cours pour survivre à un rechargement (`pec_session`, 12 h) et quelques préférences d'affichage
(`pec_ui_*`). Jeton expiré ou refusé (401) : retour à la connexion, avec « votre session a
expiré ». Serveur arrêté : « Serveur injoignable » et rien n'est enregistré ni affiché comme fait.

**Types de données** — ils suivent `backend/MPD/gestionpatient.sql` : le NAG est
un INT de 10 chiffres compris entre 1 000 000 000 et 2 147 483 647 (`2345678901`
est donc invalide), affiché en 3-3-3-1 (`134 567 890 1`) ; l'assuré (« patient » = assuré) a une
**nature** (1 assuré principal, 2 ayant droit, 3 conjoint) et un **statut** (actif ou
suspendu) — deux champs **à ajouter côté base** ; le statut d'un examen versé au dossier
est `en_attente`, `en_cours`, `termine` ou `annule`, celui d'une consultation
`en_attente`, `validee` ou `rejetee`.

**Assuré suspendu = aucune prestation.** Son statut est relu dans la base à chaque étape
(`checkNagSuspended()`). À l'accueil : cachet « SUSPENDU » sur la fiche, formulaire de prise
en charge grisé et inactif, message rouge à côté du bouton d'enregistrement. Le médecin ne
peut ni examiner ni valider sa feuille ; la pharmacie ne peut rien lui servir (fenêtre
rouge, refus tracé dans la Journalisation) ; son dossier reste consultable avec une alerte
rouge. **Le serveur doit aussi refuser (409)** — le front seul ne suffit pas.

**Le circuit, de bout en bout :**

1. **Accueil** (agent d'accueil) : Nouvelle prise en charge → NAG (le statut de l'assuré
   s'affiche) → ticket modérateur, médecin désigné → Enregistrer. C'est **ici** que démarre
   toute nouvelle consultation : le dossier patient n'en démarre jamais. La feuille est créée
   dans la base ; **le serveur attribue le numéro**.
2. **Médecin** : « Patients en attente » (une ligne par patient, avec ses feuilles ; par
   défaut « Mes patients ») → Examiner. La feuille arrive avec tout ce que l'accueil a
   renseigné, verrouillé ; le médecin ne remplit que sa partie (prestation, ordonnance,
   signature). Besoin d'un examen ? Le bouton bleu **Ajouter la feuille d'examen** bascule
   (flip) sur la feuille d'examen, d'où l'on revient à la feuille consultation. **Valider et
   enregistrer** valide les deux d'un coup. Sans médicament prescrit, la modale demande
   « Valider sans médicaments ? » : la consultation est validée et versée au dossier, mais
   **jamais envoyée à la pharmacie** (règle `isSentToPharmacy()`). Le bouton **Historique des
   visites**, dans le header de la feuille (jamais sur la feuille elle-même), ouvre le
   dossier du patient ; « Retour à la feuille de soins » ramène à la feuille.
3. **Dossier patient** : chronologie des visites — consultation, ordonnance (« Voir ») et
   feuille d'examen liée à sa consultation. L'Espace Médecin, lui, ne montre que les
   « Patients en attente » (pas de liste de dossiers).
4. **Pharmacie** : NAG (la recherche part au 10e chiffre) → les dates de prestation du patient
   (5 par page) → **une seule** ordonnance précise, une carte par médicament. **Le prix
   unitaire se saisit à la main** : tant qu'il est vide, les montants sont grisés (« — ») et
   « Servir » / « Tout servir » sont désactivés ; dès qu'il est saisi, le **prix total**
   (prix × quantité), la **part assurance** (taux du ticket modérateur : 80 % en plein tarif,
   100 % pour « Plein (ALD) » et « Exonéré » — table `TM_RATE`, à confirmer par le métier) et
   la **part patient** s'affichent ; le serveur les recalcule. « Tarif de référence »
   (catalogue) peut pré-remplir le prix. Une délivrance n'est confirmée qu'une fois enregistrée.
   L'onglet **Historique des délivrances** retrouve tout ce que la pharmacie a servi.
5. **Rapports** (administrateur, DG, caisse) : le **détail par hôpital** (ou par pharmacie)
   d'abord, puis un résumé écrit — pas de graphiques. **Enregistrer un paiement** : type
   *Règlement* (plafonné au reste à payer) ou *Avance* (peut dépasser ; l'excédent est déduit
   des prochaines prestations).

**Session, salutation, navigation, notifications**

- **Salutation** : « Bonjour, *Prénom* » (« Bonsoir » de 18 h à 5 h) sur l'écran de
  transition qui suit la connexion, dans l'en-tête (soleil / lune) et dans un toast qui
  rappelle la dernière connexion.
- **Actualisation** : chaque écran recharge ses données à l'ouverture, et toutes les 20 s
  pour les compteurs, nouvelles feuilles et messages. Une feuille en cours de saisie n'est
  jamais écrasée. Un écran de démarrage s'affiche pendant le chargement après un rechargement.
- **Barre latérale** : pastille qui glisse sur la page active, halo qui suit le curseur,
  compteurs (patients en attente, ordonnances à servir — fournis par le serveur), « pouls du
  circuit » cliquable, infobulles quand le menu est réduit. Sur tablette et téléphone
  (≤ 980 px) c'est un **tiroir** : bouton ☰ dans l'en-tête, voile, balayage depuis le bord
  gauche, Échap. **Ctrl + K** (ou la loupe de l'en-tête) ouvre la palette « Aller à… ».
  Sur téléphone les tableaux deviennent des cartes empilées.
- **Notifications** : la cloche de l'en-tête affiche les messages de l'administrateur et les
  alertes de sécurité (badge rouge, toast à l'arrivée, message « urgent » collant, accusé de
  lecture « J'ai pris connaissance »). L'**administrateur** écrit depuis la cloche ou
  *Journalisation › Messages* (destinataires : tous / un rôle / un établissement / un
  utilisateur ; priorité ; accusé demandé) et voit qui a lu. Tout est lu et écrit via
  `/api/notifications` ; le serveur résout les destinataires.
- **Journalisation** (administrateur, DG) : onglets **Connexions**, **Activité** (chaque
  action tracée, détail complet au clic, export CSV, vérification d'intégrité), **Alertes**
  (activités inhabituelles à examiner : Vu / Faux positif / Confirmé) et **Messages**. Voir §14.
- **Permissions** : la page affiche la matrice du serveur (`/api/permissions`) ; le menu de
  chaque utilisateur suit ses droits (`/api/auth/me`).

---

## 14. Journal d'audit et notifications — ce que le back-end devra porter

Le front ne garde plus rien en local : il **signale** ses propres actions (page ouverte,
recherche, export…) à `POST /api/journal/evenements` et lit `/api/journal/*` et
`/api/notifications`. Il n'a ni adresse IP ni horloge de confiance : **c'est le serveur qui
doit écrire le journal** de tout ce qui passe par l'API (connexions réussies **et échecs**,
créations, modifications, suppressions, refus), calculer le score et chaîner les empreintes.
Le contrat des routes est dans [`INTEGRATION-BACKEND.md`](INTEGRATION-BACKEND.md) §5.5–5.6.
Champs d'un événement (fonction `audit()` dans `app.js`) :

| Groupe | Champs |
|---|---|
| Identité | `id_evenement` (UUID), `horodatage` (UTC, ms), `fuseau`, `sequence`, `correlation_id` (regroupe les lignes d'une même action, ex. « valider la visite »), `session_id` |
| Qui | `id_utilisateur`, `login`, `nom_affiche`, `role`, `id_etablissement`, `type_acteur` (utilisateur / administrateur / système / API) |
| Quoi | `categorie`, `action` (code stable : `auth.login.echec`, `patient.rechercher`, `feuille.valider`, `pharma.servir`, `paiement.enregistrer`, `permissions.modifier`…), `resultat` (SUCCES / ECHEC / REFUSE / ANNULE), `code_erreur`, `message` |
| Sur quoi | `ressource_type`, `ressource_id`, `ressource_libelle`, `nag_masque` (`123 *** *** 1`), `id_assure` |
| Avant / après | `avant` (JSON), `apres` (JSON), `champs_modifies[]`, `motif` |
| D'où / comment | `ip`, `pays_ville`, `user_agent`, `empreinte_appareil`, `ecran`, `vue_ui`, `canal`, `duree_ms`, `version_app` |
| Intégrité | `hash_precedent`, `hash` (chaînage **SHA-256 / HMAC**, calculé par le serveur), table en ajout seul (ni UPDATE ni DELETE), archivage, `retention_jusqu_au` |
| Analyse | `severite` (INFO / ATTENTION / ALERTE / CRITIQUE), `score_risque` (0–100), `regles_declenchees[]`, `statut_revue` (Nouveau / Vu / Faux positif / Confirmé), `revu_par`, `date_revue`, `note_revue` |

**Règles de détection** (réglables dans `AUDIT_RULES`, à rejouer côté serveur) :
échecs de connexion répétés / sur plusieurs comptes / suivis d'une réussite ;
connexion hors horaires, le week-end, compte dormant ou désactivé, nouvel appareil ;
consultation massive d'assurés, recherches d'ordonnance sans résultat ; prix unitaire
très éloigné du tarif de référence, même personne qui valide la feuille **et** sert
l'ordonnance ; paiement élevé ; création / suppression / désactivation de comptes,
changement de rôle ou de permissions, réinitialisation de mot de passe ; exports en
rafale ; rythme d'actions impossible à la main. Score ≥ 25 : « activité inhabituelle » ;
≥ 50 : notification de sécurité à l'administrateur ; ≥ 80 : urgente.

**Table `Notification`** à prévoir : `id_notification`, `id_expediteur`,
`cible_type` (tous / role / etablissement / utilisateur) + `cible_valeur`, `titre`,
`message`, `priorite` (info / importante / urgente), `categorie` (message / securite /
systeme), `date_envoi`, `expire_le`, `accuse_requis` ; et par destinataire :
`lu_le`, `accuse_le`. Prévoir aussi les **automatisations serveur** : verrouillage
temporaire du compte et déconnexion forcée au score ≥ 80, e-mail / SMS de l'administrateur
sur alerte critique, résumé quotidien, vérification nocturne de la chaîne de hachage,
purge / archivage selon la durée de rétention légale.

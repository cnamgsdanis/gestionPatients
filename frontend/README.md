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

- **Front-end pur.** Aucun backend, aucune API réelle. Tout l'état vit dans
  `localStorage` (voir §7). Ne branchez pas de `fetch()` vers un serveur réel
  sans en discuter d'abord.
- **Aucun framework, aucun bundler, aucune dépendance externe.** Pas de React,
  Vue, Tailwind, jQuery, ni de CDN. Tout est écrit à la main en HTML/CSS/JS
  natifs (`index.html`, `style.css`, `app.js`, `data.js`).
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
| `data.js` | Données factices (`ASSURES`, `MEDECINS`, `USERS_SEED`). C'est ici qu'on ajoute des jeux de données de test, jamais dans `app.js`. |

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
--red:        #cc0000;   /* danger, suppression, statut "Inactif" */
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

1. Le champ verrouillé reste **visible**, jamais masqué (sauf cas
   particulier documenté, comme la section Prestations cachée... non —
   même elle reste visible mais désactivée, voir `openSoins()` dans
   `app.js`). L'utilisateur doit voir la donnée, comprendre qu'elle existe,
   et comprendre pourquoi il ne peut pas la changer.
2. Verrouillage technique : attribut `disabled` sur l'`input`/`select`, pas
   `readonly` seul (sauf pour un champ généré automatiquement comme le
   numéro de feuille).
3. Habillage visuel : fond `.section-body.locked` (vert clair `#dff0e3`) ou
   classe `.on` / `.locked` sur le `<label>` de la valeur sélectionnée
   (texte en gras, `var(--green-dark)`), et un `.lock-note` à côté du titre
   de section expliquant la source de la donnée.
4. Ne réactivez jamais un champ verrouillé par un raccourci CSS global :
   le verrouillage se fait **par JS, champ par champ**, dans la fonction qui
   ouvre la vue (voir `openSoins()` vs `openSoinsForValidation()` dans
   `app.js` pour l'exemple canonique de deux modes sur un même formulaire).

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
6. **État** : si votre interface a besoin de données persistées, ajoutez une
   clé à l'objet `state` en tête d'`app.js`, avec un commentaire expliquant
   sa forme, et persistez-la via `saveJSON("pec_ma_cle", ...)` /
   `loadJSON("pec_ma_cle", valeurParDéfaut)`. **Préfixez toujours les clés
   `localStorage` par `pec_`.**
7. **Migration de schéma** : si vous ajoutez un champ à une donnée déjà
   persistée (comme `historique`), ajoutez une ligne de migration douce au
   même endroit que les migrations existantes (tout en haut d'`app.js`,
   juste après la déclaration de `state`) — ne cassez jamais la relecture
   des données déjà enregistrées par un utilisateur.
8. **Testez** avant de livrer (voir §10).

---

## 9. Animations — réservées à l'écran de connexion

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
- **Clés `localStorage`** : `pec_snake_case` (`pec_historique`,
  `pec_sidebar_collapsed`).
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

# Module 02 — Patient

Documentation du module de gestion des patients.

**Base URL** : `http://localhost:8080`

**Toutes les routes nécessitent un token JWT** + la permission indiquée.

---

## Vue d'ensemble

Le module **Patient** sert surtout à **rechercher** un patient (par ID ou NAG) et à utiliser ses infos pour le parcours de prise en charge.

La création (`POST`) existe principalement pour **remplir la base** (seed / test). Les patients métier seront en pratique déjà présents en BDD.

Fonctions exposées :

- Lister / lire un patient
- Rechercher par **NAG** (entier)
- Créer / modifier / supprimer (admin / seed)

---

## Modele Patient

| Champ | Type | Description |
|---|---|---|
| `id_patient` | int | Identifiant unique (généré) |
| `photo_url` | string / null | URL de la photo |
| `prenom` | string | Prénom |
| `nom` | string | Nom de famille |
| `sex` | string | `"M"` ou `"F"` |
| `contact` | string / null | Téléphone |
| `statut_assure` | boolean | `true` = assuré |
| `fonds` | int / null | **Niveau** 1, 2, 3 ou 4 (pas un montant) |
| `matricule_nag` | int / null | NAG **INT, exactement 10 chiffres** (pas de lettres, pas de préfixe imposé) |
| `id_assure_principal` | int / null | ID du patient parent (ayant droit) ; `null` si principal |
| `assure_principal` | objet / null | **Calculé** : fiche du parent (quand on soigne un enfant) |
| `fonds_couverture` | int / null | **Calculé** : fonds du parent si ayant droit, sinon son propre fonds |

### Assuré principal vs ayant droit

- **Assuré principal** : `id_assure_principal = null`. C'est lui qui porte le contrat.
- **Ayant droit** (enfant, etc.) : autre patient avec `id_assure_principal = id du parent`.
- **Quand on soigne l'enfant**, la PEC utilise `fonds_couverture` (= fonds du parent).

`GET /api/patients/{id}/ayants-droit` : liste des personnes sous l'aile du parent.

### Regles NAG

- Type BDD / API : **INT**, **exactement 10 chiffres** (chiffres uniquement)
- **Aucun préfixe imposé** (ex. 202 / 303 : peu importe)
- **Généré automatiquement** : compteur 10 chiffres
  - Exemple : `2026000001`, puis `2026000002`…
- **Jamais** fourni par le client au `POST` (ignoré s'il est envoyé)
- **Jamais** modifiable au `PUT`

---

## Permissions requises

| Route | Permission |
|---|---|
| `GET /api/patients` | `patient.lire` |
| `GET /api/patients/{id}` | `patient.lire` |
| `GET /api/patients/nag/{nag}` | `patient.lire` |
| `GET /api/patients/{id}/ayants-droit` | `patient.lire` |
| `POST /api/patients` | `patient.creer` |
| `PUT /api/patients/{id}` | `patient.modifier` |
| `DELETE /api/patients/{id}` | `patient.supprimer` |

Header obligatoire :

```http
Authorization: Bearer <token>
```

---

## `GET /api/patients`

Liste tous les patients.

**Réponse `200`**

```json
[
  {
    "id_patient": 1007,
    "prenom": "Jean",
    "nom": "Pierre",
    "sex": "M",
    "contact": "770011223",
    "statut_assure": true,
    "fonds": 2,
    "matricule_nag": 2026000001,
    "id_assure_principal": null
  }
]
```

---

## `GET /api/patients/{id}`

Détail d'un patient par ID.

**Exemple** : `GET /api/patients/1007`

| Code | Cause |
|---|---|
| `200` | Patient trouvé |
| `404` | `{"error":"Patient introuvable"}` |

---

## `GET /api/patients/nag/{nag}`

Recherche un patient par son **NAG** (entier).

**Exemple** : `GET /api/patients/nag/2026000001`

**Body** : aucun

**Réponse `200`** : objet Patient complet (mêmes champs que ci-dessus).

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"NAG invalide : uniquement 10 chiffres (ex: 2026000001)"}` | Lettres, symboles, ou longueur ≠ 10 |
| `404` | `{"error":"Aucun patient avec ce NAG"}` | Aucun match |

Fichiers code :

- `controller/PatientController.java` → `handleGet()` (bloc `nag`)
- `dao/PatientDAO.java` → `findByNag(int)`

---

## `GET /api/patients/{id}/ayants-droit`

Liste les patients **sous l'aile** de l'assuré principal `{id}`.

**Exemple** : `GET /api/patients/1007/ayants-droit`

**Réponse `200`** : tableau de patients (enfants / ayants droit). `[]` si aucun.

---

Crée un patient (seed / test). Le NAG est généré automatiquement.

**Body (JSON)**

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `photo_url` | string / null | ❌ | — |
| `prenom` | string | ✅ | — |
| `nom` | string | ✅ | — |
| `sex` | string | ✅ | `"M"` ou `"F"` |
| `contact` | string / null | ❌ | — |
| `statut_assure` | boolean | ✅ | — |
| `fonds` | int / null | ❌ | Niveau **1–4** uniquement |
| `id_assure_principal` | int / null | ❌ | Doit exister si renseigné |

> Ne pas envoyer `matricule_nag` : il est généré côté serveur.

**Exemple**

```json
{
  "photo_url": null,
  "prenom": "Jean",
  "nom": "Pierre",
  "sex": "M",
  "contact": "770011223",
  "statut_assure": true,
  "fonds": 2,
  "id_assure_principal": null
}
```

**Réponse `201`**

```json
{
  "id_patient": 1007,
  "matricule_nag": 2026000001
}
```

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"Assure principal introuvable (id_assure_principal=...)"}` | ID parent inexistant |
| `400` | `{"error":"id_assure_principal invalide"}` | Valeur ≤ 0 |

---

## `PUT /api/patients/{id}`

Modifie un patient. Le **NAG reste inchangé**.

**Body** : mêmes champs que le POST (sans `matricule_nag` utile).

**Réponse `200`** : `{"message":"Modifie"}`

Si `id_assure_principal` est invalide → **400** (même message que le POST).

---

## `DELETE /api/patients/{id}`

**Réponse `200`** : `{"message":"Supprime"}`  
**404** si introuvable.

---

## Codes HTTP

| Code | Signification |
|---|---|
| `200` | OK |
| `201` | Créé |
| `400` | NAG invalide / assuré principal introuvable / body invalide |
| `401` | Token manquant ou invalide |
| `403` | Permission refusée |
| `404` | Patient / NAG introuvable |
| `500` | Erreur serveur (ex. contrainte SQL `fonds` hors 1–4) |

---

## Exemple Postman — recherche NAG

1. `POST {{baseUrl}}/api/auth/login` → récupérer `token`
2. `GET {{baseUrl}}/api/patients/nag/2026000001`
3. Header : `Authorization: Bearer <token>`
4. Body : aucun

---

## Notes techniques

| Sujet | Détail |
|---|---|
| **fonds** | Niveau 1–4 (CHECK SQL), pas un montant |
| **matricule_nag** | `INT`, auto 10 chiffres uniquement, unique |
| **id_assure_principal** | Vérifié avant insert/update → 400 si absent |
| **Usage métier** | Recherche NAG + lecture infos pour valider le parcours |

---

*Module 02 — Patient — GestionPatients — 2026*

# API GestionPatients — Documentation

**Base URL** : `http://localhost:8080`

**Format** : JSON UTF-8

**Content-Type** obligatoire pour POST/PUT : `application/json`

**Auth** : toutes les routes sauf `/api/auth/register` et `/api/auth/login` exigent  
`Authorization: Bearer <token>`

Docs détaillées par module : [`docs/`](./docs/README.md)

---

## Sommaire

1. [Authentification](#-authentification)
2. [Patients](#-patients)
3. [Codes HTTP](#-codes-http)
4. [Format des erreurs](#-format-des-erreurs)
5. [Exemples frontend](#-exemples-dappel-frontend)

---

## Authentification

### `POST /api/auth/register`

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `username` | string | ✅ | Identifiant unique |
| `mot_de_passe` | string | ✅ | Min. 4 caractères |
| `nom` | string | ✅ | Nom complet |
| `email` | string | ❌ | — |
| `telephone` | string | ❌ | — |
| `role` | string | ✅ | `administrateur`, `agent_accueil`, `pharmacien`, `medecin`, `directeur_structure`, `caissier_structure` |
| `id_structure` | int | ✅ | FK Structure |

```json
{
  "username": "danis",
  "mot_de_passe": "danis123",
  "nom": "Administrateur",
  "email": "danis@gmail.com",
  "telephone": "770000000",
  "role": "administrateur",
  "id_structure": 1
}
```

**201** : utilisateur créé (sans mot de passe).

---

### `POST /api/auth/login`

```json
{
  "username": "danis",
  "mot_de_passe": "danis123"
}
```

**200**

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id_utilisateur": 1,
    "username": "danis",
    "role": "administrateur",
    "actif": true
  }
}
```

Utiliser `token` dans le header `Authorization: Bearer ...` (expire en 1 h).

| Code | Cause |
|---|---|
| `401` | Identifiants invalides |
| `403` | Compte désactivé |

---

## Patients

> `fonds` = **niveau 1–4** (pas un montant).  
> `matricule_nag` = **INT**, **exactement 10 chiffres** (chiffres uniquement, pas de préfixe imposé). Jamais saisi par le client.  
> Voir aussi [`docs/02-patient.md`](./docs/02-patient.md).

Permissions : `patient.lire` / `patient.creer` / `patient.modifier` / `patient.supprimer`

### `GET /api/patients`

Liste tous les patients. Header Bearer requis.

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

### `GET /api/patients/{id}`

Exemple : `GET /api/patients/1007`  
**404** si introuvable.

---

### `GET /api/patients/nag/{nag}`

Recherche par NAG (**10 chiffres uniquement**, pas de préfixe imposé). Body : aucun.

Exemple : `GET /api/patients/nag/2026000001`

| Code | Cause |
|---|---|
| `200` | Patient trouvé (objet complet) |
| `400` | Lettres, symboles, ou longueur ≠ 10 |
| `404` | Aucun patient avec ce NAG |

---

### `POST /api/patients`

Crée un patient (seed / test). NAG généré automatiquement.

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `photo_url` | string / null | ❌ | — |
| `prenom` | string | ✅ | — |
| `nom` | string | ✅ | — |
| `sex` | string | ✅ | `"M"` ou `"F"` |
| `contact` | string / null | ❌ | — |
| `statut_assure` | boolean | ✅ | — |
| `fonds` | int / null | ❌ | Niveau **1, 2, 3 ou 4** |
| `id_assure_principal` | int / null | ❌ | ID parent existant, sinon 400 |

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

**201**

```json
{
  "id_patient": 1007,
  "matricule_nag": 2026000001
}
```

| Code | Cause |
|---|---|
| `400` | `id_assure_principal` inexistant ou invalide |
| `201` | Créé + NAG renvoyé |

---

### `PUT /api/patients/{id}`

Modifie un patient. Le **NAG n'est jamais modifié**.

```json
{
  "prenom": "Jean",
  "nom": "Pierre",
  "sex": "M",
  "contact": "781111111",
  "statut_assure": true,
  "fonds": 3,
  "id_assure_principal": null
}
```

**200** : `{"message":"Modifie"}`

---

### `DELETE /api/patients/{id}`

**200** : `{"message":"Supprime"}`  
**404** si introuvable.

---

## Codes HTTP

| Code | Signification |
|---|---|
| `200` | OK |
| `201` | Created |
| `400` | Bad Request (NAG invalide, assuré principal introuvable…) |
| `401` | Unauthorized (token / identifiants) |
| `403` | Forbidden (permission / compte désactivé) |
| `404` | Not Found |
| `405` | Method Not Allowed |
| `409` | Conflict (username déjà pris) |
| `500` | Internal Server Error |

---

## Format des erreurs

```json
{ "error": "Message d'erreur lisible" }
```

Permission refusée :

```json
{
  "error": "Permission refusee : patient.supprimer",
  "role": "medecin"
}
```

---

## Exemples d'appel frontend

```javascript
const BASE_URL = "http://localhost:8080";

async function login(username, motDePasse) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, mot_de_passe: motDePasse })
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return await res.json(); // { token, user }
}

async function rechercherParNag(token, nag) {
  const res = await fetch(`${BASE_URL}/api/patients/nag/${nag}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return await res.json();
}

async function creerPatient(token, patient) {
  const res = await fetch(`${BASE_URL}/api/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(patient)
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return await res.json(); // { id_patient, matricule_nag }
}
```

---

## Resume rapide

| Action | Méthode | URL |
|---|---|---|
| Créer un compte | `POST` | `/api/auth/register` |
| Se connecter | `POST` | `/api/auth/login` |
| Lister les patients | `GET` | `/api/patients` |
| Lire un patient | `GET` | `/api/patients/{id}` |
| Rechercher par NAG | `GET` | `/api/patients/nag/{nag}` |
| Créer un patient | `POST` | `/api/patients` |
| Modifier un patient | `PUT` | `/api/patients/{id}` |
| Supprimer un patient | `DELETE` | `/api/patients/{id}` |

---

*Documentation API GestionPatients — 2026*

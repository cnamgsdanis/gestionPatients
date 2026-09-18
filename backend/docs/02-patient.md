# 🧑‍⚕️ Module 02 — Patient

Documentation du module de gestion des patients.

**Base URL** : `http://localhost:8080`

**🔒 Toutes les routes nécessitent un token JWT.**

---

## 📑 Sommaire

- [Vue d'ensemble](#-vue-densemble)
- [Modèle Patient](#-modèle-patient)
- [Permissions requises](#-permissions-requises)
- [`GET /api/patients`](#-get-apipatients)
- [`GET /api/patients/{id}`](#-get-apipatientsid)
- [`POST /api/patients`](#-post-apipatients)
- [`PUT /api/patients/{id}`](#-put-apipatientsid)
- [`DELETE /api/patients/{id}`](#-delete-apipatientsid)
- [Codes HTTP](#-codes-http)
- [Exemples frontend (fetch)](#-exemples-frontend-fetch)
- [Notes techniques](#-notes-techniques)

---

## 🎯 Vue d'ensemble

Le module **Patient** permet de gérer les dossiers patients :

- Consulter la liste des patients
- Consulter le détail d'un patient
- Créer un nouveau patient
- Modifier un patient existant
- Supprimer un patient

---

## 📋 Modèle Patient

| Champ | Type | Description |
|---|---|---|
| `id_patient` | int | Identifiant unique (généré) |
| `photo_url` | string / null | URL de la photo |
| `prenom` | string | Prénom |
| `nom` | string | Nom de famille |
| `sex` | string | `"M"` ou `"F"` |
| `contact` | string / null | Numéro de téléphone |
| `statut_assure` | boolean | `true` = assuré, `false` = non assuré |
| `fonds` | int / null | Niveau de fonds : **1, 2, 3 ou 4** |
| `matricule_nag` | string / null | Numéro d'assuré (NAG) |
| `id_assure_principal` | int / null | ID du patient parent (si ayant droit) |

> 📌 `fonds` est un **niveau** (1 à 4), pas un montant.

> 📌 `id_assure_principal` est `null` pour un patient principal.

---

## 🛡️ Permissions requises

| Route | Permission |
|---|---|
| `GET /api/patients` | `patient.lire` |
| `GET /api/patients/{id}` | `patient.lire` |
| `POST /api/patients` | `patient.creer` |
| `PUT /api/patients/{id}` | `patient.modifier` |
| `DELETE /api/patients/{id}` | `patient.supprimer` |

**L'admin peut modifier ces permissions en direct** via :

`POST /api/permissions/role/{role}/{code}`

---

## 🔹 `GET /api/patients`

Renvoie **tous les patients**.

### Requête

**Headers** :

```http
Authorization: Bearer <token>
```

**Paramètres** : aucun

### Réponse succès — `200 OK`

```json
[
  {
    "id_patient": 1,
    "photo_url": null,
    "prenom": "Danis",
    "nom": "BOUSSENGUIT",
    "sex": "M",
    "contact": "770000000",
    "statut_assure": true,
    "fonds": 3,
    "matricule_nag": "2584559678",
    "id_assure_principal": null
  },
  {
    "id_patient": 2,
    "photo_url": null,
    "prenom": "Awa",
    "nom": "Diop",
    "sex": "F",
    "contact": "781111111",
    "statut_assure": false,
    "fonds": 2,
    "matricule_nag": null,
    "id_assure_principal": 1
  }
]
```

> 📌 Si aucun patient : `[]` (tableau vide).

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `401` | `{"error":"Token manquant"}` | Pas de header `Authorization` |
| `403` | `{"error":"Permission refusee : patient.lire", "role": "..."}` | Rôle sans permission |

---

## 🔹 `GET /api/patients/{id}`

Renvoie un seul patient par son ID.

### Requête

**URL** : `GET /api/patients/1`

**Headers** : `Authorization: Bearer <token>`

### Réponse succès — `200 OK`

```json
{
  "id_patient": 1,
  "photo_url": null,
  "prenom": "Danis",
  "nom": "BOUSSENGUIT",
  "sex": "M",
  "contact": "770000000",
  "statut_assure": true,
  "fonds": 3,
  "matricule_nag": "2584559678",
  "id_assure_principal": null
}
```

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `401` | `{"error":"Token manquant"}` | Pas de token |
| `403` | `{"error":"Permission refusee : patient.lire", "role": "..."}` | Permission manquante |
| `404` | `{"error":"Patient introuvable"}` | Aucun patient avec cet ID |

---

## 🔹 `POST /api/patients`

Crée un nouveau patient.

### Requête

**Headers** :

```http
Authorization: Bearer <token>
Content-Type: application/json
```

### Champs

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `photo_url` | string / null | ❌ | URL de la photo |
| `prenom` | string | ✅ | Prénom |
| `nom` | string | ✅ | Nom |
| `sex` | string | ✅ | `"M"` ou `"F"` |
| `contact` | string / null | ❌ | Téléphone |
| `statut_assure` | boolean | ✅ | — |
| `fonds` | int / null | ❌ | Niveau 1-4 |
| `matricule_nag` | string / null | ❌ | — |
| `id_assure_principal` | int / null | ❌ | ID du parent (optionnel) |

### Body (JSON)

```json
{
  "photo_url": null,
  "prenom": "Awa",
  "nom": "Diop",
  "sex": "F",
  "contact": "770000000",
  "statut_assure": true,
  "fonds": 2,
  "matricule_nag": "NAG001",
  "id_assure_principal": null
}
```

### Réponse succès — `201 Created`

```json
{
  "id_patient": 12
}
```

> 📌 Le client doit utiliser cet `id_patient` pour toute opération future.

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `401` | `{"error":"Token manquant"}` | Pas de token |
| `403` | `{"error":"Permission refusee : patient.creer", ...}` | Permission manquante |
| `500` | `{"error":"..."}` | Erreur SQL (champ obligatoire manquant, fonds hors 1-4, etc.) |

---

## 🔹 `PUT /api/patients/{id}`

Modifie un patient existant.

### Requête

**URL** : `PUT /api/patients/1`

**Headers** :

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Body** : identique à `POST /api/patients`

```json
{
  "photo_url": null,
  "prenom": "Awa",
  "nom": "Diop",
  "sex": "F",
  "contact": "781111111",
  "statut_assure": true,
  "fonds": 4,
  "matricule_nag": "NAG001",
  "id_assure_principal": null
}
```

### Réponse succès — `200 OK`

```json
{
  "message": "Modifie"
}
```

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `401` | `{"error":"Token manquant"}` | Pas de token |
| `403` | `{"error":"Permission refusee : patient.modifier", ...}` | Permission manquante |
| `404` | `{"error":"Introuvable"}` | Aucun patient avec cet ID |

---

## 🔹 `DELETE /api/patients/{id}`

Supprime un patient.

### Requête

**URL** : `DELETE /api/patients/1`

**Headers** : `Authorization: Bearer <token>`

### Réponse succès — `200 OK`

```json
{
  "message": "Supprime"
}
```

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `401` | `{"error":"Token manquant"}` | Pas de token |
| `403` | `{"error":"Permission refusee : patient.supprimer", ...}` | Permission manquante |
| `404` | `{"error":"Introuvable"}` | Aucun patient avec cet ID |

---

## 📊 Codes HTTP

| Code | Signification | Quand il apparaît |
|---|---|---|
| `200` | OK | Lecture ou modification réussie |
| `201` | Created | Patient créé avec succès |
| `401` | Unauthorized | Token manquant ou invalide |
| `403` | Forbidden | Permission refusée |
| `404` | Not Found | Patient inexistant |
| `500` | Internal Server Error | Erreur SQL (voir console) |

---

## 💻 Exemples frontend (fetch)

```javascript
const API_URL = "http://localhost:8080";

// Récupérer le token depuis localStorage
function getToken() {
  return localStorage.getItem("token");
}

// --- Lister les patients ---
async function listerPatients() {
  const res = await fetch(`${API_URL}/api/patients`, {
    headers: {
      "Authorization": `Bearer ${getToken()}`
    }
  });

  if (!res.ok) {
    throw new Error((await res.json()).error);
  }

  return await res.json();
}

// --- Créer un patient ---
async function creerPatient(patient) {
  const res = await fetch(`${API_URL}/api/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`
    },
    body: JSON.stringify(patient)
  });

  if (!res.ok) {
    throw new Error((await res.json()).error);
  }

  return (await res.json()).id_patient;
}

// --- Modifier un patient ---
async function modifierPatient(id, patient) {
  const res = await fetch(`${API_URL}/api/patients/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`
    },
    body: JSON.stringify(patient)
  });

  if (!res.ok) {
    throw new Error((await res.json()).error);
  }

  return await res.json();
}

// --- Supprimer un patient ---
async function supprimerPatient(id) {
  const res = await fetch(`${API_URL}/api/patients/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${getToken()}`
    }
  });

  if (!res.ok) {
    throw new Error((await res.json()).error);
  }

  return await res.json();
}
```

---

## 📌 Notes techniques

| Sujet | Détail |
|---|---|
| **fonds** | Entier 1-4 (niveau, pas un montant) |
| **id_assure_principal** | `NULL` si patient principal, sinon ID du parent |
| **Permissions** | Modifiables à chaud par l'admin via `/api/permissions` |
| **Validation** | Côté backend via contraintes SQL (sexe M/F, fonds 1-4) |
| **photo_url** | Stocké en tant qu'URL - l'upload de fichier n'est pas géré par cette API |

---

*Module **02 - Patient** — Projet GestionPatients — 2026*

# 📘 API GestionPatients — Documentation

**Base URL** : `http://localhost:8080`

**Format** : Toutes les requêtes et réponses sont en **JSON UTF-8**.

**Content-Type obligatoire** pour les POST/PUT : `application/json`

---

## 📑 Sommaire

1. [Authentification](#-authentification)
   - [POST /api/auth/register](#post-apiauthregister)
   - [POST /api/auth/login](#post-apiauthlogin)
2. [Patients](#-patients)
   - [GET /api/patients](#get-apipatients)
   - [GET /api/patients/{id}](#get-apipatientsid)
   - [POST /api/patients](#post-apipatients)
   - [PUT /api/patients/{id}](#put-apipatientsid)
   - [DELETE /api/patients/{id}](#delete-apipatientsid)
3. [Codes HTTP](#-codes-http)
4. [Erreurs](#-format-des-erreurs)
5. [Exemples frontend](#-exemples-dappel-frontend)

---

## 🔐 Authentification

### `POST /api/auth/register`

Crée un nouveau compte utilisateur.

**Body (JSON)**

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `username` | string | ✅ | Identifiant unique |
| `mot_de_passe` | string | ✅ | Minimum 4 caractères |
| `nom` | string | ✅ | Nom complet |
| `email` | string | ❌ | Adresse e-mail |
| `telephone` | string | ❌ | Numéro de téléphone |
| `role` | string | ✅ | `administrateur`, `agent_accueil`, `pharmacien` ou `medecin` |
| `id_structure` | int | ✅ | ID d'une structure existante (FK) |

**Exemple de requête**

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

**Réponse succès — `201 Created`**

```json
{
  "id_utilisateur": 1,
  "username": "danis",
  "nom": "Administrateur",
  "email": "danis@gmail.com",
  "telephone": "770000000",
  "role": "administrateur",
  "id_structure": 1,
  "actif": true,
  "date_creation": "2026-09-15T13:38:30.5123954",
  "derniere_connexion": null
}
```

> ⚠️ Le champ `mot_de_passe` **n'est jamais renvoyé**.

**Réponses d'erreur**

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"username obligatoire"}` | Champ `username` manquant |
| `400` | `{"error":"mot de passe trop court (min 4)"}` | Mot de passe < 4 caractères |
| `400` | `{"error":"role obligatoire"}` | Champ `role` manquant |
| `400` | `{"error":"id_structure obligatoire"}` | `id_structure` ≤ 0 |
| `409` | `{"error":"Cet username est deja pris"}` | Username déjà utilisé |

---

### `POST /api/auth/login`

Authentifie un utilisateur.

**Body (JSON)**

| Champ | Type | Obligatoire |
|---|---|---|
| `username` | string | ✅ |
| `mot_de_passe` | string | ✅ |

**Exemple de requête**

```json
{
  "username": "danis",
  "mot_de_passe": "danis123"
}
```

**Réponse succès — `200 OK`**

```json
{
  "id_utilisateur": 1,
  "username": "danis",
  "nom": "Administrateur",
  "email": "danis@gmail.com",
  "telephone": "770000000",
  "role": "administrateur",
  "id_structure": 1,
  "actif": true,
  "date_creation": "2026-09-15T13:38:30.5123954",
  "derniere_connexion": "2026-09-15T13:39:47.8758417"
}
```

**Réponses d'erreur**

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"username et mot_de_passe obligatoires"}` | Champ manquant |
| `401` | `{"error":"Identifiants invalides"}` | Username inconnu **ou** mauvais mot de passe |
| `403` | `{"error":"Compte desactive"}` | Compte désactivé (`actif = false`) |

---

## 🧑‍⚕️ Patients

### `GET /api/patients`

Renvoie **tous les patients**.

**Paramètres** : aucun

**Réponse succès — `200 OK`**

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
    "fonds": 3.0,
    "matricule_nag": "2584559678"
  },
  {
    "id_patient": 2,
    "photo_url": null,
    "prenom": "Awa",
    "nom": "Diop",
    "sex": "F",
    "contact": "781111111",
    "statut_assure": false,
    "fonds": 0.0,
    "matricule_nag": null
  }
]
```

> 📌 Si aucun patient : `[]` (tableau vide).

---

### `GET /api/patients/{id}`

Renvoie **un seul patient** par son ID.

**Paramètre d'URL**

| Nom | Type | Description |
|---|---|---|
| `id` | int | ID du patient |

**Exemple**

```
GET /api/patients/1
```

**Réponse succès — `200 OK`**

```json
{
  "id_patient": 1,
  "photo_url": null,
  "prenom": "Danis",
  "nom": "BOUSSENGUIT",
  "sex": "M",
  "contact": "770000000",
  "statut_assure": true,
  "fonds": 3.0,
  "matricule_nag": "2584559678"
}
```

**Réponse erreur**

| Code | Body | Cause |
|---|---|---|
| `404` | `{"error":"Patient introuvable"}` | Aucun patient avec cet ID |
| `400` | `{"error":"Route invalide"}` | URL mal formée |

---

### `POST /api/patients`

Crée un nouveau patient.

**Body (JSON)**

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `photo_url` | string / null | ❌ | URL de la photo |
| `prenom` | string | ✅ | Prénom |
| `nom` | string | ✅ | Nom |
| `sex` | string | ✅ | `"M"` ou `"F"` |
| `contact` | string / null | ❌ | Téléphone |
| `statut_assure` | boolean | ✅ | `true` ou `false` |
| `fonds` | number | ✅ | Montant disponible |
| `matricule_nag` | string / null | ❌ | Numéro d'assuré |

**Exemple de requête**

```json
{
  "photo_url": null,
  "prenom": "Danis",
  "nom": "BOUSSENGUIT",
  "sex": "M",
  "contact": "770000000",
  "statut_assure": true,
  "fonds": 3,
  "matricule_nag": "2584559678"
}
```

**Réponse succès — `201 Created`**

```json
{
  "id_patient": 1
}
```

> 📌 Le client doit utiliser cet `id_patient` pour toute opération future.

---

### `PUT /api/patients/{id}`

Modifie **un patient existant**. Tous les champs sont attendus (même s'ils ne changent pas).

**Paramètre d'URL**

| Nom | Type | Description |
|---|---|---|
| `id` | int | ID du patient à modifier |

**Body (JSON)** : identique à `POST /api/patients`

```json
{
  "photo_url": null,
  "prenom": "Danis",
  "nom": "BOUSSENGUIT",
  "sex": "M",
  "contact": "781111111",
  "statut_assure": true,
  "fonds": 5000,
  "matricule_nag": "2584559678"
}
```

**Réponse succès — `200 OK`**

```json
{ "message": "Modifie" }
```

**Réponse erreur**

| Code | Body | Cause |
|---|---|---|
| `404` | `{"error":"Introuvable"}` | Aucun patient avec cet ID |

---

### `DELETE /api/patients/{id}`

Supprime un patient.

**Paramètre d'URL**

| Nom | Type | Description |
|---|---|---|
| `id` | int | ID du patient à supprimer |

**Réponse succès — `200 OK`**

```json
{ "message": "Supprime" }
```

**Réponse erreur**

| Code | Body | Cause |
|---|---|---|
| `404` | `{"error":"Introuvable"}` | Aucun patient avec cet ID |

---

## 📊 Codes HTTP

| Code | Signification | Quand il apparaît |
|---|---|---|
| `200` | OK | Lecture ou modification réussie |
| `201` | Created | Ressource créée avec succès |
| `400` | Bad Request | Champ manquant ou invalide |
| `401` | Unauthorized | Identifiants incorrects |
| `403` | Forbidden | Compte désactivé |
| `404` | Not Found | Ressource inexistante |
| `405` | Method Not Allowed | Méthode HTTP incorrecte |
| `409` | Conflict | Conflit (username déjà pris) |
| `500` | Internal Server Error | Bug côté serveur |

---

## ❌ Format des erreurs

Toutes les erreurs respectent le même format JSON :

```json
{ "error": "Message d'erreur lisible" }
```

Le frontend peut donc **toujours parser** la réponse et lire le champ `error` en cas d'échec.

---

## 💻 Exemples d'appel frontend

### JavaScript (fetch)

```javascript
const BASE_URL = "http://localhost:8080";

// --- Login ---
async function login(username, motDePasse) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, mot_de_passe: motDePasse })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }

  const user = await res.json();
  console.log("Connecté :", user);
  return user;
}

// --- Lister les patients ---
async function listerPatients() {
  const res = await fetch(`${BASE_URL}/api/patients`);
  return await res.json();
}

// --- Créer un patient ---
async function creerPatient(patient) {
  const res = await fetch(`${BASE_URL}/api/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patient)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }

  const data = await res.json();
  return data.id_patient;   // ID du nouveau patient
}

// --- Modifier un patient ---
async function modifierPatient(id, patient) {
  const res = await fetch(`${BASE_URL}/api/patients/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patient)
  });
  return res.ok;
}

// --- Supprimer un patient ---
async function supprimerPatient(id) {
  const res = await fetch(`${BASE_URL}/api/patients/${id}`, {
    method: "DELETE"
  });
  return res.ok;
}
```

### Axios

```javascript
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8080",
  headers: { "Content-Type": "application/json" }
});

// Login
const { data: user } = await api.post("/api/auth/login", {
  username: "danis",
  mot_de_passe: "danis123"
});

// Liste
const { data: patients } = await api.get("/api/patients");

// Création
const { data } = await api.post("/api/patients", {
  prenom: "Awa",
  nom: "Diop",
  sex: "F",
  contact: "770000000",
  statut_assure: true,
  fonds: 0,
  matricule_nag: "NAG001"
});
console.log("ID créé :", data.id_patient);
```

### PHP (cURL)

```php
<?php
$ch = curl_init("http://localhost:8080/api/patients");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
curl_close($ch);

$patients = json_decode($response, true);
print_r($patients);
```

### Python (requests)

```python
import requests

# Login
r = requests.post("http://localhost:8080/api/auth/login", json={
    "username": "danis",
    "mot_de_passe": "danis123"
})
print(r.json())

# Liste des patients
r = requests.get("http://localhost:8080/api/patients")
print(r.json())
```

---

## 📌 Résumé rapide

| Action | Méthode | URL |
|---|---|---|
| Créer un compte | `POST` | `/api/auth/register` |
| Se connecter | `POST` | `/api/auth/login` |
| Lister les patients | `GET` | `/api/patients` |
| Lire un patient | `GET` | `/api/patients/{id}` |
| Créer un patient | `POST` | `/api/patients` |
| Modifier un patient | `PUT` | `/api/patients/{id}` |
| Supprimer un patient | `DELETE` | `/api/patients/{id}` |

---

## 🧪 Import Postman (bonus)

Tu peux importer cette collection directement dans Postman :

1. Postman → **File → Import**
2. Colle ce JSON :

```json
{
  "info": { "name": "GestionPatients", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  "item": [
    {
      "name": "Register",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "http://localhost:8080/api/auth/register",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"username\": \"danis\",\n  \"mot_de_passe\": \"danis123\",\n  \"nom\": \"Administrateur\",\n  \"email\": \"danis@gmail.com\",\n  \"telephone\": \"770000000\",\n  \"role\": \"administrateur\",\n  \"id_structure\": 1\n}"
        }
      }
    },
    {
      "name": "Login",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "http://localhost:8080/api/auth/login",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"username\": \"danis\",\n  \"mot_de_passe\": \"danis123\"\n}"
        }
      }
    },
    {
      "name": "Liste patients",
      "request": {
        "method": "GET",
        "url": "http://localhost:8080/api/patients"
      }
    },
    {
      "name": "Créer patient",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "http://localhost:8080/api/patients",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"photo_url\": null,\n  \"prenom\": \"Awa\",\n  \"nom\": \"Diop\",\n  \"sex\": \"F\",\n  \"contact\": \"770000000\",\n  \"statut_assure\": true,\n  \"fonds\": 0,\n  \"matricule_nag\": \"NAG001\"\n}"
        }
      }
    }
  ]
}
```

---

*Documentation générée pour le projet **GestionPatients** — 2026*
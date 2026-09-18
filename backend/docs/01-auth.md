

# 🔐 Module 01 — Authentification

Documentation du module d'authentification et de gestion des mots de passe.

**Base URL** : `http://localhost:8080`

---

## 📑 Sommaire

- [Vue d'ensemble](#-vue-densemble)
- [Modèle Utilisateur](#-modèle-utilisateur)
- [Rôles disponibles](#-rôles-disponibles)
- [`POST /api/auth/register`](#-post-apiauthregister)
- [`POST /api/auth/login`](#-post-apiauthlogin)
- [`POST /api/auth/logout`](#-post-apiauthlogout)
- [`PUT /api/auth/change-password`](#-put-apiauthchange-password)
- [`POST /api/auth/reset-password`](#-post-apiauthreset-password)
- [Codes HTTP](#-codes-http)
- [Flux d'authentification JWT](#-flux-dauthentification-jwt)
- [Exemples frontend](#-exemples-frontend-fetch)

---

## 🎯 Vue d'ensemble

Le module **Authentification** gère :

- **Inscription** - Création de nouveaux comptes
- **Connexion** - Génération de tokens JWT
- **Déconnexion** - Confirmation de suppression du token côté client
- **Changement de mot de passe** - Par l'utilisateur lui-même
- **Réinitialisation de mot de passe** - Par un administrateur

### Sécurité

- **BCrypt** - Hash sécurisé des mots de passe (sel automatique)
- **JWT** - Token avec expiration d'1 heure
- **Permissions** - Contrôle d'accès granulaire

---

## 📋 Modèle Utilisateur

| Champ | Type | Description |
|---|---|---|
| `id_utilisateur` | int | Identifiant unique (généré) |
| `username` | string | Identifiant de connexion (unique) |
| `mot_de_passe` | string | Hash BCrypt (jamais renvoyé) |
| `nom` | string | Nom complet |
| `email` | string / null | Adresse e-mail |
| `telephone` | string / null | Numéro de téléphone |
| `role` | string | Rôle (voir liste ci-dessous) |
| `id_structure` | int | FK vers Structure |
| `actif` | boolean | Compte actif/désactivé |
| `date_creation` | datetime | Date de création (auto) |
| `derniere_connexion` | datetime / null | Dernière connexion réussie |

---

## 🎭 Rôles disponibles

| Rôle | Description | Permissions par défaut |
|---|---|---|
| `administrateur` | Super admin | Toutes |
| `agent_accueil` | Agent hospitalier | patient.*, prestation.*, structure.lire |
| `medecin` | Médecin | patient.lire, prestation.*, ordonnance.* |
| `pharmacien` | Pharmacien | patient.lire, ordonnance.lire/delivrer |
| `directeur_structure` | Directeur d'établissement | patient.lire, utilisateur.lire, prestation.lire |
| `caissier_structure` | Caissier | patient.lire, prestation.lire |

---

## 🔹 `POST /api/auth/register`

Crée un nouveau compte utilisateur.

### Requête

**Headers** :

```http
Content-Type: application/json
```

### Champs (Body JSON)

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `username` | string | ✅ | Identifiant unique |
| `mot_de_passe` | string | ✅ | Minimum 4 caractères |
| `nom` | string | ✅ | Nom complet |
| `email` | string | ❌ | Adresse e-mail |
| `telephone` | string | ❌ | Numéro de téléphone |
| `role` | string | ✅ | Voir liste des rôles |
| `id_structure` | int | ✅ | ID d'une structure existante |

### Body (JSON)

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

### Réponse succès — `201 Created`

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

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"username obligatoire"}` | Champ `username` manquant |
| `400` | `{"error":"mot de passe trop court (min 4)"}` | Mot de passe < 4 caractères |
| `400` | `{"error":"role obligatoire"}` | Champ `role` manquant |
| `400` | `{"error":"role invalide"}` | Rôle non reconnu |
| `400` | `{"error":"id_structure obligatoire"}` | `id_structure` ≤ 0 |
| `409` | `{"error":"Cet username est deja pris"}` | Username déjà utilisé |

---

## 🔹 `POST /api/auth/login`

Authentifie un utilisateur et génère un token JWT.

### Requête

**Headers** :

```http
Content-Type: application/json
```

### Body (JSON)

| Champ | Type | Obligatoire |
|---|---|---|
| `username` | string | ✅ |
| `mot_de_passe` | string | ✅ |

```json
{
  "username": "danis",
  "mot_de_passe": "danis123"
}
```

### Réponse succès — `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJpZF91dGlsaXNhdGV1ciI6MSwicm9sZSI6ImFkbWluaXN0cmF0ZXVyIiwibm9tIjoiQWRtaW5pc3RyYXRldXIiLCJleHAiOjE3MzE2ODEyMDB9.abc123...",
  "user": {
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
}
```

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"username et mot_de_passe obligatoires"}` | Champ manquant |
| `401` | `{"error":"Identifiants invalides"}` | Username inconnu **ou** mauvais mot de passe |
| `403` | `{"error":"Compte desactive"}` | Compte désactivé (`actif = false`) |

---

## 🔹 `POST /api/auth/logout`

Confirme la déconnexion (le client doit supprimer son token).

### Requête

**Headers** :

```http
Authorization: Bearer <token>
```

### Réponse succès — `200 OK`

```json
{
  "message": "Deconnecte. Supprimez votre token cote client."
}
```

> ⚠️ **Note** : Avec JWT, le token ne peut pas être invalidé côté serveur sans blacklist. Cette route sert uniquement à confirmer au client qu'il peut supprimer le token de son localStorage.

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `401` | `{"error":"Token manquant"}` | Pas de header `Authorization` |
| `401` | `{"error":"Token invalide"}` | Token malformé ou expiré |

---

## 🔹 `PUT /api/auth/change-password`

Permet à un utilisateur connecté de changer son propre mot de passe.

### Requête

**Headers** :

```http
Authorization: Bearer <token>
Content-Type: application/json
```

### Body (JSON)

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `ancien` | string | ✅ | Ancien mot de passe |
| `nouveau` | string | ✅ | Nouveau mot de passe (min 4 caractères) |

```json
{
  "ancien": "danis123",
  "nouveau": "nouveauMotDePasse456"
}
```

### Réponse succès — `200 OK`

```json
{
  "message": "Mot de passe modifie"
}
```

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"ancien et nouveau obligatoires"}` | Champ manquant |
| `400` | `{"error":"nouveau mot de passe trop court (min 4)"}` | < 4 caractères |
| `401` | `{"error":"Token manquant"}` | Pas authentifié |
| `401` | `{"error":"Ancien mot de passe incorrect"}` | Ancien mot de passe invalide |
| `404` | `{"error":"Utilisateur introuvable"}` | Utilisateur n'existe plus |
| `500` | `{"error":"Echec de la mise a jour"}` | Erreur SQL |

---

## 🔹 `POST /api/auth/reset-password`

Permet à un **administrateur** de réinitialiser le mot de passe d'un utilisateur.

### Requête

**Headers** :

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Permission requise** : `utilisateur.modifier`

### Body (JSON)

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id_utilisateur` | int | ✅ | ID de l'utilisateur cible |
| `nouveau` | string | ✅ | Nouveau mot de passe (min 4 caractères) |

```json
{
  "id_utilisateur": 5,
  "nouveau": "motDePasseTemporaire123"
}
```

### Réponse succès — `200 OK`

```json
{
  "message": "Mot de passe reinitialise"
}
```

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"id_utilisateur et nouveau obligatoires"}` | Champ manquant |
| `400` | `{"error":"nouveau mot de passe trop court (min 4)"}` | < 4 caractères |
| `401` | `{"error":"Token manquant"}` | Pas authentifié |
| `403` | `{"error":"Permission refusee : utilisateur.modifier", ...}` | Pas admin |
| `404` | `{"error":"Utilisateur cible introuvable"}` | ID inexistant |
| `500` | `{"error":"Echec de la mise a jour"}` | Erreur SQL |

---

## 📊 Codes HTTP

| Code | Signification | Quand il apparaît |
|---|---|---|
| `200` | OK | Opération réussie |
| `201` | Created | Compte créé avec succès |
| `400` | Bad Request | Champ manquant ou invalide |
| `401` | Unauthorized | Identifiants incorrects ou token invalide |
| `403` | Forbidden | Compte désactivé ou permission refusée |
| `404` | Not Found | Utilisateur inexistant |
| `409` | Conflict | Username déjà pris |
| `500` | Internal Server Error | Erreur serveur (voir console) |

---

## 🔐 Flux d'authentification JWT

```text
1. Client → POST /api/auth/login (username + mot_de_passe)
2. Serveur → Vérifie les identifiants avec BCrypt
3. Serveur → Génère un token JWT (expire dans 1h)
4. Serveur → Renvoie { token, user }
5. Client → Stocke le token dans localStorage
6. Client → Envoie le token dans toutes les requêtes :
            Authorization: Bearer <token>
7. Serveur → Vérifie la signature JWT
8. Serveur → Extrait le rôle et vérifie les permissions
9. Serveur → Traite la requête si autorisée
```

### Structure du token JWT

```json
{
  "id_utilisateur": 1,
  "role": "administrateur",
  "nom": "Administrateur",
  "exp": 1731681200
}
```

---

## 💻 Exemples frontend (fetch)

### Login et stockage du token

```javascript
const API_URL = "http://localhost:8080";

async function login(username, motDePasse) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, mot_de_passe: motDePasse })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }

  const data = await res.json();
  
  // Stocker le token et les infos utilisateur
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  
  return data;
}
```

### Changer son mot de passe

```javascript
async function changerMotDePasse(ancien, nouveau) {
  const token = localStorage.getItem("token");
  
  const res = await fetch(`${API_URL}/api/auth/change-password`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ ancien, nouveau })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }

  return await res.json();
}
```

### Réinitialiser un mot de passe (admin)

```javascript
async function resetMotDePasse(idUtilisateur, nouveau) {
  const token = localStorage.getItem("token");
  
  const res = await fetch(`${API_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ id_utilisateur: idUtilisateur, nouveau })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }

  return await res.json();
}
```

### Logout

```javascript
async function logout() {
  const token = localStorage.getItem("token");
  
  await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  
  // Nettoyer le stockage local
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
```

---

## 📌 Notes techniques

| Sujet | Détail |
|---|---|
| **BCrypt** | Rounds = 10 (paramétré dans `AuthService`) |
| **JWT** | Algorithme HS256, clé secrète dans `JwtService` |
| **Expiration** | 1 heure après génération |
| **Refresh token** | Non implémenté (prévu pour v2) |
| **Dernière connexion** | Mise à jour automatique à chaque login réussi |
| **Compte désactivé** | `actif = false` empêche la connexion (403) |

---

*Module **01 - Authentification** — Projet GestionPatients — 2026*

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
  return JSON.parse(localStorage.getItem("user"))?.token;
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
```

---

## 📌 Notes techniques

| Sujet | Détail |
|---|---|
| **fonds** | Entier 1-4 (niveau, pas un montant) |
| **id_assure_principal** | `NULL` si patient principal, sinon ID du parent |
| **Permissions** | Modifiables à chaud par l'admin via `/api/permissions` |

---

*Module **02 - Patient** — Projet GestionPatients — 2026*

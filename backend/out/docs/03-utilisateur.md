

# 👤 Module 03 — Utilisateur

Documentation du module de gestion des utilisateurs.

**Base URL** : `http://localhost:8080`

**🔒 Toutes les routes nécessitent un token JWT + permissions.**

---

## 📑 Sommaire

- [Vue d'ensemble](#-vue-densemble)
- [Permissions requises](#-permissions-requises)
- [`GET /api/utilisateurs`](#-get-apiutilisateurs)
- [`GET /api/utilisateurs/{id}`](#-get-apiutilisateursid)
- [`PUT /api/utilisateurs/{id}`](#-put-apiutilisateursid)
- [`DELETE /api/utilisateurs/{id}`](#-delete-apiutilisateursid)
- [`PATCH /api/utilisateurs/{id}/actif`](#-patch-apiutilisateursidactif)
- [Codes HTTP](#-codes-http)
- [Notes techniques](#-notes-techniques)

---

## 🎯 Vue d'ensemble

Le module **Utilisateur** permet à l'**administrateur** de :

- Voir tous les utilisateurs
- Voir le détail d'un utilisateur
- Modifier un utilisateur (nom, email, rôle, structure…)
- Activer / désactiver un compte
- Supprimer un utilisateur

> ⚠️ Le mot de passe **n'est jamais renvoyé** dans les réponses.

---

## 🛡️ Permissions requises

| Route | Permission |
|---|---|
| `GET /api/utilisateurs` | `utilisateur.lire` |
| `GET /api/utilisateurs/{id}` | `utilisateur.lire` |
| `PUT /api/utilisateurs/{id}` | `utilisateur.modifier` |
| `DELETE /api/utilisateurs/{id}` | `utilisateur.supprimer` |
| `PATCH /api/utilisateurs/{id}/actif` | `utilisateur.modifier` |

---

## 🔹 `GET /api/utilisateurs`

Renvoie **tous les utilisateurs**.

### Requête

**Headers** : `Authorization: Bearer <token>`

### Réponse succès — `200 OK`

```json
[
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
    "derniere_connexion": "2026-09-16T12:11:56.9767894"
  },
  {
    "id_utilisateur": 2,
    "username": "drhouse",
    "nom": "Dr House",
    "role": "medecin",
    "actif": true
  }
]
```

---

## 🔹 `GET /api/utilisateurs/{id}`

Renvoie un seul utilisateur par son ID.

### Requête

**URL** : `GET /api/utilisateurs/2`

**Headers** : `Authorization: Bearer <token>`

### Réponse succès — `200 OK`

```json
{
  "id_utilisateur": 2,
  "username": "drhouse",
  "nom": "Dr House",
  "email": "house@hopital.sn",
  "telephone": "771111111",
  "role": "medecin",
  "id_structure": 1,
  "actif": true,
  "date_creation": "2026-09-16T10:00:00.0000000",
  "derniere_connexion": null
}
```

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `404` | `{"error":"Utilisateur introuvable"}` | Aucun utilisateur avec cet ID |

---

## 🔹 `PUT /api/utilisateurs/{id}`

Modifie un utilisateur existant.

> ⚠️ Le mot de passe **n'est PAS modifié ici**.

### Requête

**URL** : `PUT /api/utilisateurs/2`

**Headers** :

```http
Authorization: Bearer <token>
Content-Type: application/json
```

### Champs

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `nom` | string | ❌ | Nom complet |
| `email` | string | ❌ | Adresse e-mail |
| `telephone` | string | ❌ | Téléphone |
| `role` | string | ❌ | Nouveau rôle |
| `id_structure` | int | ❌ | Nouvelle structure |
| `actif` | boolean | ❌ | Activer/désactiver |

> 💡 Les champs omis conservent leur valeur actuelle.

### Body (JSON)

```json
{
  "nom": "Dr House Modifié",
  "email": "house.new@hopital.sn",
  "telephone": "782222222",
  "role": "medecin",
  "id_structure": 1,
  "actif": true
}
```

### Réponse succès — `200 OK`

Renvoie l'utilisateur mis à jour **sans le mot de passe**.

```json
{
  "id_utilisateur": 2,
  "username": "drhouse",
  "nom": "Dr House Modifié",
  "..."
}
```

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `404` | `{"error":"Utilisateur introuvable"}` | ID inexistant |
| `500` | `{"error":"Echec de la mise a jour"}` | Erreur SQL |

---

## 🔹 `DELETE /api/utilisateurs/{id}`

Supprime un utilisateur.

### Requête

**URL** : `DELETE /api/utilisateurs/2`

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
| `404` | `{"error":"Introuvable"}` | ID inexistant |

> 💡 Pour « désactiver » sans supprimer, préfère `PATCH .../actif`.

---

## 🔹 `PATCH /api/utilisateurs/{id}/actif`

Active ou désactive un compte utilisateur.

### Requête

**URL** : `PATCH /api/utilisateurs/2/actif`

**Headers** :

```http
Authorization: Bearer <token>
Content-Type: application/json
```

### Body (JSON)

```json
{
  "actif": false
}
```

### Réponse succès — `200 OK`

```json
{
  "message": "Statut mis a jour"
}
```

### Effet

Si `actif = false`, l'utilisateur ne pourra plus se connecter :

```text
// POST /api/auth/login → réponse

403 Forbidden

{
  "error": "Compte desactive"
}
```

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `404` | `{"error":"Introuvable"}` | ID inexistant |

---

## 📊 Codes HTTP

| Code | Signification | Quand il apparaît |
|---|---|---|
| `200` | OK | Lecture ou modification réussie |
| `401` | Unauthorized | Token manquant ou invalide |
| `403` | Forbidden | Permission refusée |
| `404` | Not Found | Utilisateur inexistant |
| `500` | Internal Server Error | Erreur SQL |

---

## 📌 Notes techniques

| Sujet | Détail |
|---|---|
| **Mot de passe** | Jamais renvoyé dans les réponses |
| **Rôle** | Modifiable via `PUT` (doit être dans la liste valide) |
| **Désactivation** | Préférée à la suppression pour préserver l'historique |
| **Permissions** | Modifiables par l'admin via `/api/permissions` |

### Créer un utilisateur (admin)

```javascript
const API_URL = "http://localhost:8080";

function getToken() {
  return localStorage.getItem("token");
}

// --- Créer un utilisateur (POST) ---
async function creerUtilisateur(utilisateur) {
  const res = await fetch(`${API_URL}/api/utilisateurs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`
    },
    body: JSON.stringify(utilisateur)
  });

  if (!res.ok) {
    throw new Error((await res.json()).error);
  }

  return await res.json();
}

// Exemple d'utilisation
creerUtilisateur({
  username: "drhouse",
  mot_de_passe: "house123",
  nom: "Dr House",
  email: "house@hopital.sn",
  telephone: "771111111",
  role: "medecin",
  id_structure: 1
});
```

### Lister tous les utilisateurs

```javascript
async function listerUtilisateurs() {
  const res = await fetch(`${API_URL}/api/utilisateurs`, {
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

### Modifier un utilisateur

```javascript
async function modifierUtilisateur(id, modifications) {
  const res = await fetch(`${API_URL}/api/utilisateurs/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`
    },
    body: JSON.stringify(modifications)
  });

  if (!res.ok) {
    throw new Error((await res.json()).error);
  }

  return await res.json();
}

// Exemple : changer l'email et le téléphone
modifierUtilisateur(2, {
  email: "newemail@hopital.sn",
  telephone: "772222222"
});
```

### Activer/Désactiver un compte

```javascript
async function toggleActivation(id, actif) {
  const res = await fetch(`${API_URL}/api/utilisateurs/${id}/actif`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`
    },
    body: JSON.stringify({ actif })
  });

  if (!res.ok) {
    throw new Error((await res.json()).error);
  }

  return await res.json();
}

// Désactiver un utilisateur
toggleActivation(2, false);
```

---

## 🔄 Récapitulatif des routes

| Méthode | URL | Action | Permission |
|---|---|---|---|
| `GET` | `/api/utilisateurs` | Liste tous les utilisateurs | `utilisateur.lire` |
| `GET` | `/api/utilisateurs/{id}` | Détail d'un utilisateur | `utilisateur.lire` |
| `POST` | `/api/utilisateurs` | Créer un utilisateur | `utilisateur.creer` |
| `PUT` | `/api/utilisateurs/{id}` | Modifier un utilisateur | `utilisateur.modifier` |
| `DELETE` | `/api/utilisateurs/{id}` | Supprimer un utilisateur | `utilisateur.supprimer` |
| `PATCH` | `/api/utilisateurs/{id}/actif` | Activer/Désactiver | `utilisateur.modifier` |

---

*Module **03 - Utilisateur** — Projet GestionPatients — 2026*

```markdown
# 🔐 Module 01 — Authentification

Documentation des endpoints d'authentification de l'API **GestionPatients**.

**Base URL** : `http://localhost:8080`


## 📑 Sommaire

- [Vue d'ensemble](#-vue-densemble)
- [Modèle Utilisateur](#-modèle-utilisateur)
- [`POST /api/auth/register`](#-post-apiauthregister)
- [`POST /api/auth/login`](#-post-apiauthlogin)
- [Codes HTTP](#-codes-http)
- [Format des erreurs](#-format-des-erreurs)



## 🎯 Vue d'ensemble

Le module d'authentification permet de :

- **Créer un compte utilisateur** → `POST /api/auth/register`
- **Se connecter** → `POST /api/auth/login`

**Sécurité** : les mots de passe sont hashés avec **BCrypt** (coût 12) avant stockage. Le mot de passe en clair n'est jamais enregistré ni renvoyé par l'API.

---

## 📋 Modèle Utilisateur

| Champ | Type | Description | Renvoyé |
|---|---|---|---|
| `id_utilisateur` | int | Identifiant unique (généré) | ✅ |
| `username` | string | Identifiant de connexion (unique) | ✅ |
| `mot_de_passe` | string | Hash BCrypt | ❌ |
| `nom` | string | Nom complet | ✅ |
| `email` | string | Adresse e-mail | ✅ |
| `telephone` | string | Numéro de téléphone | ✅ |
| `role` | string | `administrateur` · `agent_accueil` · `pharmacien` · `medecin` | ✅ |
| `id_structure` | int | FK vers la table Structure | ✅ |
| `actif` | boolean | `true` = compte utilisable | ✅ |
| `date_creation` | string | Date de création (ISO 8601) | ✅ |
| `derniere_connexion` | string / null | Dernière connexion réussie | ✅ |

---

## 🔹 `POST /api/auth/register`

Crée un nouveau compte utilisateur.

### Requête

| Champ | Type | Obligatoire | Contrainte |
|---|---|---|---|
| `username` | string | ✅ | Non vide, unique |
| `mot_de_passe` | string | ✅ | Minimum 4 caractères |
| `nom` | string | ✅ | — |
| `email` | string | ❌ | — |
| `telephone` | string | ❌ | — |
| `role` | string | ✅ | Voir valeurs ci-dessus |
| `id_structure` | int | ✅ | Doit exister en base |

**Body (JSON)**

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

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"username obligatoire"}` | Champ `username` manquant ou vide |
| `400` | `{"error":"mot de passe trop court (min 4)"}` | Mot de passe < 4 caractères |
| `400` | `{"error":"role obligatoire"}` | Champ `role` manquant |
| `400` | `{"error":"id_structure obligatoire"}` | `id_structure` ≤ 0 |
| `409` | `{"error":"Cet username est deja pris"}` | Username déjà utilisé |
| `500` | `{"error":"..."}` | Erreur serveur |

---

## 🔹 `POST /api/auth/login`

Authentifie un utilisateur existant.

### Requête

| Champ | Type | Obligatoire |
|---|---|---|
| `username` | string | ✅ |
| `mot_de_passe` | string | ✅ |

**Body (JSON)**

```json
{
  "username": "danis",
  "mot_de_passe": "danis123"
}
```

### Réponse succès — `200 OK`

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

> 📌 `derniere_connexion` est mis à jour à chaque login réussi.

### Erreurs

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"username et mot_de_passe obligatoires"}` | Champ manquant |
| `401` | `{"error":"Identifiants invalides"}` | Username inconnu **ou** mauvais mot de passe |
| `403` | `{"error":"Compte desactive"}` | Compte désactivé (`actif = false`) |
| `500` | `{"error":"..."}` | Erreur serveur |

> 🔒 Le message `Identifiants invalides` est volontairement générique pour ne pas révéler si le username existe.

---

## 📊 Codes HTTP

| Code | Signification | Quand il apparaît |
|---|---|---|
| `200` | OK | Login réussi |
| `201` | Created | Compte créé avec succès |
| `400` | Bad Request | Champ manquant ou invalide |
| `401` | Unauthorized | Identifiants incorrects |
| `403` | Forbidden | Compte désactivé |
| `409` | Conflict | Username déjà utilisé |
| `500` | Internal Server Error | Erreur serveur |

---

## ❌ Format des erreurs

Toutes les erreurs respectent le même format JSON :

```json
{ "error": "Message d'erreur lisible" }
```

---

## 📌 Notes techniques

| Sujet | Détail |
|---|---|
| **Hashage** | BCrypt coût 12 |
| **Longueur du hash** | 60 caractères |
| **Préfixe du hash** | `$2a$12$...` |
| **Sel** | Généré automatiquement par BCrypt |
| **Comparaison** | `BCrypt.checkpw(plain, hash)` |
| **Dernière connexion** | Mise à jour automatique après login réussi |

---

*Module **01 - Authentification** — Projet GestionPatients — 2026*
```
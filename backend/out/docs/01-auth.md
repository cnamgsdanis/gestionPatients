# Module 01 — Authentification

Documentation du module d'authentification et de gestion des mots de passe.

**Base URL** : `http://localhost:8080`

Le module Patient est documenté dans [02-patient.md](./02-patient.md).

---

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Modèle Utilisateur](#modèle-utilisateur)
- [Rôles disponibles](#rôles-disponibles)
- [`POST /api/auth/register`](#post-apiauthregister)
- [`POST /api/auth/login`](#post-apiauthlogin)
- [`POST /api/auth/logout`](#post-apiauthlogout)
- [`PUT /api/auth/change-password`](#put-apiauthchange-password)
- [`POST /api/auth/reset-password`](#post-apiauthreset-password)
- [Codes HTTP](#codes-http)
- [Flux d'authentification JWT](#flux-dauthentification-jwt)
- [Exemples frontend](#exemples-frontend-fetch)

---

## Vue d'ensemble

Le module **Authentification** gère :

- **Inscription** — création de nouveaux comptes
- **Connexion** — génération de tokens JWT
- **Déconnexion** — confirmation de suppression du token côté client
- **Changement de mot de passe** — par l'utilisateur lui-même
- **Réinitialisation de mot de passe** — par un administrateur

### Sécurité

- **BCrypt** — hash sécurisé des mots de passe (sel automatique)
- **JWT** — token avec expiration d'1 heure
- **Permissions** — contrôle d'accès granulaire

---

## Modèle Utilisateur

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

## Rôles disponibles

| Rôle | Description | Permissions par défaut |
|---|---|---|
| `administrateur` | Super admin | Toutes |
| `agent_accueil` | Agent hospitalier | patient.*, prestation.*, structure.lire |
| `medecin` | Médecin | patient.lire, prestation.*, ordonnance.* |
| `pharmacien` | Pharmacien | patient.lire, ordonnance.lire/delivrer |
| `directeur_structure` | Directeur d'établissement | patient.lire, utilisateur.lire, prestation.lire |
| `caissier_structure` | Caissier | patient.lire, prestation.lire |

---

## `POST /api/auth/register`

Crée un nouveau compte utilisateur.

**Headers** : `Content-Type: application/json`

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `username` | string | ✅ | Identifiant unique |
| `mot_de_passe` | string | ✅ | Minimum 4 caractères |
| `nom` | string | ✅ | Nom complet |
| `email` | string | ❌ | Adresse e-mail |
| `telephone` | string | ❌ | Numéro de téléphone |
| `role` | string | ✅ | Voir liste des rôles |
| `id_structure` | int | ✅ | ID d'une structure existante |

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

**201** : utilisateur créé (sans `mot_de_passe`).

| Code | Body | Cause |
|---|---|---|
| `400` | `{"error":"username obligatoire"}` | Champ `username` manquant |
| `400` | `{"error":"mot de passe trop court (min 4)"}` | Mot de passe < 4 caractères |
| `400` | `{"error":"role obligatoire"}` | Champ `role` manquant |
| `400` | `{"error":"role invalide"}` | Rôle non reconnu |
| `400` | `{"error":"id_structure obligatoire"}` | `id_structure` ≤ 0 |
| `409` | `{"error":"Cet username est deja pris"}` | Username déjà utilisé |

---

## `POST /api/auth/login`

Authentifie un utilisateur et génère un token JWT.

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
    "nom": "Administrateur",
    "role": "administrateur",
    "actif": true
  }
}
```

| Code | Body | Cause |
|---|---|---|
| `400` | `username et mot_de_passe obligatoires` | Champ manquant |
| `401` | `Identifiants invalides` | Username ou mot de passe incorrect |
| `403` | `Compte desactive` | `actif = false` |

---

## `POST /api/auth/logout`

Header : `Authorization: Bearer <token>`

**200** : `{"message":"Deconnecte. Supprimez votre token cote client."}`

---

## `PUT /api/auth/change-password`

L'utilisateur connecté change son propre mot de passe.

```json
{
  "ancien": "danis123",
  "nouveau": "nouveauMotDePasse456"
}
```

**200** : `{"message":"Mot de passe modifie"}`

---

## `POST /api/auth/reset-password`

Admin uniquement. Permission : `utilisateur.modifier`.

```json
{
  "id_utilisateur": 5,
  "nouveau": "motDePasseTemporaire123"
}
```

**200** : `{"message":"Mot de passe reinitialise"}`

---

## Codes HTTP

| Code | Signification |
|---|---|
| `200` | OK |
| `201` | Compte créé |
| `400` | Champ manquant ou invalide |
| `401` | Identifiants / token invalide |
| `403` | Compte désactivé ou permission refusée |
| `404` | Utilisateur inexistant |
| `409` | Username déjà pris |
| `500` | Erreur serveur |

---

## Flux d'authentification JWT

```text
1. Client → POST /api/auth/login
2. Serveur → vérifie BCrypt, génère JWT (1 h)
3. Serveur → { token, user }
4. Client → Authorization: Bearer <token>
```

---

*Module 01 — Authentification — GestionPatients — 2026*

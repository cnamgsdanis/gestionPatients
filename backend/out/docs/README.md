📄 Fichier 1/5 — docs/api/README.md
markdown

# 📘 API GestionPatients — Index général

Documentation complète de l'API REST du projet **GestionPatients**.

**Base URL** : `http://localhost:8080`

**Format d'échange** : JSON (UTF-8)

**Content-Type** : `application/json` (obligatoire pour POST / PUT / PATCH)

---

## 📑 Sommaire des modules

| # | Module | Fichier | Description |
|---|---|---|---|
| 01 | 🔐 Authentification | [01-auth.md](./01-auth.md) | Inscription, connexion, JWT |
| 02 | 🧑‍⚕️ Patient | [02-patient.md](./02-patient.md) | Gestion des patients |
| 03 | 👤 Utilisateur | [03-utilisateur.md](./03-utilisateur.md) | CRUD utilisateurs (admin) |
| 04 | 🎛️ Permission | [04-permission.md](./04-permission.md) | Permissions dynamiques par rôle |

---

## 🔒 Authentification

Toutes les routes **sauf** `POST /api/auth/register` et `POST /api/auth/login`
nécessitent un **token JWT** dans le header :

Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
text


### Comment obtenir un token ?

1. `POST /api/auth/login` avec username + mot de passe
2. La réponse contient un champ `token`
3. Utilise ce token dans le header `Authorization` des requêtes suivantes

### Durée de vie

Le token **expire au bout d'1 heure**. Après expiration, refais un login.

---

## 🛡️ Système de permissions

L'accès aux routes est contrôlé par des **permissions** (et non des rôles).

Utilisateur → a un RÔLE → le rôle a des PERMISSIONS → l'action exige une PERMISSION
text


### Exemples de permissions

| Code | Description |
|---|---|
| `patient.lire` | Voir la liste et le détail des patients |
| `patient.creer` | Créer un patient |
| `patient.modifier` | Modifier un patient |
| `patient.supprimer` | Supprimer un patient |
| `utilisateur.lire` | Lister les utilisateurs |
| `utilisateur.modifier` | Modifier un utilisateur |
| `utilisateur.supprimer` | Supprimer un utilisateur |
| `permission.lire` | Voir les permissions des rôles |
| `permission.gerer` | Modifier les permissions |

**L'administrateur peut modifier ces permissions en direct** via
`POST /api/permissions/role/{role}/{code}` **sans recompiler l'API**.

---

## 📊 Codes HTTP utilisés

| Code | Signification | Quand il apparaît |
|---|---|---|
| `200` | OK | Lecture ou modification réussie |
| `201` | Created | Ressource créée avec succès |
| `400` | Bad Request | Champ manquant ou invalide |
| `401` | Unauthorized | Token manquant ou invalide |
| `403` | Forbidden | Permission refusée ou compte désactivé |
| `404` | Not Found | Ressource inexistante |
| `405` | Method Not Allowed | Méthode HTTP incorrecte |
| `409` | Conflict | Conflit (username déjà pris) |
| `500` | Internal Server Error | Erreur serveur |

---

## ❌ Format standard des erreurs

Toutes les erreurs respectent le même format JSON :

```json
{ "error": "Message d'erreur lisible" }

Pour les refus de permission :
json

{
  "error": "Permission refusee : patient.supprimer",
  "role": "medecin"
}

🎯 Flux typique d'une requête protégée
text

1. Client → POST /api/auth/login
2. Serveur → renvoie { token, user }
3. Client → GET /api/patients
            Header: Authorization: Bearer <token>
4. Serveur → vérifie la signature + expiration du token
5. Serveur → lit le rôle depuis le token
6. Serveur → vérifie que le rôle a la permission "patient.lire"
7. Serveur → renvoie la liste

Documentation du projet GestionPatients — 2026
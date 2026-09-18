# API GestionPatients — Index general

Documentation complete de l'API REST du projet **GestionPatients**.

**Base URL** : `http://localhost:8080`

**Format d'echange** : JSON (UTF-8)

**Content-Type** : `application/json` (obligatoire pour POST / PUT / PATCH)

---

## Sommaire des modules

| # | Module | Fichier | Description |
|---|---|---|---|
| 01 | Authentification | [01-auth.md](./01-auth.md) | Inscription, connexion, JWT |
| 02 | Patient | [02-patient.md](./02-patient.md) | CRUD + recherche NAG (INT) |
| 03 | Utilisateur | [03-utilisateur.md](./03-utilisateur.md) | CRUD utilisateurs (admin) |
| 04 | Permission | [04-permission.md](./04-permission.md) | Permissions dynamiques par role |

Voir aussi : [`../API.md`](../API.md) (vue d'ensemble) et [`../GUIDE.md`](../GUIDE.md) (installation / Postman).

---

## Authentification

Toutes les routes **sauf** `POST /api/auth/register` et `POST /api/auth/login`
necessitent un **token JWT** :

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

1. `POST /api/auth/login` avec username + mot de passe
2. La reponse contient `token` + `user`
3. Reutiliser le token (expire au bout d'**1 heure**)

---

## Systeme de permissions

```text
Utilisateur → ROLE → PERMISSIONS → l'action exige une PERMISSION
```

| Code | Description |
|---|---|
| `patient.lire` | Voir / rechercher les patients |
| `patient.creer` | Creer un patient |
| `patient.modifier` | Modifier un patient |
| `patient.supprimer` | Supprimer un patient |
| `utilisateur.lire` | Lister les utilisateurs |
| `utilisateur.modifier` | Modifier un utilisateur |
| `utilisateur.supprimer` | Supprimer un utilisateur |
| `permission.lire` | Voir les permissions des roles |
| `permission.gerer` | Modifier les permissions |

---

## Points cles Patient (a jour)

- `fonds` = niveau **1–4** (pas un montant)
- `matricule_nag` = **INT** auto, **exactement 10 chiffres** (chiffres uniquement, pas de préfixe imposé)
- Recherche : `GET /api/patients/nag/{nag}`
- `id_assure_principal` invalide → **400** clair

---

## Codes HTTP

| Code | Signification |
|---|---|
| `200` | OK |
| `201` | Created |
| `400` | Bad Request |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | Not Found |
| `405` | Method Not Allowed |
| `409` | Conflict |
| `500` | Internal Server Error |

---

## Format des erreurs

```json
{ "error": "Message d'erreur lisible" }
```

Permission refusee :

```json
{
  "error": "Permission refusee : patient.supprimer",
  "role": "medecin"
}
```

---

*Documentation du projet GestionPatients — 2026*

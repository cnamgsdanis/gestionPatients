Voici la version **propre et valide en Markdown** de ton `04-permission.md`. J’ai corrigé les échappements `\`, les tableaux, les titres, les blocs JSON, les requêtes HTTP et l’arborescence, sans changer le contenu fonctionnel.

````markdown
# 🎛️ Module 04 — Permission

Documentation du système de **permissions dynamiques**.

**Base URL** : `http://localhost:8080`

> 🔒 Toutes les routes nécessitent un token JWT + permissions.

---

## 📑 Sommaire

- [Vue d'ensemble](#-vue-densemble)
- [Modèle Permission](#-modèle-permission)
- [Permissions de base](#-permissions-de-base)
- [Permissions par défaut](#-permissions-par-défaut)
- [`GET /api/permissions`](#-get-apipermissions)
- [`GET /api/permissions/role/{role}`](#-get-apipermissionsrolerole)
- [`GET /api/permissions/matrix`](#-get-apipermissionsmatrix)
- [`POST /api/permissions/role/{role}/{code}`](#-post-apipermissionsrolerolecode)
- [`DELETE /api/permissions/role/{role}/{code}`](#-delete-apipermissionsrolerolecode)
- [Codes HTTP](#-codes-http)
- [Scénario complet](#-scénario-complet--donner-une-permission)
- [Notes techniques](#-notes-techniques)
- [Récap des 5 fichiers](#-récap-des-5-fichiers)
- [Structure finale](#-structure-finale)

---

## 🎯 Vue d'ensemble

Le module Permission permet à l'**administrateur** de gérer **qui a le droit de faire quoi**, **sans recompiler l'API**.

### Principe

```text
Utilisateur
    ↓
   RÔLE
    ↓
PERMISSIONS
    ↓
L'action exige une PERMISSION
````

### Exemple

* L'utilisateur `drhouse` a le rôle `medecin`.
* Le rôle `medecin` a la permission `patient.lire`.
* La route `GET /api/patients` exige `patient.lire`.
* ✅ `drhouse` peut lire les patients.

**Pour donner au rôle `medecin` la permission `patient.supprimer`, il suffit d'appeler :**

```http
POST /api/permissions/role/medecin/patient.supprimer
```

Le changement est **immédiat** grâce au rechargement du cache en mémoire.

---

## 📋 Modèle Permission

| Champ           | Type   | Description                          |
| --------------- | ------ | ------------------------------------ |
| `id_permission` | int    | Identifiant unique                   |
| `code`          | string | Code technique (ex: `patient.creer`) |
| `description`   | string | Description lisible                  |

---

## 📋 Permissions de base

| Code                    | Description                             |
| ----------------------- | --------------------------------------- |
| **Patients**            |                                         |
| `patient.lire`          | Voir la liste et le détail des patients |
| `patient.creer`         | Créer un patient                        |
| `patient.modifier`      | Modifier un patient                     |
| `patient.supprimer`     | Supprimer un patient                    |
| **Utilisateurs**        |                                         |
| `utilisateur.lire`      | Voir la liste des utilisateurs          |
| `utilisateur.creer`     | Créer un utilisateur                    |
| `utilisateur.modifier`  | Modifier un utilisateur                 |
| `utilisateur.supprimer` | Supprimer un utilisateur                |
| **Permissions**         |                                         |
| `permission.lire`       | Voir les permissions des rôles          |
| `permission.gerer`      | Modifier les permissions des rôles      |
| **Prestations**         |                                         |
| `prestation.lire`       | Voir les prestations                    |
| `prestation.creer`      | Créer une prestation                    |
| `prestation.modifier`   | Modifier une prestation (consultation)  |
| **Examens**             |                                         |
| `examen.lire`           | Voir les examens                        |
| `examen.creer`          | Créer un examen                         |
| `examen.modifier`       | Modifier un examen                      |
| **Ordonnances**         |                                         |
| `ordonnance.lire`       | Voir les ordonnances                    |
| `ordonnance.creer`      | Créer une ordonnance                    |
| `ordonnance.delivrer`   | Délivrer les médicaments                |
| **Structures**          |                                         |
| `structure.lire`        | Voir les structures                     |
| `structure.gerer`       | Gérer les structures                    |

---

## 🎭 Permissions par défaut

| Rôle                    | Permissions                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| **administrateur**      | Toutes                                                                                                         |
| **agent_accueil**       | `patient.lire`, `patient.creer`, `patient.modifier`, `prestation.lire`, `prestation.creer`, `examen.lire`, `structure.lire`   |
| **medecin**             | `patient.lire`, `prestation.lire`, `prestation.creer`, `prestation.modifier`, `examen.lire`, `examen.creer`, `examen.modifier`, `ordonnance.lire`, `ordonnance.creer`, `structure.lire` |
| **pharmacien**          | `patient.lire`, `ordonnance.lire`, `ordonnance.delivrer`, `structure.lire`                                     |
| **directeur_structure** | `patient.lire`, `utilisateur.lire`, `prestation.lire`, `examen.lire`, `ordonnance.lire`, `structure.lire`      |
| **caissier_structure**  | `patient.lire`, `prestation.lire`, `examen.lire`, `structure.lire`                                             |

> ⚠️ Ni `prestation.supprimer` ni `examen.supprimer` n'existent : une
> consultation ou un examen ne peuvent jamais être supprimés, par aucun rôle
> (voir le module Dossier Patient — CRÉER/LIRE/MODIFIER uniquement).

---

## 🔹 `GET /api/permissions`

Liste toutes les permissions existantes.

### Requête

**Headers :**

```http
Authorization: Bearer <token>
```

**Permission requise :** `permission.lire`

### Réponse succès — `200 OK`

```json
[
  {
    "id_permission": 1,
    "code": "patient.lire",
    "description": "Voir la liste..."
  },
  {
    "id_permission": 2,
    "code": "patient.creer",
    "description": "Creer un patient"
  },
  {
    "id_permission": 3,
    "code": "patient.modifier",
    "description": "Modifier un patient"
  }
]
```

---

## 🔹 `GET /api/permissions/role/{role}`

Liste les permissions d'un rôle spécifique.

### Requête

**URL :**

```http
GET /api/permissions/role/medecin
```

**Headers :**

```http
Authorization: Bearer <token>
```

**Permission requise :** `permission.lire`

### Réponse succès — `200 OK`

```json
{
  "role": "medecin",
  "permissions": [
    "patient.lire",
    "prestation.lire",
    "prestation.creer",
    "ordonnance.lire",
    "ordonnance.creer",
    "structure.lire"
  ]
}
```

---

## 🔹 `GET /api/permissions/matrix`

Renvoie la matrice complète de tous les rôles avec leurs permissions.

### Requête

**URL :**

```http
GET /api/permissions/matrix
```

**Headers :**

```http
Authorization: Bearer <token>
```

**Permission requise :** `permission.lire`

### Réponse succès — `200 OK`

```json
{
  "administrateur": [
    "patient.lire",
    "patient.creer",
    "..."
  ],
  "medecin": [
    "patient.lire",
    "ordonnance.creer",
    "..."
  ],
  "pharmacien": [
    "patient.lire",
    "ordonnance.delivrer",
    "..."
  ],
  "agent_accueil": [
    "patient.lire",
    "patient.creer",
    "..."
  ],
  "directeur_structure": [
    "patient.lire",
    "utilisateur.lire",
    "..."
  ],
  "caissier_structure": [
    "patient.lire",
    "prestation.lire",
    "..."
  ]
}
```

---

## 🔹 `POST /api/permissions/role/{role}/{code}`

Ajoute une permission à un rôle.

### Requête

**URL :**

```http
POST /api/permissions/role/medecin/patient.supprimer
```

**Headers :**

```http
Authorization: Bearer <token>
```

**Body :** aucun

**Permission requise :** `permission.gerer`

### Réponse succès — `200 OK`

```json
{
  "message": "Permission ajoutee"
}
```

### Effet immédiat

Le prochain appel de :

```http
DELETE /api/patients/{id}
```

par un médecin fonctionnera.

### Erreurs

| Code  | Body / Cause                                             | Description                |
| ----- | -------------------------------------------------------- | -------------------------- |
| `403` | `{"error":"Permission refusee : permission.gerer", ...}` | Pas admin                  |
| `404` | `{"error":"Permission inconnue : xxx"}`                  | Code permission inexistant |

---

## 🔹 `DELETE /api/permissions/role/{role}/{code}`

Retire une permission à un rôle.

### Requête

**URL :**

```http
DELETE /api/permissions/role/medecin/patient.supprimer
```

**Headers :**

```http
Authorization: Bearer <token>
```

**Body :** aucun

**Permission requise :** `permission.gerer`

### Réponse succès — `200 OK`

```json
{
  "message": "Permission retiree"
}
```

### Effet immédiat

Le prochain appel de :

```http
DELETE /api/patients/{id}
```

par un médecin renverra `403`.

### Erreurs

| Code  | Body / Cause                                             | Description                          |
| ----- | -------------------------------------------------------- | ------------------------------------ |
| `403` | `{"error":"Permission refusee : permission.gerer", ...}` | Pas admin                            |
| `404` | `{"error":"Permission inconnue : xxx"}`                  | Code inexistant                      |
| `404` | `{"error":"Non trouvee"}`                                | Le rôle n'avait pas cette permission |

---

## 📊 Codes HTTP

| Code  | Signification | Quand il apparaît               |
| ----- | ------------- | ------------------------------- |
| `200` | OK            | Lecture ou modification réussie |
| `401` | Unauthorized  | Token manquant ou invalide      |
| `403` | Forbidden     | Permission refusée              |
| `404` | Not Found     | Permission ou rôle inexistant   |

---

## 🎬 Scénario complet — donner une permission

**Objectif :** donner au rôle `medecin` le droit de supprimer des patients.

### 1. Vérifier les permissions actuelles

```http
GET /api/permissions/role/medecin
```

**Réponse :** la liste ne contient pas `patient.supprimer`.

---

### 2. Le médecin essaie de supprimer

```http
DELETE /api/patients/1
Authorization: Bearer <token_medecin>
```

**Réponse :**

```text
403 Forbidden
```

```json
{
  "error": "Permission refusee : patient.supprimer",
  "role": "medecin"
}
```

---

### 3. L'administrateur ajoute la permission

```http
POST /api/permissions/role/medecin/patient.supprimer
Authorization: Bearer <token_admin>
```

**Réponse :**

```text
200 OK
```

```json
{
  "message": "Permission ajoutee"
}
```

---

### 4. Le médecin réessaie

```http
DELETE /api/patients/1
Authorization: Bearer <token_medecin>
```

**Réponse :**

```text
200 OK
```

```json
{
  "message": "Supprime"
}
```

🎉 Le changement a pris effet instantanément.

---

## 📌 Notes techniques

| Sujet                   | Détail                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| **Stockage**            | Tables `Permission` + `RolePermission`                            |
| **Cache**               | `PermissionService` (mémoire vive) rechargé à chaque modification |
| **Rechargement**        | Automatique après chaque `POST` ou `DELETE`                       |
| **Rôles valides**       | Ceux de la contrainte SQL `CK_Utilisateur_role`                   |
| **Ajout de permission** | Aucun redémarrage ni recompilation nécessaire                     |

---

**Module 04 — Permission — Projet GestionPatients — 2026**

---

## 📋 Récap des 5 fichiers

| # | Fichier             | Emplacement                  |
| - | ------------------- | ---------------------------- |
| 1 | `README.md`         | `docs/api/README.md`         |
| 2 | `01-auth.md`        | `docs/api/01-auth.md`        |
| 3 | `02-patient.md`     | `docs/api/02-patient.md`     |
| 4 | `03-utilisateur.md` | `docs/api/03-utilisateur.md` |
| 5 | `04-permission.md`  | `docs/api/04-permission.md`  |

---

## 📁 Structure finale

```text
gestionPatients/
├── docs/
│   └── api/
│       ├── README.md
│       ├── 01-auth.md
│       ├── 02-patient.md
│       ├── 03-utilisateur.md
│       └── 04-permission.md
├── backend/
├── MPD/
├── frontend/
└── README.md
```

---

**Copie chaque fichier dans son emplacement exact.**

Une fois fait, tu auras une documentation **professionnelle** qui couvre tout le système.

---

> 🚀 **Module 04 — Permission terminé.**
>
> Prochain module : **Structure** ou **Frontend**.

````

Tu peux copier **uniquement le contenu du bloc ci-dessus** dans :

```text
C:\stage\gestionPatients\docs\api\04-permission.md
````


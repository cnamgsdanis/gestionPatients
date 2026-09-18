# 📚 API GestionPatients - Référence complète

Documentation complète de toutes les API REST disponibles dans le projet GestionPatients.

**Base URL** : `http://localhost:8080`

**Version** : 1.0

**Date** : 2026

---

## 📖 Table des matières

1. [Authentification](#1-authentification) - `/api/auth`
2. [Patients](#2-patients) - `/api/patients`
3. [Utilisateurs](#3-utilisateurs) - `/api/utilisateurs`
4. [Permissions](#4-permissions) - `/api/permissions`

---

## 🔐 Authentification

Toutes les routes (sauf `register` et `login`) nécessitent un token JWT dans le header :

```http
Authorization: Bearer <token>
```

---

## 1. Authentification

**Base** : `/api/auth`

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/register` | Créer un compte utilisateur | ❌ |
| `POST` | `/login` | Se connecter (génère un JWT) | ❌ |
| `POST` | `/logout` | Se déconnecter | ✅ |
| `PUT` | `/change-password` | Changer son mot de passe | ✅ |
| `POST` | `/reset-password` | Réinitialiser un mot de passe (admin) | ✅ Permission: `utilisateur.modifier` |

📄 [Documentation complète](./01-auth.md)

---

## 2. Patients

**Base** : `/api/patients`

| Méthode | Endpoint | Description | Permission requise |
|---|---|---|---|
| `GET` | `/` | Liste tous les patients | `patient.lire` |
| `GET` | `/{id}` | Détail d'un patient | `patient.lire` |
| `POST` | `/` | Créer un patient | `patient.creer` |
| `PUT` | `/{id}` | Modifier un patient | `patient.modifier` |
| `DELETE` | `/{id}` | Supprimer un patient | `patient.supprimer` |

📄 [Documentation complète](./02-patient.md)

---

## 3. Utilisateurs

**Base** : `/api/utilisateurs`

| Méthode | Endpoint | Description | Permission requise |
|---|---|---|---|
| `GET` | `/` | Liste tous les utilisateurs | `utilisateur.lire` |
| `GET` | `/{id}` | Détail d'un utilisateur | `utilisateur.lire` |
| `POST` | `/` | Créer un utilisateur | `utilisateur.creer` |
| `PUT` | `/{id}` | Modifier un utilisateur | `utilisateur.modifier` |
| `DELETE` | `/{id}` | Supprimer un utilisateur | `utilisateur.supprimer` |
| `PATCH` | `/{id}/actif` | Activer/Désactiver un compte | `utilisateur.modifier` |

📄 [Documentation complète](./03-utilisateur.md)

---

## 4. Permissions

**Base** : `/api/permissions`

| Méthode | Endpoint | Description | Permission requise |
|---|---|---|---|
| `GET` | `/` | Liste toutes les permissions | `permission.lire` |
| `GET` | `/role/{role}` | Permissions d'un rôle spécifique | `permission.lire` |
| `GET` | `/matrix` | Matrice complète (tous les rôles) | `permission.lire` |
| `POST` | `/role/{role}/{code}` | Ajouter une permission à un rôle | `permission.gerer` |
| `DELETE` | `/role/{role}/{code}` | Retirer une permission d'un rôle | `permission.gerer` |

📄 [Documentation complète](./04-permission.md)

---

## 🎭 Rôles et permissions par défaut

| Rôle | Description | Permissions principales |
|---|---|---|
| `administrateur` | Super administrateur | **Toutes les permissions** |
| `agent_accueil` | Agent d'accueil hospitalier | `patient.*`, `prestation.*` |
| `medecin` | Médecin | `patient.lire`, `prestation.*`, `ordonnance.*` |
| `pharmacien` | Pharmacien | `patient.lire`, `ordonnance.lire/delivrer` |
| `directeur_structure` | Directeur d'établissement | `patient.lire`, `utilisateur.lire`, `prestation.lire` |
| `caissier_structure` | Caissier | `patient.lire`, `prestation.lire` |

> 💡 **Astuce** : Les permissions peuvent être modifiées dynamiquement via `/api/permissions/role/{role}/{code}` sans redémarrage du serveur.

---

## 📊 Codes HTTP

| Code | Signification | Usage |
|---|---|---|
| `200` | OK | Opération réussie |
| `201` | Created | Ressource créée avec succès |
| `400` | Bad Request | Données invalides ou manquantes |
| `401` | Unauthorized | Token manquant, invalide ou expiré |
| `403` | Forbidden | Permission insuffisante ou compte désactivé |
| `404` | Not Found | Ressource introuvable |
| `405` | Method Not Allowed | Méthode HTTP non supportée |
| `409` | Conflict | Conflit (ex: username déjà pris) |
| `500` | Internal Server Error | Erreur serveur |

---

## 🔑 Format des tokens JWT

### Structure du token

```json
{
  "id_utilisateur": 1,
  "role": "administrateur",
  "nom": "Administrateur",
  "exp": 1731681200
}
```

### Utilisation

```javascript
// Stockage après login
localStorage.setItem("token", data.token);

// Utilisation dans les requêtes
fetch("/api/patients", {
  headers: {
    "Authorization": `Bearer ${localStorage.getItem("token")}`
  }
});
```

### Expiration

- **Durée de vie** : 1 heure
- **Renouvellement** : Se reconnecter pour obtenir un nouveau token
- **Invalidation** : Impossible côté serveur (supprimer côté client)

---

## ❌ Format standard des erreurs

Toutes les erreurs respectent le même format JSON :

```json
{
  "error": "Message d'erreur descriptif"
}
```

Pour les erreurs de permission :

```json
{
  "error": "Permission refusee : patient.supprimer",
  "role": "medecin"
}
```

---

## 🚀 Démarrage rapide avec Postman

### 1. Créer une collection

- Nom : `GestionPatients`
- Base URL : `http://localhost:8080`

### 2. Créer des variables d'environnement

```
baseUrl = http://localhost:8080
token = (sera rempli après login)
```

### 3. Login

```http
POST {{baseUrl}}/api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "mot_de_passe": "admin123"
}
```

**Copier le token de la réponse dans la variable `token`**

### 4. Utiliser le token

Dans toutes les requêtes suivantes, ajouter le header :

```http
Authorization: Bearer {{token}}
```

---

## 💻 Exemples de code

### JavaScript (Fetch API)

```javascript
const API_URL = "http://localhost:8080";

// Helper pour récupérer le token
function getHeaders(includeContentType = false) {
  const headers = {
    "Authorization": `Bearer ${localStorage.getItem("token")}`
  };
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

// Login
async function login(username, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, mot_de_passe: password })
  });
  
  if (!res.ok) throw new Error((await res.json()).error);
  
  const data = await res.json();
  localStorage.setItem("token", data.token);
  return data;
}

// Lister les patients
async function getPatients() {
  const res = await fetch(`${API_URL}/api/patients`, {
    headers: getHeaders()
  });
  
  if (!res.ok) throw new Error((await res.json()).error);
  return await res.json();
}

// Créer un patient
async function createPatient(patient) {
  const res = await fetch(`${API_URL}/api/patients`, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify(patient)
  });
  
  if (!res.ok) throw new Error((await res.json()).error);
  return await res.json();
}
```

### Python (requests)

```python
import requests

API_URL = "http://localhost:8080"
token = None

# Login
def login(username, password):
    global token
    res = requests.post(f"{API_URL}/api/auth/login", json={
        "username": username,
        "mot_de_passe": password
    })
    res.raise_for_status()
    data = res.json()
    token = data["token"]
    return data

# Headers avec token
def get_headers():
    return {"Authorization": f"Bearer {token}"}

# Lister les patients
def get_patients():
    res = requests.get(f"{API_URL}/api/patients", headers=get_headers())
    res.raise_for_status()
    return res.json()

# Créer un patient
def create_patient(patient):
    res = requests.post(
        f"{API_URL}/api/patients",
        json=patient,
        headers=get_headers()
    )
    res.raise_for_status()
    return res.json()
```

---

## 🔄 Flux d'utilisation typique

```text
1. POST /api/auth/login
   → Récupérer le token JWT

2. Stocker le token
   → localStorage ou variable

3. Faire des requêtes avec le token
   → Authorization: Bearer <token>

4. Gérer l'expiration
   → 401 Unauthorized → Redemander login

5. Logout
   → POST /api/auth/logout + supprimer le token local
```

---

## 🛡️ Sécurité

### Mots de passe

- **Algorithme** : BCrypt avec sel automatique
- **Rounds** : 10
- **Jamais stocké en clair** : Hash uniquement
- **Jamais renvoyé** : Absent des réponses JSON

### Tokens JWT

- **Algorithme** : HS256
- **Clé secrète** : Définie dans `JwtService`
- **Expiration** : 1 heure
- **Contenu** : id_utilisateur, role, nom, exp

### Permissions

- **Vérification côté serveur** : Chaque route protégée
- **Cache en mémoire** : `PermissionService`
- **Rechargement dynamique** : Après modification
- **Granularité** : Par action (lire, créer, modifier, supprimer)

---

## 📌 Notes importantes

1. **Token expiré** : Après 1h, redemander un login
2. **Compte désactivé** : `actif = false` → 403 Forbidden
3. **Permissions modifiables** : À chaud sans redémarrage
4. **CORS** : Non configuré par défaut (à ajouter pour production)
5. **HTTPS** : Recommandé en production
6. **Rate limiting** : Non implémenté (à ajouter)

---

## 📖 Documentation détaillée

Pour plus de détails sur chaque module, consultez :

- [01-auth.md](./01-auth.md) - Authentification complète
- [02-patient.md](./02-patient.md) - Gestion des patients
- [03-utilisateur.md](./03-utilisateur.md) - Gestion des utilisateurs
- [04-permission.md](./04-permission.md) - Système de permissions

---

## 🆘 Support

Pour toute question ou problème :

1. Consulter les fichiers de documentation détaillée
2. Vérifier les logs côté serveur (console Java)
3. Vérifier le token JWT (expiration, format)
4. Vérifier les permissions du rôle

---

*Projet GestionPatients — Documentation API — 2026*

# GestionPatients

Application de gestion de la prise en charge des assurés.

Ce projet est composé de trois parties :

- une **base de données SQL Server**
- un **backend API en Java pur** (sans framework)
- un **frontend** (à venir / en cours)

---

## ✅ Prérequis — Logiciels à installer

Avant de pouvoir compiler et lancer le projet, il faut installer les outils suivants :

| Outil                          | Version minimale | Rôle                                                                 | Lien de téléchargement                                              |
|--------------------------------|------------------|----------------------------------------------------------------------|---------------------------------------------------------------------|
| **JDK (Java Development Kit)** | 17               | Compiler (`javac`) et exécuter (`java`) le code Java                 | https://adoptium.net/                                               |
| **SQL Server**                 | 2019 ou +        | Base de données relationnelle qui stocke toutes les données          | https://www.microsoft.com/sql-server                                |
| **SSMS** (optionnel)           | 19 ou +          | Interface graphique pour administrer SQL Server                      | https://learn.microsoft.com/sql/ssms/download-sql-server-management-studio-ssms |
| **VS Code** (recommandé)       | —                | Éditeur de code (avec l'extension *Extension Pack for Java*)         | https://code.visualstudio.com/                                      |
| **Postman**                    | —                | Tester les endpoints de l'API                                        | https://www.postman.com/downloads/                                  |

> 💡 Le JDK doit être ajouté au `PATH`. Vérifie avec :
> ```bash
> java -version
> javac -version
> ```
> Tu dois voir une version **17 ou supérieure**.

---

## 📦 Bibliothèques externes (`.jar`)

Ces bibliothèques sont **obligatoires** pour compiler et exécuter le backend.
Elles doivent être placées dans le dossier `backend/lib/`.

| Bibliothèque                       | Rôle                                                                                          | Lien de téléchargement                                                              |
|------------------------------------|-----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| **mssql-jdbc-13.4.0.jre11.jar**    | Driver JDBC officiel de Microsoft. Permet à Java de communiquer avec SQL Server.              | https://learn.microsoft.com/sql/connect/jdbc/download-microsoft-jdbc-driver-for-sql-server |
| **gson-2.10.1.jar**                | Bibliothèque Google pour convertir automatiquement les objets Java en JSON et inversement.    | https://repo1.maven.org/maven2/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar     |
| **jbcrypt-0.4.jar**                | Hashage sécurisé des mots de passe avec sel automatique (utilisé pour l'authentification).    | https://repo1.maven.org/maven2/org/mindrot/jbcrypt/0.4/jbcrypt-0.4.jar              |

### Détails sur chaque bibliothèque

#### 🔌 `mssql-jdbc-13.4.0.jre11.jar` — Driver JDBC SQL Server

- **Fourni par** : Microsoft.
- **Rôle** : fait le pont entre Java et SQL Server via l'API JDBC.
- **Sans elle** : impossible de se connecter à la base → erreur `ClassNotFoundException: com.microsoft.sqlserver.jdbc.SQLServerDriver`.
- **Utilisée dans** : `db/Database.java` (chargement du driver + `DriverManager.getConnection()`).

#### 🧩 `gson-2.10.1.jar` — Conversion Java ↔ JSON

- **Fourni par** : Google.
- **Rôle** : sérialiser/désérialiser les objets Java en JSON (et inversement).
- **Utilisée dans** : `AuthController.java`, `PatientController.java`.
- **Exemple** :
  ```java
  String json = gson.toJson(patient);                 // Objet -> JSON
  Patient p  = gson.fromJson(jsonRecu, Patient.class); // JSON -> Objet
  ```

#### 🔐 `jbcrypt-0.4.jar` — Hashage sécurisé des mots de passe

- **Fourni par** : Mindrot (implémentation Java de l'algorithme BCrypt).
- **Rôle** : transformer un mot de passe en clair en une chaîne illisible et irréversible, avec un **sel aléatoire intégré**.
- **Pourquoi BCrypt plutôt que SHA-256 ?**
  - BCrypt est **lent volontairement** (coût paramétrable) → résiste aux attaques par force brute.
  - Le **sel est inclus** dans le hash généré → pas besoin de le stocker séparément.
  - C'est le standard reconnu pour les mots de passe.
- **Utilisée dans** : `service/AuthService.java`.

> 📥 **À faire une seule fois** :
> Télécharge les **trois** `.jar` et place-les dans `backend/lib/`.

---

## 📁 Arborescence du projet

```text
gestionPatients/
│
├── .vscode/                              # Config VS Code
│   └── settings.json                     # Classpath Java (jars, sourcePaths)
│
├── backend/                              # API Java (aucun framework, JDK seul)
│   ├── lib/                              # Dépendances externes (.jar)
│   │   ├── mssql-jdbc-13.4.0.jre11.jar
│   │   ├── gson-2.10.1.jar
│   │   └── jbcrypt-0.4.jar
│   │
│   ├── controller/                       # Couche HTTP
│   │   ├── AuthController.java           # Routes /api/auth/*
│   │   └── PatientController.java        # Routes /api/patients/*
│   │
│   ├── dao/                              # Couche accès aux données
│   │   ├── PatientDAO.java
│   │   └── UtilisateurDAO.java
│   │
│   ├── db/                               # Connexion à la base
│   │   └── Database.java
│   │
│   ├── model/                            # POJO (modèles)
│   │   ├── Patient.java
│   │   └── Utilisateur.java
│   │
│   ├── service/                          # Couche métier
│   │   └── AuthService.java              # Hashage / vérification BCrypt
│   │
│   ├── out/                              # Fichiers .class compilés (généré)
│   ├── index.java                        # Point d'entrée : démarre le serveur HTTP
│   └── GUIDE.md
│
├── MPD/                                  # Modèle Physique de Données
│   └── gestionpatient.sql                # Script de création de la base
│
├── frontend/                             # Interface utilisateur (à venir)
│
└── README.md                             # Ce fichier
```

---

## 🧩 Rôle de chaque fichier du backend

### `index.java` — Point d'entrée

- Contient la méthode `main`.
- Démarre le serveur HTTP intégré du JDK (`com.sun.net.httpserver.HttpServer`).
- Enregistre les routes (`/api/auth/*`, `/api/patients`).
- Configure un pool de threads pour traiter plusieurs requêtes en parallèle.

### `db/Database.java` — Connexion centralisée

- Contient l'URL JDBC, le login et le mot de passe SQL Server.
- Fournit une méthode statique `getConnection()` utilisée partout ailleurs.

### `model/Utilisateur.java` — Modèle utilisateur

- POJO représentant une ligne de la table `Utilisateur`.
- **Ne contient jamais le mot de passe en clair**, uniquement le hash BCrypt.

### `dao/UtilisateurDAO.java` — Data Access Object

- Requêtes SQL sur la table `Utilisateur`.
- Méthode clé : `findByUsername(String username)` → utilisée par l'authentification.
- Méthode : `updateDerniereConnexion(int id)`.

### `service/AuthService.java` — Logique métier BCrypt

- Contient la logique de **hashage** et **vérification**.
- Méthode `hash(String)` → renvoie un hash BCrypt.
- Méthode `verifier(String, String)` → renvoie `true`/`false`.
- Ne touche **ni au HTTP, ni au SQL**.

### `controller/AuthController.java` — Contrôleur auth

- Expose :
  - `POST /api/auth/register` → création de compte
  - `POST /api/auth/login` → connexion
- Reçoit du JSON, appelle `AuthService` + `UtilisateurDAO`, renvoie du JSON.

### `model/Patient.java`, `dao/PatientDAO.java`, `controller/PatientController.java`

- Mêmes rôles que ci-dessus, mais pour l'entité `Patient`.

### `lib/` — Bibliothèques

- Contient les `.jar` externes nécessaires à la compilation et à l'exécution.

### `.vscode/settings.json`

- Configure le Java Language Server de VS Code pour qu'il trouve les `.jar` de `lib/`.

---

## 🗄️ Base de données

### Prérequis

- SQL Server installé et démarré sur `localhost:1433`.
- Une base nommée `gestionPatients`.

### Création de la base

Exécute le script SQL dans `MPD/gestionpatient.sql` via SSMS (le plus simple).

### Configuration de la connexion

Les identifiants sont définis dans `backend/db/Database.java` :

```java
private static final String URL =
    "jdbc:sqlserver://localhost:1433;databaseName=gestionPatients;encrypt=true;trustServerCertificate=true";
private static final String USER = "sa";
private static final String PASSWORD = "votre mot de passe";
```

> ⚠️ **Important** : ces identifiants sont en dur pour le développement.
> Pour la production, il faudra les sortir dans des variables d'environnement.

### Données de démarrage (obligatoire avant le 1er register)

La table `Utilisateur` a une clé étrangère vers `Structure`. Il faut donc **au moins une structure** en base avant de créer un utilisateur :

```sql
USE gestionPatients;
GO

INSERT INTO Structure (raison_sociale, addresse, type_structure)
VALUES ('Hopital Principal', 'Dakar', 'hopital');
GO

SELECT * FROM Structure;   -- Note l'id_structure (probablement 1)
```

---

## 🚀 Compilation et exécution

### Étapes (Windows / PowerShell)

Depuis le dossier `backend/` :

```powershell
# 1. Se placer dans le dossier backend
cd backend

# 2. Nettoyer et créer le dossier de sortie
rmdir /S /Q out
mkdir out

# 3. Compiler tous les .java (index.java + tous les packages)
javac -cp "lib/mssql-jdbc-13.4.0.jre11.jar;lib/gson-2.10.1.jar;lib/jbcrypt-0.4.jar" -d out index.java controller/*.java dao/*.java db/*.java model/*.java service/*.java

# 4. Lancer le serveur
java -cp "out;lib/mssql-jdbc-13.4.0.jre11.jar;lib/gson-2.10.1.jar;lib/jbcrypt-0.4.jar" index
```

### Étapes (Linux / macOS)

```bash
cd backend
rm -rf out && mkdir -p out
javac -cp "lib/mssql-jdbc-13.4.0.jre11.jar:lib/gson-2.10.1.jar:lib/jbcrypt-0.4.jar" -d out index.java controller/*.java dao/*.java db/*.java model/*.java service/*.java
java -cp "out:lib/mssql-jdbc-13.4.0.jre11.jar:lib/gson-2.10.1.jar:lib/jbcrypt-0.4.jar" index
```

### Résultat attendu

```text
====================================
API demarree sur http://localhost:8080
  POST /api/auth/register
  POST /api/auth/login
  GET/POST/PUT/DELETE /api/patients
====================================
```

> ⚠️ **Le terminal ne revient pas au prompt** — c'est normal, le serveur tourne. Pour l'arrêter : `Ctrl+C`.

---

## 📬 Tester l'API avec Postman

### 1. Créer une collection Postman

1. Ouvre Postman → clique sur **`Collections`** (barre latérale gauche)
2. Clique sur **`+`** → nomme-la **`GestionPatients`**
3. Dans cette collection, tu vas créer 5 requêtes (voir ci-dessous)

### 2. Créer une variable d'environnement

1. En haut à droite, clique sur l'icône **👁 → `Environments` → `+`**
2. Nomme l'environnement : **`GestionPatients Local`**
3. Ajoute une variable :
   - **Variable** : `baseUrl`
   - **Initial value** : `http://localhost:8080`
   - **Current value** : `http://localhost:8080`
4. Clique sur **`Save`**, puis **sélectionne cet environnement** dans le menu déroulant en haut à droite

> ✅ Ainsi, tu pourras écrire `{{baseUrl}}/api/auth/login` au lieu de `http://localhost:8080/api/auth/login`.

---

### 3. Requête 1 — Créer un utilisateur

| Champ | Valeur |
|---|---|
| **Méthode** | `POST` |
| **URL** | `{{baseUrl}}/api/auth/register` |
| **Onglet Body** | `raw` → type **JSON** |

**Body (raw JSON)** :

```json
{
  "username": "admin",
  "mot_de_passe": "admin123",
  "nom": "Administrateur",
  "email": "admin@hopital.sn",
  "telephone": "770000000",
  "role": "administrateur",
  "id_structure": 1
}
```

**➡️ Clique sur `Send`**

**Réponse attendue (201 Created)** :

```json
{
  "id_utilisateur": 1,
  "username": "admin",
  "nom": "Administrateur",
  "email": "admin@hopital.sn",
  "telephone": "770000000",
  "role": "administrateur",
  "id_structure": 1,
  "actif": true,
  "date_creation": "2026-01-15T10:30:45.1234567",
  "derniere_connexion": null
}
```

> ✅ Le champ `mot_de_passe` **n'apparaît pas** → le hash est protégé.

---

### 4. Requête 2 — Se connecter (login)

| Champ | Valeur |
|---|---|
| **Méthode** | `POST` |
| **URL** | `{{baseUrl}}/api/auth/login` |
| **Onglet Body** | `raw` → type **JSON** |

**Body (raw JSON)** :

```json
{
  "username": "admin",
  "mot_de_passe": "admin123"
}
```

**➡️ Clique sur `Send`**

**Réponse attendue (200 OK)** :

```json
{
  "id_utilisateur": 1,
  "username": "admin",
  "role": "administrateur",
  "derniere_connexion": "2026-01-15T10:31:12.9876543",
  ...
}
```

---

### 5. Requête 3 — Lister tous les patients

| Champ | Valeur |
|---|---|
| **Méthode** | `GET` |
| **URL** | `{{baseUrl}}/api/patients` |
| **Body** | aucun |

**➡️ Clique sur `Send`**

**Réponse attendue (200 OK)** : un tableau JSON `[]` (vide au début).

---

### 6. Requête 4 — Créer un patient

| Champ | Valeur |
|---|---|
| **Méthode** | `POST` |
| **URL** | `{{baseUrl}}/api/patients` |
| **Onglet Body** | `raw` → type **JSON** |

**Body (raw JSON)** :

```json
{
  "photo_url": null,
  "prenom": "Awa",
  "nom": "Diop",
  "sex": "F",
  "contact": "770000000",
  "statut_assure": true,
  "fonds": 0,
  "matricule_nag": "NAG001"
}
```

**➡️ Clique sur `Send`**

**Réponse attendue (201 Created)** :

```json
{ "id_patient": 1 }
```

---

### 7. Requête 5 — Modifier un patient

| Champ | Valeur |
|---|---|
| **Méthode** | `PUT` |
| **URL** | `{{baseUrl}}/api/patients/1` (remplace `1` par l'ID voulu) |
| **Onglet Body** | `raw` → type **JSON** |

**Body (raw JSON)** :

```json
{
  "photo_url": null,
  "prenom": "Awa",
  "nom": "Diop",
  "sex": "F",
  "contact": "781111111",
  "statut_assure": true,
  "fonds": 5000,
  "matricule_nag": "NAG001"
}
```

**Réponse attendue (200 OK)** :

```json
{ "message": "Modifie" }
```

---

### 8. Requête 6 — Supprimer un patient

| Champ | Valeur |
|---|---|
| **Méthode** | `DELETE` |
| **URL** | `{{baseUrl}}/api/patients/1` |
| **Body** | aucun |

**Réponse attendue (200 OK)** :

```json
{ "message": "Supprime" }
```

---

## 📋 Récapitulatif des endpoints

### Authentification

| Méthode | URL                   | Description                            |
|---------|-----------------------|----------------------------------------|
| POST    | `/api/auth/register`  | Création d'un compte utilisateur       |
| POST    | `/api/auth/login`     | Connexion (username + mot de passe)    |

### Patients

| Méthode | URL                  | Description                   |
|---------|----------------------|-------------------------------|
| GET     | `/api/patients`      | Liste tous les patients       |
| GET     | `/api/patients/{id}` | Renvoie un patient par son ID |
| POST    | `/api/patients`      | Crée un nouveau patient       |
| PUT     | `/api/patients/{id}` | Modifie un patient existant   |
| DELETE  | `/api/patients/{id}` | Supprime un patient           |

---

## 🧪 Codes HTTP utilisés

| Code | Signification | Quand il apparaît |
|------|---------------|-------------------|
| **200** | OK | Lecture ou modification réussie |
| **201** | Created | Ressource créée avec succès |
| **400** | Bad Request | Champ manquant ou invalide |
| **401** | Unauthorized | Identifiants incorrects |
| **403** | Forbidden | Compte désactivé |
| **404** | Not Found | Ressource inexistante |
| **405** | Method Not Allowed | Mauvaise méthode HTTP |
| **409** | Conflict | Username déjà utilisé |
| **500** | Internal Server Error | Bug côté serveur (regarde la console) |

---

## 🏗️ Architecture en couches

```text
[Postman / Frontend / Navigateur]
              │
              │  HTTP + JSON
              ▼
   [AuthController / PatientController]   ← Reçoit la requête, renvoie la réponse
              │
              │  Appel de méthode Java
              ▼
     [AuthService]  [DAO]                 ← Logique métier / SQL
              │
              │  JDBC (via mssql-jdbc)
              ▼
   [SQL Server - Utilisateur, Patient]    ← Stocke les données
```

**Principe clé** : chaque couche a une seule responsabilité.

- Le **contrôleur** ne connaît ni le SQL ni BCrypt.
- Le **service** ne connaît ni le HTTP ni le SQL.
- Le **DAO** ne connaît ni le HTTP ni BCrypt.

---

## 🔐 Flux d'authentification

```text
1. Postman envoie { "username": "admin", "mot_de_passe": "admin123" }
2. AuthController parse le JSON
3. AuthController appelle UtilisateurDAO.findByUsername("admin")
4. Le DAO renvoie l'utilisateur (avec le hash BCrypt en BDD)
5. AuthController appelle AuthService.verifier("admin123", hashRecu)
6. BCrypt fait la comparaison de manière sécurisée
7. Si OK → renvoie les infos utilisateur (sans le hash !)
   Si KO → renvoie 401
```

---

## 📝 Bonnes pratiques suivies

- **Séparation des responsabilités** (Controller / Service / DAO / Model)
- **Requêtes préparées** (`PreparedStatement`) → protection contre les injections SQL
- **Fermeture automatique** des ressources (`try-with-resources`)
- **Connexion centralisée** → un seul endroit à modifier
- **Mots de passe hashés** avec BCrypt → jamais stockés en clair
- **JSON** via Gson pour l'échange avec le frontend

---

## 🛠️ Dépannage

| Problème                                       | Solution                                                                     |
|------------------------------------------------|------------------------------------------------------------------------------|
| `ClassNotFoundException: SQLServerDriver`      | Vérifie que `mssql-jdbc-13.4.0.jre11.jar` est bien dans `lib/` et dans le classpath |
| `NoClassDefFoundError: com/google/gson/Gson`   | Vérifie que `gson-2.10.1.jar` est bien dans `lib/` et dans le classpath       |
| `NoClassDefFoundError: org/mindrot/jbcrypt/BCrypt` | Vérifie que `jbcrypt-0.4.jar` est bien dans `lib/` et dans le classpath   |
| `Connection refused`                           | Vérifie que SQL Server tourne et que le port 1433 est ouvert                  |
| `Port 8080 already in use`                     | Change le port dans `index.java` ou tue le processus qui l'occupe             |
| `Invalid object name 'Patient'`                | La base n'a pas été créée → exécute `MPD/gestionpatient.sql`                  |
| `Cannot insert the value NULL into column 'id_structure'` | Insère une structure en base avant de créer un utilisateur |
| `Violation of UNIQUE KEY constraint 'UQ_Utilisateur_username'` | Cet username existe déjà → choisis-en un autre             |
| `javac : commande introuvable`                 | Le JDK n'est pas dans le `PATH` → réinstalle ou configure les variables d'env |
| Login échoue toujours                          | Vérifie que le mot de passe a bien été hashé à l'inscription (pas stocké en clair) |
| Postman affiche `Could not send request`       | Le serveur n'est pas lancé → relance `java -cp ... index`                     |
| Postman affiche `Body` en rouge                | Choisis l'onglet **Body → raw → JSON** (pas `form-data` ni `x-www-form-urlencoded`) |

---

## 🔜 Prochaines étapes

- [x] Ajouter l'authentification BCrypt (`/api/auth/login`, `/api/auth/register`)
- [ ] Ajouter une session par token (JWT) pour protéger les routes
- [ ] Ajouter les autres entités (`Structure`, `Prestation`, `Ordonnance`…)
- [ ] Développer le frontend
- [ ] Passer à Maven pour simplifier le build
- [ ] Ajouter un pool de connexions (HikariCP)

---

## 👤 Auteur

Projet **GestionPatients** — 2026
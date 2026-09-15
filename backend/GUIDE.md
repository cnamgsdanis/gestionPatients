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
| **curl** ou **Postman**        | —                | Tester les endpoints de l'API                                        | https://www.postman.com/                                            |

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
- **Utilisée dans** : `Database.java` (chargement du driver + `DriverManager.getConnection()`).
- **Choix de la version** :
  - `jre11` → pour Java 11 et +
  - `jre8` → uniquement si tu es sur Java 8

#### 🧩 `gson-2.10.1.jar` — Conversion Java ↔ JSON

- **Fourni par** : Google.
- **Rôle** : sérialiser/désérialiser les objets Java en JSON (et inversement) sans écrire de code manuel.
- **Sans elle** : il faudrait écrire un parseur JSON à la main → très long et source de bugs.
- **Utilisée dans** : `AuthController.java`, `PatientController.java` (méthodes `gson.toJson(...)` et `gson.fromJson(...)`).
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
- **Utilisée dans** : `AuthService.java` (hash à l'inscription + vérification à la connexion).
- **Exemple** :
  ```java
  // Au moment de la création du compte
  String hash = BCrypt.hashpw("monMotDePasse", BCrypt.gensalt(12));
  // → "$2a$12$e0Yh7cQ..."

  // Au moment de la connexion
  boolean ok = BCrypt.checkpw("monMotDePasse", hashStockeEnBDD);
  ```
- **Important** : le hash BCrypt fait **60 caractères**. La colonne `mot_de_passe` est en `NVARCHAR(255)`, donc large.

> 📥 **À faire une seule fois** :
> Télécharge les **trois** `.jar` et place-les dans `backend/lib/`. Ne les modifie jamais.

---

## 📁 Arborescence du projet

```text
gestionPatients/
│
├── backend/                              # API Java (aucun framework, JDK seul)
│   ├── lib/                              # Dépendances externes (.jar)
│   │   ├── mssql-jdbc-13.4.0.jre11.jar   # Driver JDBC SQL Server
│   │   ├── gson-2.10.1.jar               # Conversion Java <-> JSON
│   │   └── jbcrypt-0.4.jar               # Hashage BCrypt des mots de passe
│   │
│   ├── index.java                        # Point d'entrée : démarre le serveur HTTP
│   ├── Database.java                     # Connexion centralisée à SQL Server
│   │
│   ├── Utilisateur.java                  # Modèle utilisateur
│   ├── UtilisateurDAO.java               # Accès BD pour Utilisateur
│   ├── AuthService.java                  # Hashage / vérification BCrypt
│   ├── AuthController.java               # Routes /api/auth/*
│   │
│   ├── Patient.java                      # Modèle patient
│   ├── PatientDAO.java                   # Accès BD pour Patient
│   └── PatientController.java            # Routes /api/patients
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
- Enregistre les routes (`/api/auth/*`, `/api/patients`, etc.).
- Configure un pool de threads pour traiter plusieurs requêtes en parallèle.

### `Database.java` — Connexion centralisée

- Contient l'URL JDBC, le login et le mot de passe SQL Server.
- Fournit une méthode statique `getConnection()` utilisée partout ailleurs.
- Évite de dupliquer les informations de connexion dans chaque DAO.

### `Utilisateur.java` — Modèle utilisateur

- POJO représentant une ligne de la table `Utilisateur`.
- **Ne contient jamais le mot de passe en clair**, uniquement le hash récupéré de la BD.
- Champs : `id_utilisateur`, `username`, `mot_de_passe`, `nom`, `email`, `telephone`, `role`, `id_structure`, `actif`.

### `UtilisateurDAO.java` — Data Access Object

- Requêtes SQL sur la table `Utilisateur`.
- Méthode clé : `findByUsername(String username)` → utilisée par l'authentification.
- Méthode : `updateDerniereConnexion(int id)` → met à jour la date de dernière connexion.

### `AuthService.java` — Logique d'authentification

- Contient la logique **métier** : hashage, vérification, validation.
- Méthode `hash(String password)` → renvoie un hash BCrypt.
- Méthode `verifier(String password, String hash)` → renvoie `true`/`false`.
- Ne touche **ni au HTTP, ni au SQL**.

### `AuthController.java` — Contrôleur d'authentification

- Expose les routes :
  - `POST /api/auth/login` → connexion
  - `POST /api/auth/register` → création de compte (réservé admin)
- Reçoit du JSON, appelle `AuthService` + `UtilisateurDAO`, renvoie du JSON.

### `Patient.java`, `PatientDAO.java`, `PatientController.java`

- Mêmes rôles que ci-dessus, mais pour l'entité `Patient`.

### `lib/` — Bibliothèques

- Contient les `.jar` externes nécessaires à la compilation et à l'exécution.
- Ne jamais modifier ces fichiers.

---

## 🗄️ Base de données

### Prérequis

- SQL Server installé et démarré sur `localhost:1433`.
- Une base nommée `gestionPatients`.

### Création de la base

Exécute le script SQL présent dans `MPD/gestionpatient.sql` :

```bash
sqlcmd -S localhost -U sa -P "*20Danis@" -i MPD/gestionpatient.sql
```

Ou ouvre le fichier dans SSMS et exécute-le.



### Configuration de la connexion

Les identifiants sont définis dans `backend/Database.java` :

```java
private static final String URL =
    "jdbc:sqlserver://localhost:1433;databaseName=gestionPatients;encrypt=true;trustServerCertificate=true";
private static final String USER = "sa";
private static final String PASSWORD = "*20Danis@";
```

> ⚠️ **Important** : ces identifiants sont en dur pour le développement.
> Pour la production, il faudra les sortir dans des variables d'environnement.

---

## 🚀 Compilation et exécution

### Étapes (Windows / PowerShell)

Depuis le dossier `backend/` :

```powershell
# 1. Se placer dans le dossier backend
cd backend

# 2. Créer le dossier de sortie (une seule fois)
mkdir out

# 3. Compiler tous les .java
javac -cp "lib/mssql-jdbc-13.4.0.jre11.jar;lib/gson-2.10.1.jar;lib/jbcrypt-0.4.jar" -d out *.java

# 4. Lancer le serveur
java -cp "out;lib/mssql-jdbc-13.4.0.jre11.jar;lib/gson-2.10.1.jar;lib/jbcrypt-0.4.jar" index
```

### Étapes (Linux / macOS)

Même chose mais avec `:` comme séparateur de classpath :

```bash
cd backend
mkdir -p out
javac -cp "lib/mssql-jdbc-13.4.0.jre11.jar:lib/gson-2.10.1.jar:lib/jbcrypt-0.4.jar" -d out *.java
java -cp "out:lib/mssql-jdbc-13.4.0.jre11.jar:lib/gson-2.10.1.jar:lib/jbcrypt-0.4.jar" index
```

### Résultat attendu

```text
====================================
API demarree sur http://localhost:8080
Test : http://localhost:8080/api/patients
====================================
```

---

## 🔌 Endpoints disponibles

### Authentification

| Méthode | URL                   | Description                            |
|---------|-----------------------|----------------------------------------|
| POST    | `/api/auth/login`     | Connexion (username + mot de passe)    |
| POST    | `/api/auth/register`  | Création d'un compte utilisateur       |

### Patients

| Méthode | URL                  | Description                   |
|---------|----------------------|-------------------------------|
| GET     | `/api/patients`      | Liste tous les patients       |
| GET     | `/api/patients/{id}` | Renvoie un patient par son ID |
| POST    | `/api/patients`      | Crée un nouveau patient       |
| PUT     | `/api/patients/{id}` | Modifie un patient existant   |
| DELETE  | `/api/patients/{id}` | Supprime un patient           |

### Exemples avec curl

**Login**

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"mot_de_passe\":\"admin123\"}"
```

Réponse attendue :

```json
{ "id_utilisateur": 1, "username": "admin", "role": "administrateur" }
```

**Créer un utilisateur**

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"medecin1\",\"mot_de_passe\":\"pass123\",\"nom\":\"Dr Diop\",\"email\":\"diop@hopital.sn\",\"telephone\":\"770000000\",\"role\":\"medecin\",\"id_structure\":1}"
```

**Lister tous les patients**

```bash
curl http://localhost:8080/api/patients
```

**Créer un patient**

```bash
curl -X POST http://localhost:8080/api/patients \
  -H "Content-Type: application/json" \
  -d "{\"prenom\":\"Awa\",\"nom\":\"Diop\",\"sex\":\"F\",\"contact\":\"770000000\",\"statut_assure\":true,\"fonds\":0,\"matricule_nag\":\"NAG001\"}"
```

---

## 🏗️ Architecture en couches

```text
[Client / Postman / Navigateur]
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
1. Client envoie { "username": "admin", "mot_de_passe": "admin123" }
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
| `Violation of UNIQUE KEY constraint 'UQ_Utilisateur_username'` | Cet username existe déjà → choisis-en un autre             |
| `javac : commande introuvable`                 | Le JDK n'est pas dans le `PATH` → réinstalle ou configure les variables d'env |
| Login échoue toujours                          | Vérifie que le mot de passe a bien été hashé à l'inscription (pas stocké en clair) |

---

## 🔜 Prochaines étapes

- [x] Ajouter l'authentification BCrypt (endpoint `/api/auth/login`)
- [ ] Ajouter une session par token (JWT) pour protéger les routes
- [ ] Ajouter les autres entités (`Structure`, `Prestation`, `Ordonnance`…)
- [ ] Développer le frontend
- [ ] Passer à Maven pour simplifier le build
- [ ] Ajouter un pool de connexions (HikariCP)

---

## 👤 Auteur

Projet **GestionPatients** — 2026
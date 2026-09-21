# Lancer l'application en local (Windows)

Trois éléments tournent ensemble : **SQL Server** (la base `gestionpatient`), l'**API Java** (`backend/`) et le **site** (`frontend/`, fichiers statiques).

## 0. Ce qu'il faut (déjà en place sur ce poste)

| | Vérification |
|---|---|
| **SQL Server** démarré (instance `SQLEXPRESS`) | `Get-Service 'MSSQL$SQLEXPRESS'` → `Running` |
| **JDK 17 ou plus** (ici 21) | `java -version` et `javac -version` |
| **Python** (sert le site) | `python --version` |
| **Base créée et migrée** | voir « Première installation » ci-dessous (déjà fait ici) |
| **`backend/db/local.properties`** (base, mot de passe SQL, port de l'API) | copie de `local.properties.example` (déjà créé ici, jamais versionné) |

## 1. Le plus simple : un double-clic

Double-cliquez sur **`lancer-local.bat`** (à la racine du dépôt). Il compile l'API, la démarre dans une fenêtre, sert le site dans une autre et ouvre le navigateur sur **http://localhost:5500**.

Connexion : **`admin` / `admin`**.
Pour tout arrêter : fermez les deux fenêtres « PEC - API » et « PEC - Site (5500) ».

## 2. À la main (PowerShell)

> PowerShell exige `.\` devant un script du dossier courant, et `rmdir /S /Q` n'existe pas : c'est `Remove-Item -Recurse -Force`.

**Fenêtre 1 — l'API**

```powershell
cd C:\Users\othni\Documents\gestionPatients-develop\backend
.\compile.bat                       # compile ; s'arrête avec « ERREUR DE COMPILATION » si besoin
java -cp "out;lib/*" index          # démarre l'API (port lu dans db/local.properties : 8081)
```

Vous devez voir `[Config] Fichier local lu …` puis `API demarree sur http://localhost:8081`.

Votre ancienne commande fonctionne toujours (le dossier `util/` a disparu, la classe est dans `service/`) :

```powershell
javac -cp "lib/mssql-jdbc-13.4.0.jre11.jar;lib/gson-2.10.1.jar;lib/jbcrypt-0.4.jar;lib/jjwt-api-0.12.6.jar;lib/jjwt-impl-0.12.6.jar;lib/jjwt-gson-0.12.6.jar" -d out index.java controller/*.java dao/*.java db/*.java model/*.java security/*.java service/*.java
java -cp "out;lib/mssql-jdbc-13.4.0.jre11.jar;lib/gson-2.10.1.jar;lib/jbcrypt-0.4.jar;lib/jjwt-api-0.12.6.jar;lib/jjwt-impl-0.12.6.jar;lib/jjwt-gson-0.12.6.jar" index
```

**Fenêtre 2 — le site**

```powershell
cd C:\Users\othni\Documents\gestionPatients-develop\frontend
python -m http.server 5500 --bind 127.0.0.1
```

Ouvrez **http://localhost:5500** (pas le fichier `index.html` en double-cliquant : le site doit être servi en `http://localhost…`).

## 3. Premiers pas dans l'application

1. Connectez-vous en `admin` / `admin` (**changez ce mot de passe** dès que possible : menu du compte → *Mon compte*, ou *Utilisateurs* → clé « Réinitialiser le mot de passe »).
2. Page **Structures** (menu Administration) : ajoutez une structure **hôpital** et une structure **pharmacie** (bouton « + Ajouter une structure », choisissez la carte du type). Puis page **Utilisateurs** : les comptes — agent hospitalier (accueil), médecin (avec code et type de praticien), pharmacien, caissier — rattachés à ces structures. Le mot de passe saisi est **temporaire** : à sa première connexion, chaque titulaire doit choisir le sien avant d'entrer. L'icône **Profils du compte** d'une ligne (ou « Gérer les profils » dans la fiche) ajoute ou retire des profils (ensembles d'interfaces) à un compte ; un compte à plusieurs profils change de profil actif depuis son menu.
3. Trois **assurés de démonstration** existent : NAG `1000000001` (actif), `1000000002` (ayant droit), `1000000003` (**suspendu** : aucune prestation possible).
4. Le circuit : **Accueil** (Nouvelle prise en charge) → **Médecin** (Espace Médecin, valider) → **Pharmacie** (saisir le prix **et la quantité** : en rupture de stock, servir une partie, le patient ira chercher le reste dans une autre pharmacie) → **Rapports** (paiements). Reconnectez-vous avec le compte de chaque rôle.
5. Pour observer tout le circuit avec le compte **Super Admin**, le bouton **« Contrôles actifs »** de l'en-tête désactive les contrôles anti-fraude du serveur (mode supervision, tracé au journal) ; le réactiver les remet en vigueur pour tous.

## 4. Réglages

| Besoin | Où |
|---|---|
| Mot de passe SQL, instance, port de l'API | `backend/db/local.properties` (modèle : `local.properties.example`) |
| Changer le port de l'API | `PEC_PORT` dans `local.properties` **et** l'adresse dans `frontend/config.js` |
| Adresse de l'API vue par le site | `frontend/config.js` (par défaut `http://localhost:8081` sur `localhost`) |
| Autres réglages (clé JWT, origines CORS…) | `backend/docs/05-integration-front.md`, section 2 |

## 5. Si ça ne marche pas

| Message ou symptôme | Cause et solution |
|---|---|
| `BindException: Address already in use` | Le port est pris (Apache/WAMP occupe 8080 et 8090 sur ce poste). Changez `PEC_PORT` (ex. 8082) et `frontend/config.js`. |
| `package util does not exist` | Une ancienne copie du code ; ce dossier n'existe plus, refaites `.\compile.bat` après avoir récupéré la dernière version. |
| `Échec de la connexion TCP/IP … port 1433` | L'API utilise l'URL par défaut : `backend/db/local.properties` est absent (copiez le modèle). |
| `Login failed for user 'sa'` | Mauvais mot de passe dans `local.properties`. |
| Le site affiche « Serveur injoignable » | L'API n'est pas démarrée, ou son port ne correspond pas à `frontend/config.js`. |
| Le site affiche « … non disponible côté serveur », ou « nom de colonne non valide » dans la console de l'API | La base n'a pas reçu toutes les migrations : `migration_v5_integration_front.sql`, puis `migration_v6_livraison_partielle_controles.sql`, puis `migration_v7_profils_et_mdp_initial.sql` (section 6). |
| `'compile.bat' n'est pas reconnu` (PowerShell) | Écrire `.\compile.bat`. |
| Page blanche / rien ne se charge | Ouvrir le site via `http://localhost:5500`, pas via le fichier. |

## 6. Première installation sur un autre poste

```powershell
# 1. Base : schéma puis migration (UTF-8, option -I obligatoire) — idempotents
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\gestionpatient.sql
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v5_integration_front.sql
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v6_livraison_partielle_controles.sql   # livraison partielle + interrupteur des contrôles
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v7_profils_et_mdp_initial.sql          # profils multiples + mot de passe temporaire
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\donnees_demo.sql        # facultatif : 3 assurés de démonstration

# 2. Réglages locaux
copy backend\db\local.properties.example backend\db\local.properties     # puis éditer le mot de passe SQL

# 3. Premier compte : tant qu'aucun utilisateur n'existe, POST /api/auth/register l'accepte sans jeton (administrateur)
```

Le premier compte administrateur doit être rattaché à la structure « CNAMGS - Administration » (créée par la migration, `id_structure` = 1 sur une base neuve) :

```powershell
curl.exe -X POST http://localhost:8081/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"mot_de_passe\":\"CHANGEZ-MOI\",\"nom\":\"Administrateur\",\"role\":\"administrateur\",\"id_structure\":1}"
```

## 7. Tests

```powershell
$env:API = "http://localhost:8081"; node backend\tests\api-integration.test.js     # 270 vérifications sur la vraie base
sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\tests\cleanup-tests.sql   # supprime UNIQUEMENT les données de test (ZTEST / zt_) ; les données réelles sont conservées
```

Redémarrez l'API entre deux exécutions du test. Le journal d'audit est en ajout seul : les événements des tests y restent (acteurs `zt_…`) ; `backend\tests\purge-journal.sql` le vide **entièrement** (base de test seulement). Détails : `backend/docs/05-integration-front.md`, section 11.

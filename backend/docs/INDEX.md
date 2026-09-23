# 📚 Index de la documentation - GestionPatients v2.0

**Dernière mise à jour** : Janvier 2026  
**Version API** : 2.0  
**Modules** : 11  
**Routes** : 65  

---

> **Mise à jour — 23/09/2026 :** [05-integration-front.md](./05-integration-front.md) §16 : **service médical du médecin** (Cardiologie, Pédiatrie…) sur le compte, filtrage
> de la file d'attente de l'Espace Médecin par service, pré-remplissage à la création d'une prise en charge (migration `migration_v8_…` à exécuter).
>
> **Mise à jour — 20/09/2026 :** [05-integration-front.md](./05-integration-front.md) §13 à §15 : **livraison partielle** en pharmacie (plusieurs pharmacies pour une même ordonnance),
> **interrupteur des contrôles anti-fraude** du Super Admin, **profils multiples** par utilisateur (ajout / retrait) et **mot de passe temporaire** à changer à la première connexion
> (migrations `migration_v6_…` et `migration_v7_…` à exécuter).
>
> **Nouveau — 19/09/2026 :** [05-integration-front.md](./05-integration-front.md) décrit **toutes les modifications** faites pour brancher le
> front (NAG en texte, `nature` / `statut`, assuré suspendu, feuilles de soins, règlements, messages, journal d'audit, sécurité, CORS, corrections de bugs)
> et comment démarrer, configurer et tester. À lire en premier : il complète et, sur certains points (`register`, NAG, `PUT` utilisateur…), remplace ce qui suit.

## 🎯 Par où commencer ?

### Vous êtes...

| Profil | Document recommandé |
|---|---|
| 👨‍💼 **Chef de projet** | [RESUME-EVOLUTION.md](./RESUME-EVOLUTION.md) - Vue d'ensemble exécutive |
| 👨‍💻 **Développeur frontend** | [API-REFERENCE.md](./API-REFERENCE.md) - Référence complète des 65 routes |
| 🔍 **Architecte technique** | [NOUVEAUX-MODULES.md](./NOUVEAUX-MODULES.md) - Analyse détaillée |
| 🧪 **Testeur** | [API-REFERENCE.md](./API-REFERENCE.md) + Postman |
| 📖 **Nouveau sur le projet** | Commencer par README.md puis ce fichier |

---

## 📖 Documents principaux

### 1. [README.md](./README.md) 
**Index général de la documentation**
- Vue d'ensemble
- Liste des modules
- Système d'authentification
- Système de permissions

### 2. [API-REFERENCE.md](./API-REFERENCE.md) ⭐
**Référence complète - 65 routes API**
- Toutes les routes disponibles
- Exemples de requêtes/réponses
- Guide Postman
- Codes d'erreur
- Exemples JavaScript + Python

### 3. [RESUME-EVOLUTION.md](./RESUME-EVOLUTION.md)
**Résumé exécutif de l'évolution v2.0**
- Métriques d'évolution
- Workflow complet implémenté
- Points forts et recommandations
- Statistiques finales

### 4. [NOUVEAUX-MODULES.md](./NOUVEAUX-MODULES.md)
**Analyse détaillée des 7 nouveaux modules**
- Structure
- Ordonnances (module phare - 14 routes)
- Médicaments
- Prestations
- Examens
- Prises en charge (PEC)
- Pharmacie
- Services (CouvertureService, TarifService)

---

## 📁 Documentation par module

### Modules de base (v1.0)

| # | Module | Fichier | Routes | Résumé |
|---|---|---|---|---|
| 01 | **Authentification** | [01-auth.md](./01-auth.md) | 5 | Login, register, JWT, changement mot de passe |
| 02 | **Patient** | [02-patient.md](./02-patient.md) | 5 | CRUD patients, gestion assurés |
| 03 | **Utilisateur** | [03-utilisateur.md](./03-utilisateur.md) | 6 | CRUD utilisateurs, activation/désactivation |
| 04 | **Permission** | [04-permission.md](./04-permission.md) | 5 | Permissions dynamiques par rôle |

**Total v1.0** : 4 modules, 21 routes

---

### Nouveaux modules (v2.0)

| # | Module | Documentation | Routes | Description courte |
|---|---|---|---|---|
| 05 | **Structure** | [NOUVEAUX-MODULES.md#1](./NOUVEAUX-MODULES.md) | 5 | Hôpitaux et pharmacies partenaires |
| 06 | **Ordonnance** | [NOUVEAUX-MODULES.md#2](./NOUVEAUX-MODULES.md) | 14 | **Module phare** - Cycle complet ordonnance |
| 07 | **Médicament** | [NOUVEAUX-MODULES.md#3](./NOUVEAUX-MODULES.md) | 6 | Catalogue + gestion stocks |
| 08 | **Prestation** | [NOUVEAUX-MODULES.md#4](./NOUVEAUX-MODULES.md) | 5 | Consultations, hospitalisations, examens |
| 09 | **Examen** | [NOUVEAUX-MODULES.md#5](./NOUVEAUX-MODULES.md) | 5 | Examens médicaux (radio, bio, autre) |
| 10 | **PEC** | [NOUVEAUX-MODULES.md#6](./NOUVEAUX-MODULES.md) | 6 | Calcul auto part CNAMGS (fonds 1-4) |
| 11 | **Pharmacie** | [NOUVEAUX-MODULES.md#7](./NOUVEAUX-MODULES.md) | 3 | Routes métier pharmacien |

**Total v2.0** : +7 modules, +44 routes → **11 modules, 65 routes**

---

## 🔍 Recherche rapide par besoin

### Authentification & Sécurité
- **JWT** → [01-auth.md](./01-auth.md) + [API-REFERENCE.md](./API-REFERENCE.md)
- **Permissions** → [04-permission.md](./04-permission.md)
- **Rôles** → [04-permission.md](./04-permission.md) + [NOUVEAUX-MODULES.md](./NOUVEAUX-MODULES.md)

### Gestion des patients
- **CRUD patients** → [02-patient.md](./02-patient.md)
- **Statut assuré** → [02-patient.md](./02-patient.md) + [NOUVEAUX-MODULES.md#6](./NOUVEAUX-MODULES.md)

### Circuit de soins
- **Consultation** → [NOUVEAUX-MODULES.md#4](./NOUVEAUX-MODULES.md) (Prestations)
- **Ordonnance médicale** → [NOUVEAUX-MODULES.md#2](./NOUVEAUX-MODULES.md) ⭐
- **Examens** → [NOUVEAUX-MODULES.md#5](./NOUVEAUX-MODULES.md)

### Pharmacie
- **Catalogue médicaments** → [NOUVEAUX-MODULES.md#3](./NOUVEAUX-MODULES.md)
- **Gestion stocks** → [NOUVEAUX-MODULES.md#3](./NOUVEAUX-MODULES.md)
- **Délivrance ordonnance** → [NOUVEAUX-MODULES.md#2](./NOUVEAUX-MODULES.md) (Ordonnances)
- **Routes pharmacien** → [NOUVEAUX-MODULES.md#7](./NOUVEAUX-MODULES.md)

### Facturation & PEC
- **Calcul automatique PEC** → [NOUVEAUX-MODULES.md#6](./NOUVEAUX-MODULES.md)
- **Grille de couverture** → [NOUVEAUX-MODULES.md](./NOUVEAUX-MODULES.md) (Services)
- **Tarifs fixes** → [NOUVEAUX-MODULES.md](./NOUVEAUX-MODULES.md) (Services)

### Administration
- **Structures** → [NOUVEAUX-MODULES.md#1](./NOUVEAUX-MODULES.md)
- **Utilisateurs** → [03-utilisateur.md](./03-utilisateur.md)
- **Permissions** → [04-permission.md](./04-permission.md)

---

## 📊 Vue d'ensemble technique

### Architecture
```
Client (Frontend/Postman)
    ↓ HTTP + JSON + JWT
Controllers (11)
    ↓
Services (5) + Security (AuthGuard)
    ↓
DAOs (11)
    ↓
SQL Server (13 tables)
```

### Technologies
- **Backend** : Java 17 pur (sans framework)
- **API** : REST JSON
- **Authentification** : JWT (HS256) + BCrypt
- **Base de données** : SQL Server 2019+
- **Librairies** : Gson, JJWT, JBCrypt, MSSQL-JDBC

### Patterns
- ✅ Architecture en couches (MVC)
- ✅ Injection de dépendances manuelle
- ✅ Permissions granulaires
- ✅ Services métier réutilisables

---

## 🎯 Workflows documentés

### 1. Création d'une ordonnance
→ Voir [NOUVEAUX-MODULES.md#2](./NOUVEAUX-MODULES.md) - Section "Workflow complet"

### 2. Délivrance en pharmacie
→ Voir [NOUVEAUX-MODULES.md#2](./NOUVEAUX-MODULES.md) - Route `PUT /api/ordonnances/{id}/delivrer`

### 3. Calcul PEC automatique
→ Voir [NOUVEAUX-MODULES.md#6](./NOUVEAUX-MODULES.md) - Module Prises en charge

### 4. Authentification JWT
→ Voir [01-auth.md](./01-auth.md) - Section "Flux d'authentification JWT"

---

## 📈 Statistiques du projet

| Catégorie | v1.0 | v2.0 | Évolution |
|---|---|---|---|
| **Modules** | 4 | 11 | +175% |
| **Routes API** | 21 | 65 | +209% |
| **Tables DB** | 3 | 13 | +333% |
| **Permissions** | 15 | 35 | +133% |
| **Services** | 3 | 5 | +67% |
| **Fichiers doc** | 4 | 7 | +75% |

---

## 🚀 Guides pratiques

### Pour tester l'API
1. Lire [API-REFERENCE.md](./API-REFERENCE.md) - Section "Démarrage rapide avec Postman"
2. Importer la collection Postman (fournie dans API-REFERENCE.md)
3. Créer un compte via `POST /api/auth/register`
4. Se connecter via `POST /api/auth/login`
5. Copier le token dans les variables Postman

### Pour développer le frontend
1. Lire [API-REFERENCE.md](./API-REFERENCE.md) - Section "Exemples de code"
2. Utiliser les exemples JavaScript fournis
3. Gérer le token dans localStorage
4. Intercepter les erreurs 401/403

### Pour comprendre les permissions
1. Lire [04-permission.md](./04-permission.md)
2. Consulter la matrice des rôles
3. Tester la modification à chaud via `POST /api/permissions/role/{role}/{code}`

---

## ⚠️ Points d'attention

### Bugs connus
→ Voir [NOUVEAUX-MODULES.md](./NOUVEAUX-MODULES.md) - Section "Points d'attention"

### Recommandations
→ Voir [RESUME-EVOLUTION.md](./RESUME-EVOLUTION.md) - Section "Points d'attention"

### Prochaines étapes
→ Voir [RESUME-EVOLUTION.md](./RESUME-EVOLUTION.md) - Section "Prochaines étapes recommandées"

---

## 📞 Support

### Documentation manquante ?
Consulter les fichiers sources dans `backend/controller/` et `backend/service/`

### Erreur non documentée ?
Vérifier les logs console du serveur Java

### Question sur un module ?
Se référer à [NOUVEAUX-MODULES.md](./NOUVEAUX-MODULES.md) pour les détails techniques

---

## 🎓 Équipe

- **Danis** - Backend (Auth, Ordonnances, PEC, Services)
- **Evann** - Backend (Médicaments, Prestations, Examens, Structures)
- **Heli** - Frontend (Interface, UX, Design)
- **Lionel** - Frontend (Intégration API, Workflows)

---

## 📅 Historique

| Version | Date | Modules | Routes | Description |
|---|---|---|---|---|
| **v1.0** | Sept 2025 | 4 | 21 | MVP - Auth, Patient, Utilisateur, Permission |
| **v2.0** | Jan 2026 | 11 | 65 | Système complet - Circuit de soins + PEC |

---

**🎯 Pour une vue complète, commencer par** → [API-REFERENCE.md](./API-REFERENCE.md)

**📊 Pour le résumé exécutif** → [RESUME-EVOLUTION.md](./RESUME-EVOLUTION.md)

**🔍 Pour les détails techniques** → [NOUVEAUX-MODULES.md](./NOUVEAUX-MODULES.md)

---

*Index de documentation - GestionPatients v2.0 - Janvier 2026*

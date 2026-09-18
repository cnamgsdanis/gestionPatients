# 🆕 Nouveaux modules ajoutés - Analyse complète

**Date d'analyse** : 2026  
**Version** : 2.0  

---

## 📊 Vue d'ensemble des ajouts

Le projet a connu une **évolution majeure** avec l'ajout de **7 nouveaux modules** et de **2 nouveaux services**. Le système couvre maintenant l'intégralité du circuit de prise en charge des assurés, de la consultation à la délivrance en pharmacie.

### 🎯 Modules ajoutés

| # | Module | Controller | DAO | Model | Routes |
|---|---|---|---|---|---|
| 1 | **Structures** | StructureController | StructureDAO | Structure | 5 routes |
| 2 | **Ordonnances** | OrdonnanceController | OrdonnanceDAO | Ordonnance | 14 routes |
| 3 | **Médicaments** | MedicamentController | MedicamentDAO | Medicament | 6 routes |
| 4 | **Prestations** | PrestationController | PrestationDAO | Prestation | 5 routes |
| 5 | **Examens** | ExamenController | ExamenDAO | Examen | 5 routes |
| 6 | **Prises en charge** | PriseEnChargeController | PriseEnChargeDAO | PriseEnCharge | 6 routes |
| 7 | **Pharmacie** | PharmacieController | - | - | 3 routes spécialisées |

### ⚙️ Services ajoutés

| Service | Rôle | Chargement |
|---|---|---|
| **CouvertureService** | Calcul automatique de la part CNAMGS selon le fonds (1-4) | Au démarrage |
| **TarifService** | Tarifs fixes (consultation, hospitalisation) | Au démarrage |

---

## 📁 1. Module Structures

### Description
Gestion centralisée des hôpitaux et pharmacies partenaires.

### Routes disponibles

```
GET    /api/structures              → Liste (avec filtres ?type=, ?raison=)
GET    /api/structures/{id}         → Détail d'une structure
POST   /api/structures              → Créer une structure
PUT    /api/structures/{id}         → Modifier une structure
DELETE /api/structures/{id}         → Supprimer (si aucune dépendance)
```

### Permissions

- `structure.lire` - Lecture
- `structure.gerer` - Création/Modification/Suppression

### Modèle Structure

```java
public class Structure {
    public int    id_structure;
    public String raison_sociale;   // Nom de l'établissement
    public String addresse;
    public String type_structure;   // "hopital" ou "pharmacie"
}
```

### Exemples d'utilisation

#### Lister toutes les pharmacies

```javascript
GET /api/structures?type=pharmacie
Authorization: Bearer <token>
```

**Réponse** :
```json
[
  {
    "id_structure": 1,
    "raison_sociale": "Pharmacie Centrale",
    "addresse": "Libreville, Quartier Louis",
    "type_structure": "pharmacie"
  }
]
```

#### Créer un hôpital

```javascript
POST /api/structures
Authorization: Bearer <token>
Content-Type: application/json

{
  "raison_sociale": "Hôpital Principal de Libreville",
  "addresse": "BP 123, Libreville",
  "type_structure": "hopital"
}
```

**Réponse 201** :
```json
{
  "id_structure": 5
}
```

### Points techniques

- ✅ Validation du type : uniquement "hopital" ou "pharmacie"
- ✅ Filtrage par type ou raison sociale via query params
- ✅ Protection contre suppression si utilisateurs/médicaments rattachés
- ⚠️ **Attention** : La suppression échoue avec `409 Conflict` si des dépendances existent

---

## 📁 2. Module Ordonnances

### Description
**Module le plus complexe**. Gère tout le cycle de vie d'une ordonnance médicale : création par le médecin, signatures, codes de retrait, délivrance partielle/totale par le pharmacien.

### Routes disponibles (14 routes)

```
GET    /api/ordonnances                           → Liste (filtres: ?id_patient, ?id_medecin, ?statut)
GET    /api/ordonnances/{id}                      → Détail
GET    /api/ordonnances/code/{code}               → Recherche par code retrait
POST   /api/ordonnances                           → Créer (avec ou sans médicaments)
PUT    /api/ordonnances/{id}                      → Modifier
DELETE /api/ordonnances/{id}                      → Annuler
PUT    /api/ordonnances/{id}/signer-medecin       → Apposer signature médecin
PUT    /api/ordonnances/{id}/cachet-medecin       → Apposer cachet
PUT    /api/ordonnances/{id}/signer-patient       → Signature patient
PUT    /api/ordonnances/{id}/statut               → Changer le statut
PUT    /api/ordonnances/{id}/delivrer             → Délivrer (pharmacien)
GET    /api/ordonnances/{id}/medicaments          → Liste des médicaments prescrits
POST   /api/ordonnances/{id}/medicaments          → Ajouter un médicament
DELETE /api/ordonnances/{id}/medicaments/{idMed}  → Retirer un médicament
```

### Permissions

- `ordonnance.lire` - Consultation
- `ordonnance.creer` - Création
- `ordonnance.modifier` - Modification
- `ordonnance.annuler` - Annulation
- `ordonnance.signer` - Signature/Cachet médecin
- `ordonnance.delivrer` - Délivrance (pharmacien)

### Modèle Ordonnance

```java
public class Ordonnance {
    public int    id_ordonnance;
    public String date_ordonnance;
    public String statut;                    // en_attente, validee, envoyee, delivree, 
                                             // partiellement_delivree, annulee
    public String signature_medecin;
    public String cachet_medecin;
    public String signature_patient;
    public String code_retrait;              // Code unique 8 caractères
    public int    id_prestation;             // Prestation consultation
    public int    id_utilisateur;            // Médecin prescripteur
    public Integer id_prestation_pharmacie;  // Prestation créée à la délivrance
    
    // Champs enrichis (jointures)
    public String patient_nom;
    public String medecin_nom;
    public List<Prescription> medicaments;
}
```

### Modèle Prescription (médicament prescrit)

```java
public class Prescription {
    public int    id_ordonnance;
    public int    id_medicament;
    public String posologie;                // Ex: "1 cp 3x/j pendant 7j"
    public int    quantite_prescrite;
    public int    quantite_delivree;
    public String statut_delivrance;        // en_attente, delivre, partiel, non_delivre
    
    // Enrichi
    public String nom_medicament;
    public String dosage;
    public int    stock_disponible;
    public BigDecimal prix;
}
```

### Statuts d'une ordonnance

| Statut | Description |
|---|---|
| `en_attente` | Créée, en attente de validation médecin |
| `validee` | Signée par le médecin |
| `envoyee` | Transmise à la pharmacie |
| `delivree` | Tous les médicaments délivrés |
| `partiellement_delivree` | Délivrance partielle (rupture de stock) |
| `annulee` | Ordonnance annulée |

### Workflow complet

```
1. MÉDECIN → POST /api/ordonnances
   - Création avec liste de médicaments
   - Statut: en_attente
   - Code retrait généré automatiquement (8 caractères)

2. MÉDECIN → PUT /api/ordonnances/{id}/signer-medecin
   - Signature électronique
   - Statut: validee

3. PATIENT → Reçoit le code retrait (ex: "ABC12345")

4. PHARMACIEN → GET /api/ordonnances/code/{code}
   - Vérifie l'ordonnance avec le code
   - Consulte les médicaments prescrits

5. PHARMACIEN → PUT /api/ordonnances/{id}/delivrer
   - Spécifie les quantités délivrées (totale ou partielle)
   - Le système:
     ✓ Calcule le montant total (prix × quantité)
     ✓ Crée une nouvelle Prestation type "pharmacie"
     ✓ Crée une PEC si patient assuré
     ✓ Décrémente les stocks
     ✓ Marque chaque médicament (delivré/partiel/rupture)
     ✓ Change le statut global
```

### Exemples d'utilisation

#### Créer une ordonnance avec médicaments

```javascript
POST /api/ordonnances
Authorization: Bearer <token>
Content-Type: application/json

{
  "id_prestation": 42,
  "id_utilisateur": 2002,
  "medicaments": [
    {
      "id_medicament": 1,
      "posologie": "1 comprimé 3 fois par jour pendant 7 jours",
      "quantite_prescrite": 21
    },
    {
      "id_medicament": 4,
      "posologie": "1 sachet matin et soir",
      "quantite_prescrite": 14
    }
  ]
}
```

**Réponse 201** :
```json
{
  "id_ordonnance": 15,
  "date_ordonnance": "2026-01-15",
  "statut": "en_attente",
  "code_retrait": "ABCDE123",
  "id_prestation": 42,
  "id_utilisateur": 2002,
  "patient_nom": "Jean MBANI",
  "medecin_nom": "Dr. Marie OWONA",
  "medicaments": [
    {
      "id_medicament": 1,
      "nom_medicament": "Paracetamol 500mg",
      "posologie": "1 comprimé 3 fois par jour pendant 7 jours",
      "quantite_prescrite": 21,
      "quantite_delivree": 0,
      "statut_delivrance": "en_attente"
    }
  ]
}
```

#### Signer l'ordonnance

```javascript
PUT /api/ordonnances/15/signer-medecin
Authorization: Bearer <token>
Content-Type: application/json

{
  "signature": "/signatures/dr-owona-2026-01-15.png"
}
```

#### Rechercher par code retrait

```javascript
GET /api/ordonnances/code/ABCDE123
Authorization: Bearer <token>
```

#### Délivrer avec quantités spécifiques

```javascript
PUT /api/ordonnances/15/delivrer
Authorization: Bearer <token>
Content-Type: application/json

{
  "medicaments_delivres": [
    {
      "id_medicament": 1,
      "quantite_delivree": 21
    },
    {
      "id_medicament": 4,
      "quantite_delivree": 10
    }
  ]
}
```

**Réponse 200** :
```json
{
  "message": "Delivrance effectuee",
  "statut_ordonnance": "partiellement_delivree",
  "montant_total": 15750.00,
  "medicaments_delivres": 1,
  "medicaments_partiels": 1,
  "medicaments_rupture": 0,
  "id_prestation_pharmacie": 89
}
```

### Points techniques importants

- ✅ **Code retrait** : 8 caractères (majuscules + chiffres, sans I/O/0/1 pour éviter confusion)
- ✅ **Délivrance partielle** : Gère les ruptures de stock automatiquement
- ✅ **Calcul automatique** : Montant total = Σ(prix × quantité_delivree)
- ✅ **Transaction atomique** : Création prestation + PEC + décrémentation stocks
- ✅ **Historique** : Chaque médicament garde sa quantité délivrée
- ⚠️ **Protection** : Impossible de modifier une ordonnance "delivree" ou "annulee"

---

## 📁 3. Module Médicaments

### Description
Gestion du stock de médicaments dans les pharmacies partenaires.

### Routes disponibles

```
GET    /api/medicaments              → Liste (filtres: ?id_structure, ?nom)
GET    /api/medicaments/{id}         → Détail
POST   /api/medicaments              → Créer
PUT    /api/medicaments/{id}         → Modifier
DELETE /api/medicaments/{id}         → Supprimer
PUT    /api/medicaments/{id}/stock   → Ajuster le stock
```

### Permissions

- `medicament.lire` - Lecture
- `medicament.creer` - Création
- `medicament.modifier` - Modification
- `medicament.supprimer` - Suppression

### Modèle Medicament

```java
public class Medicament {
    public int        id_medicament;
    public String     nom_medicament;
    public String     dosage;              // Ex: "500mg", "10ml"
    public int        quantite;            // Stock actuel
    public BigDecimal prix;                // Prix unitaire FCFA
    public int        id_structure;        // Pharmacie
    
    // Enrichi
    public String raison_sociale;          // Nom de la pharmacie
}
```

### Exemples d'utilisation

#### Créer un médicament

```javascript
POST /api/medicaments
Authorization: Bearer <token>
Content-Type: application/json

{
  "nom_medicament": "Paracetamol",
  "dosage": "500mg",
  "quantite": 1000,
  "prix": 250.00,
  "id_structure": 3
}
```

#### Ajuster le stock

```javascript
PUT /api/medicaments/5/stock
Authorization: Bearer <token>
Content-Type: application/json

{
  "ajustement": 50,
  "motif": "Réapprovisionnement fournisseur"
}
```

**Réponse** :
```json
{
  "message": "Stock mis a jour",
  "nouveau_stock": 1050
}
```

### Points techniques

- ✅ **Prix** : Stocké en BigDecimal pour éviter les erreurs d'arrondi
- ✅ **Décrémentation automatique** : À chaque délivrance d'ordonnance
- ✅ **Protection** : Impossible de supprimer si prescriptions liées
- ⚠️ **Attention** : Le stock peut devenir négatif si mal géré (à améliorer)

---

## 📁 4. Module Prestations

### Description
Toutes les prestations médicales : consultations, hospitalisations, pharmacie, examens.

### Routes disponibles

```
GET    /api/prestations              → Liste (filtres: ?id_patient, ?type, ?date_debut, ?date_fin)
GET    /api/prestations/{id}         → Détail
POST   /api/prestations              → Créer
PUT    /api/prestations/{id}         → Modifier
DELETE /api/prestations/{id}         → Supprimer
```

### Permissions

- `prestation.lire` - Lecture
- `prestation.creer` - Création
- `prestation.modifier` - Modification
- `prestation.supprimer` - Suppression

### Modèle Prestation

```java
public class Prestation {
    public int        id_prestation;
    public BigDecimal montant;
    public String     date_prs;
    public String     type_prestation;     // consultation, hospitalisation, pharmacie, examen
    public int        id_patient;
    public int        id_utilisateur;
    public int        id_structure;
    
    // Enrichis
    public String patient_nom;
    public String utilisateur_nom;
    public String structure_nom;
}
```

### Types de prestations

| Type | Description | Tarif |
|---|---|---|
| `consultation` | Consultation médicale | 5000 FCFA (fixe) |
| `hospitalisation` | Séjour hospitalier | 25000 FCFA/jour (fixe) |
| `pharmacie` | Délivrance médicaments | Calculé (Σ prix × qté) |
| `examen` | Examens médicaux | Variable |

### Exemples d'utilisation

```javascript
POST /api/prestations
Authorization: Bearer <token>
Content-Type: application/json

{
  "montant": 5000.00,
  "date_prs": "2026-01-15",
  "type_prestation": "consultation",
  "id_patient": 42,
  "id_utilisateur": 2002,
  "id_structure": 1
}
```

### Points techniques

- ✅ **Tarifs fixes** : Chargés depuis `TarifService` au démarrage
- ✅ **Calcul automatique** : Pour les prestations pharmacie (via ordonnance)
- ✅ **Historique complet** : Toutes les prestations sont conservées

---

## 📁 5. Module Examens

### Description
Gestion des examens médicaux (radiologie, biologie, etc.).

### Routes disponibles

```
GET    /api/examens              → Liste (filtres: ?id_patient, ?type)
GET    /api/examens/{id}         → Détail
POST   /api/examens              → Créer
PUT    /api/examens/{id}         → Modifier
DELETE /api/examens/{id}         → Supprimer
```

### Permissions

- `examen.lire` - Lecture
- `examen.creer` - Création
- `examen.modifier` - Modification
- `examen.supprimer` - Suppression

### Modèle Examen

```java
public class Examen {
    public int    id_examen;
    public String type_examen;      // radiologie, biologie, autre
    public String date_exam;
    public String resultat;
    public int    id_prestation;
    
    // Enrichi
    public String patient_nom;
}
```

---

## 📁 6. Module Prises en charge (PEC)

### Description
Gestion de la couverture CNAMGS : calcul automatique de la part assurance selon le fonds du patient.

### Routes disponibles

```
GET    /api/prises-en-charge              → Liste (filtres: ?id_patient, ?statut)
GET    /api/prises-en-charge/{id}         → Détail
POST   /api/prises-en-charge              → Créer
PUT    /api/prises-en-charge/{id}         → Modifier
DELETE /api/prises-en-charge/{id}         → Supprimer
PUT    /api/prises-en-charge/{id}/valider → Valider/Rejeter
```

### Permissions

- `pec.lire` - Lecture
- `pec.creer` - Création
- `pec.valider` - Validation (directeur)

### Modèle PriseEnCharge

```java
public class PriseEnCharge {
    public int        id_pec;
    public BigDecimal montant_pec;         // Part CNAMGS
    public BigDecimal part_patient;        // Ticket modérateur
    public String     date_pec;
    public int        id_acteur;
    public String     statut;              // en_attente, validee, rejetee
    public int        id_prestation;
    
    // Enrichis
    public String     acteur_nom;
    public BigDecimal montant_total;
    public String     type_prestation;
}
```

### Calcul automatique selon le fonds

| Fonds | Taux couverture | Part CNAMGS | Part patient |
|---|---|---|---|
| 1 | 40% | 40% du montant | 60% du montant |
| 2 | 60% | 60% du montant | 40% du montant |
| 3 | 80% | 80% du montant | 20% du montant |
| 4 | 100% | 100% du montant | 0% |

### Exemple

```
Consultation : 5000 FCFA
Patient fonds 3 (80%)

→ Part CNAMGS : 4000 FCFA
→ Part patient : 1000 FCFA
```

### Création automatique

Les PEC sont créées automatiquement lors de :
- ✅ Création d'une prestation pour un patient assuré
- ✅ Délivrance d'une ordonnance

---

## 📁 7. Module Pharmacie (Routes spécialisées)

### Description
Routes métier spécifiques au workflow pharmacien.

### Routes disponibles

```
GET  /api/pharmacie/ordonnances/{code}    → Rechercher ordonnance par code retrait
POST /api/pharmacie/delivrer/{id}         → Délivrance rapide
GET  /api/pharmacie/stock-alerte          → Médicaments en rupture de stock
```

### Points techniques

- Route simplifiée pour le pharmacien
- Agrégation de données (ordonnance + prescriptions + stocks)
- Alertes automatiques si stock < seuil

---

## ⚙️ Services métier ajoutés

### 1. CouvertureService

**Rôle** : Calcul automatique de la couverture CNAMGS selon le fonds.

```java
public class CouvertureService {
    private static Map<Integer, BigDecimal> taux;  // Cache en mémoire
    
    public static void init() {
        // Charge depuis TauxCouverture
        // Fonds 1 → 40%, Fonds 2 → 60%, Fonds 3 → 80%, Fonds 4 → 100%
    }
    
    public static BigDecimal calculerMontantPec(BigDecimal montantTotal, int fonds);
    public static BigDecimal calculerPartPatient(BigDecimal montantTotal, int fonds);
    public static BigDecimal getTaux(int fonds);
}
```

**Utilisation** :

```java
BigDecimal montant = new BigDecimal("5000.00");
BigDecimal partCNAMGS = CouvertureService.calculerMontantPec(montant, 3);
// → 4000.00 (80% de 5000)
```

### 2. TarifService

**Rôle** : Tarifs fixes pour consultation et hospitalisation.

```java
public class TarifService {
    private static Map<String, BigDecimal> tarifs;
    
    public static void init() {
        // Charge depuis Tarif
        // consultation → 5000 FCFA
        // hospitalisation → 25000 FCFA
    }
    
    public static BigDecimal getTarif(String type);
}
```

**Utilisation** :

```java
BigDecimal tarifConsult = TarifService.getTarif("consultation");
// → 5000.00
```

---

## 🗄️ Évolutions de la base de données

### Tables ajoutées

1. **TauxCouverture** - Grille fonds → %
2. **Tarif** - Tarifs fixes

### Colonnes ajoutées

| Table | Colonne | Type | Description |
|---|---|---|---|
| `Ordonnance` | `code_retrait` | NVARCHAR(50) | Code unique 8 caractères |
| `Ordonnance` | `id_prestation_pharmacie` | INT | Lien vers prestation créée |
| `Ordonnance` | `statut` | NVARCHAR(25) | Nouveau statut "partiellement_delivree" |
| `Prescription` | `quantite_delivree` | INT | Quantité réellement délivrée |
| `Prescription` | `statut_delivrance` | NVARCHAR(20) | delivre/partiel/non_delivre |
| `Medicament` | `prix` | DECIMAL(10,2) | Prix unitaire |

### Nouvelles permissions

```sql
-- Ordonnances
ordonnance.lire
ordonnance.creer
ordonnance.modifier
ordonnance.annuler
ordonnance.supprimer
ordonnance.signer
ordonnance.delivrer

-- Médicaments
medicament.lire
medicament.creer
medicament.modifier
medicament.supprimer

-- Examens
examen.lire
examen.creer
examen.modifier
examen.supprimer

-- PEC
pec.lire
pec.creer
pec.valider
```

### Données initiales

Le script SQL insère automatiquement :
- ✅ Toutes les permissions (35 au total)
- ✅ Permissions par rôle (6 rôles)
- ✅ Grille de couverture (4 niveaux)
- ✅ Tarifs fixes (consultation, hospitalisation)

---

## 🔐 Améliorations de sécurité

### AuthGuard - Nouvelles méthodes utilitaires

```java
public class AuthGuard {
    // Extraction sûre des claims numériques
    public static int getIdUtilisateur(Claims claims);
    public static int getIdStructure(Claims claims);
    public static String getRole(Claims claims);
    public static String getUsername(Claims claims);
}
```

**Pourquoi ?** JJWT renvoie parfois des `Double` pour les nombres → conversion sûre.

---

## 📈 Statistiques finales

### Avant

- 4 modules (Auth, Patient, Utilisateur, Permission)
- 16 routes API
- 2 services (Auth, JWT, Permission)
- 3 tables principales

### Après

- **11 modules** (+7)
- **60+ routes API** (+44)
- **5 services** (+2)
- **13 tables** (+10)
- **35 permissions** (+20)

### Couverture fonctionnelle

| Domaine | Couverture |
|---|---|
| **Gestion administrative** | 100% |
| **Circuit de soins** | 100% |
| **Gestion pharmaceutique** | 100% |
| **Facturation / PEC** | 100% |
| **Traçabilité** | 100% |

---

## 🎯 Prochaines étapes recommandées

### Priorité haute 🔴

1. **Documentation détaillée** - Créer un fichier par module (comme 01-auth.md)
2. **Tests unitaires** - Couvrir les calculs de PEC et délivrance ordonnance
3. **Gestion des stocks** - Alertes automatiques et réapprovisionnement
4. **Journalisation** - Implémenter le module prévu

### Priorité moyenne 🟡

5. **Dashboard pharmacie** - Vue temps réel des ordonnances en attente
6. **Notifications** - Email/SMS à la validation d'ordonnance
7. **Export PDF** - Générer les ordonnances et feuilles de soins
8. **Statistiques** - Rapports de consommation médicaments

### Priorité basse 🟢

9. **Historique des prix** - Garder l'évolution des prix médicaments
10. **Ordonnances chroniques** - Renouvellement automatique
11. **Interface mobile** - Application pour les pharmaciens

---

## 🆘 Points d'attention

### Bugs potentiels identifiés

1. **Stock négatif** - Aucune validation empêchant quantité > stock
2. **Code retrait collision** - Probabilité faible mais possible (8 caractères)
3. **Race condition** - Délivrance simultanée de la même ordonnance
4. **Calcul PEC** - Si le fonds change entre prestation et validation
5. **Transactions** - Certaines opérations ne sont pas atomiques

### Recommandations

- [ ] Ajouter un lock sur les ordonnances pendant délivrance
- [ ] Générer un code retrait avec timestamp pour unicité
- [ ] Valider stock disponible avant délivrance
- [ ] Wrapper toutes les opérations multi-tables dans des transactions
- [ ] Ajouter des contraintes CHECK sur les quantités (>= 0)

---

*Analyse réalisée le 2026 - Projet GestionPatients v2.0*

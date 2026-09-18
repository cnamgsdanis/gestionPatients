-- =====================================================================
-- MODELE PHYSIQUE DE DONNEES (MPD) - SQL SERVER
-- Systeme de gestion de la prise en charge des assures
-- ---------------------------------------------------------------------
-- Version : 4.0
-- Date    : 2026-09-18
-- ---------------------------------------------------------------------
-- Ce script est IDEMPOTENT : chaque CREATE/ALTER est protégé par un
-- IF NOT EXISTS. Tu peux le relancer autant de fois que tu veux.
-- ---------------------------------------------------------------------
-- 14 tables :
--    Structure, Patient, Utilisateur, Prestation, Prise_en_charge,
--    Ordonnance, Examen, Medicaments, Prescription,
--    Permission, RolePermission, TauxCouverture, Tarif
-- =====================================================================

-- Optionnel : recréer la base proprement (décommenter si besoin)
-- IF DB_ID('gestionPatients') IS NOT NULL DROP DATABASE gestionPatients;
-- CREATE DATABASE gestionPatients;
-- GO
-- USE gestionPatients;
-- GO


-- =====================================================================
-- 1. STRUCTURE (hôpitaux et pharmacies)
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Structure')
CREATE TABLE Structure (
    id_structure    INT IDENTITY(1,1) PRIMARY KEY,
    raison_sociale  NVARCHAR(100) NOT NULL,
    addresse        NVARCHAR(200) NOT NULL,
    type_structure  NVARCHAR(30)  NOT NULL
        CONSTRAINT CK_Structure_type CHECK (type_structure IN ('hopital', 'pharmacie'))
);
GO


-- =====================================================================
-- 2. PATIENT
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Patient')
CREATE TABLE Patient (
    id_patient          INT IDENTITY(1,1) PRIMARY KEY,
    photo_url           NVARCHAR(255) NULL,
    prenom              NVARCHAR(100) NOT NULL,
    nom                 NVARCHAR(100) NOT NULL,
    sex                 NVARCHAR(10)  NOT NULL
        CONSTRAINT CK_Patient_sex CHECK (sex IN ('M', 'F')),
    contact             NVARCHAR(100) NULL,
    statut_assure       BIT           NOT NULL DEFAULT 0,
    fonds               TINYINT       NULL
        CONSTRAINT CK_Patient_fonds CHECK (fonds IN (1, 2, 3, 4)),
    matricule_nag       NVARCHAR(50)  NULL,
    id_assure_principal INT           NULL,

    CONSTRAINT FK_Patient_AssurePrincipal
        FOREIGN KEY (id_assure_principal) REFERENCES Patient(id_patient)
);
GO

-- Index pour la recherche rapide par matricule NAG (pharmacie)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Patient_matricule_nag')
    CREATE INDEX IX_Patient_matricule_nag ON Patient(matricule_nag);
GO


-- =====================================================================
-- 3. UTILISATEUR
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Utilisateur')
CREATE TABLE Utilisateur (
    id_utilisateur      INT IDENTITY(1,1) PRIMARY KEY,

    username            NVARCHAR(50)  NOT NULL,
    mot_de_passe        NVARCHAR(255) NOT NULL,

    nom                 NVARCHAR(100) NOT NULL,
    email               NVARCHAR(150) NULL,
    telephone           NVARCHAR(20)  NULL,

    role                NVARCHAR(30)  NOT NULL
        CONSTRAINT CK_Utilisateur_role
        CHECK (role IN (
            'administrateur',
            'agent_accueil',
            'pharmacien',
            'medecin',
            'directeur_structure',
            'caissier_structure'
        )),
    id_structure        INT NOT NULL,

    actif               BIT           NOT NULL DEFAULT 1,
    date_creation       DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    derniere_connexion  DATETIME2     NULL,

    CONSTRAINT UQ_Utilisateur_username UNIQUE (username),
    CONSTRAINT FK_Utilisateur_Structure FOREIGN KEY (id_structure)
        REFERENCES Structure(id_structure)
);
GO


-- =====================================================================
-- 4. PRESTATION
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Prestation')
CREATE TABLE Prestation (
    id_prestation   INT IDENTITY(1,1) PRIMARY KEY,
    montant         DECIMAL(10,2) NOT NULL
        CONSTRAINT CK_Prestation_montant CHECK (montant >= 0),
    date_prs        DATE          NOT NULL,
    type_prestation NVARCHAR(30)  NOT NULL
        CONSTRAINT CK_Prestation_type
        CHECK (type_prestation IN ('consultation', 'examen', 'pharmacie', 'hospitalisation')),
    id_patient      INT NOT NULL,
    id_utilisateur  INT NOT NULL,
    id_structure    INT NOT NULL,

    CONSTRAINT FK_Prestation_Patient FOREIGN KEY (id_patient)
        REFERENCES Patient(id_patient),
    CONSTRAINT FK_Prestation_Utilisateur FOREIGN KEY (id_utilisateur)
        REFERENCES Utilisateur(id_utilisateur),
    CONSTRAINT FK_Prestation_Structure FOREIGN KEY (id_structure)
        REFERENCES Structure(id_structure)
);
GO

-- Index sur les FK fréquemment filtrées
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Prestation_patient')
    CREATE INDEX IX_Prestation_patient ON Prestation(id_patient);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Prestation_date')
    CREATE INDEX IX_Prestation_date ON Prestation(date_prs);
GO


-- =====================================================================
-- 5. PRISE_EN_CHARGE  (avec CHECK sur statut)
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Prise_en_charge')
CREATE TABLE Prise_en_charge (
    id_pec              INT IDENTITY(1,1) PRIMARY KEY,
    montant_pec         DECIMAL(10,2) NOT NULL
        CONSTRAINT CK_PEC_montant CHECK (montant_pec >= 0),
    date_pec            DATE          NOT NULL,
    numero_de_feuille   NVARCHAR(255) NULL,
    type_feuille        NVARCHAR(255) NULL,
    id_acteur           INT           NOT NULL,
    statut              NVARCHAR(20)  NOT NULL
        CONSTRAINT CK_PEC_statut CHECK (statut IN ('en_attente', 'validee', 'rejetee')),
    id_prestation       INT           NOT NULL,

    CONSTRAINT FK_PriseEnCharge_Prestation FOREIGN KEY (id_prestation)
        REFERENCES Prestation(id_prestation),
    CONSTRAINT UQ_PriseEnCharge_Prestation UNIQUE (id_prestation),
    CONSTRAINT FK_PriseEnCharge_Acteur FOREIGN KEY (id_acteur)
        REFERENCES Utilisateur(id_utilisateur)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PEC_statut')
    CREATE INDEX IX_PEC_statut ON Prise_en_charge(statut);
GO


-- =====================================================================
-- 6. ORDONNANCE  (avec code_retrait UNIQUE, statuts étendus, lien pharmacie)
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Ordonnance')
CREATE TABLE Ordonnance (
    id_ordonnance      INT IDENTITY(1,1) PRIMARY KEY,
    date_ordonnance    DATE          NOT NULL,

    statut             NVARCHAR(25)  NOT NULL
        CONSTRAINT CK_Ordonnance_statut
        CHECK (statut IN ('en_attente', 'validee', 'envoyee',
                          'delivree', 'partiellement_delivree', 'annulee')),

    signature_medecin  NVARCHAR(255) NULL,
    cachet_medecin     NVARCHAR(255) NULL,
    signature_patient  NVARCHAR(255) NULL,

    code_retrait       NVARCHAR(50)  NULL,

    id_prestation              INT NOT NULL,
    id_utilisateur             INT NOT NULL,
    id_prestation_pharmacie    INT NULL,

    CONSTRAINT FK_Ordonnance_Prestation FOREIGN KEY (id_prestation)
        REFERENCES Prestation(id_prestation),
    CONSTRAINT FK_Ordonnance_Utilisateur FOREIGN KEY (id_utilisateur)
        REFERENCES Utilisateur(id_utilisateur),
    CONSTRAINT FK_Ordonnance_PrestationPharmacie FOREIGN KEY (id_prestation_pharmacie)
        REFERENCES Prestation(id_prestation)
);
GO

-- Code retrait unique (si non null) - filtre pour ne pas bloquer les multiples NULL
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Ordonnance_code_retrait')
    CREATE UNIQUE INDEX UQ_Ordonnance_code_retrait
        ON Ordonnance(code_retrait)
        WHERE code_retrait IS NOT NULL;
GO


-- =====================================================================
-- 7. EXAMEN  (avec CHECK sur statut)
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Examen')
CREATE TABLE Examen (
    id_examen       INT IDENTITY(1,1) PRIMARY KEY,
    type_examen     NVARCHAR(50)  NOT NULL,
    date_examen     DATE          NOT NULL,
    statut          NVARCHAR(20)  NOT NULL
        CONSTRAINT CK_Examen_statut
        CHECK (statut IN ('en_attente', 'en_cours', 'termine', 'annule')),
    id_prestation   INT NOT NULL,

    CONSTRAINT FK_Examen_Prestation FOREIGN KEY (id_prestation)
        REFERENCES Prestation(id_prestation)
);
GO


-- =====================================================================
-- 8. MEDICAMENTS  (avec prix unitaire)
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Medicaments')
CREATE TABLE Medicaments (
    id_medicament   INT IDENTITY(1,1) PRIMARY KEY,
    nom_medicament  NVARCHAR(100) NOT NULL,
    dosage          NVARCHAR(50)  NULL,
    quantite        INT           NOT NULL DEFAULT 0
        CONSTRAINT CK_Medicaments_quantite CHECK (quantite >= 0),
    prix            DECIMAL(10,2) NOT NULL DEFAULT 0
        CONSTRAINT CK_Medicaments_prix CHECK (prix >= 0),
    id_structure    INT NOT NULL,

    CONSTRAINT FK_Medicaments_Structure FOREIGN KEY (id_structure)
        REFERENCES Structure(id_structure)
);
GO


-- =====================================================================
-- 9. PRESCRIPTION  (avec traçabilité de délivrance)
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Prescription')
CREATE TABLE Prescription (
    id_ordonnance       INT NOT NULL,
    id_medicament       INT NOT NULL,
    posologie           NVARCHAR(100) NULL,
    quantite_prescrite  INT NOT NULL
        CONSTRAINT CK_Prescription_quantite CHECK (quantite_prescrite > 0),
    quantite_delivree   INT NULL DEFAULT 0,
    statut_delivrance   NVARCHAR(20) NULL
        CONSTRAINT CK_Prescription_statut
        CHECK (statut_delivrance IS NULL OR statut_delivrance IN ('en_attente', 'delivre', 'partiel', 'non_delivre')),

    CONSTRAINT PK_Prescription PRIMARY KEY (id_ordonnance, id_medicament),
    CONSTRAINT FK_Prescription_Ordonnance FOREIGN KEY (id_ordonnance)
        REFERENCES Ordonnance(id_ordonnance),
    CONSTRAINT FK_Prescription_Medicament FOREIGN KEY (id_medicament)
        REFERENCES Medicaments(id_medicament)
);
GO


-- =====================================================================
-- 10. PERMISSION
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Permission')
CREATE TABLE Permission (
    id_permission INT IDENTITY(1,1) PRIMARY KEY,
    code          NVARCHAR(50) NOT NULL UNIQUE,
    description   NVARCHAR(200) NULL
);
GO


-- =====================================================================
-- 11. ROLE_PERMISSION
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RolePermission')
CREATE TABLE RolePermission (
    role          NVARCHAR(30) NOT NULL,
    id_permission INT NOT NULL,

    CONSTRAINT PK_RolePermission PRIMARY KEY (role, id_permission),
    CONSTRAINT FK_RolePermission_Permission FOREIGN KEY (id_permission)
        REFERENCES Permission(id_permission)
);
GO


-- =====================================================================
-- 12. TAUX_COUVERTURE  (grille fonds → % de couverture)
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TauxCouverture')
CREATE TABLE TauxCouverture (
    fonds         TINYINT       NOT NULL PRIMARY KEY
        CONSTRAINT CK_TauxCouverture_fonds CHECK (fonds IN (1, 2, 3, 4)),
    taux_pourcent DECIMAL(5,2)  NOT NULL
        CONSTRAINT CK_TauxCouverture_taux CHECK (taux_pourcent BETWEEN 0 AND 100),
    libelle       NVARCHAR(50)  NULL
);
GO


-- =====================================================================
-- 13. TARIF  (montants fixes par type de prestation)
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Tarif')
CREATE TABLE Tarif (
    id_tarif        INT IDENTITY(1,1) PRIMARY KEY,
    type_prestation NVARCHAR(30)  NOT NULL UNIQUE,
    montant         DECIMAL(10,2) NOT NULL
        CONSTRAINT CK_Tarif_montant CHECK (montant >= 0)
);
GO


-- =====================================================================
-- ============== DONNEES INITIALES ====================================
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
MERGE Permission AS target
USING (VALUES
    -- Patients
    ('patient.lire',          'Voir la liste et les details des patients'),
    ('patient.creer',         'Creer un nouveau patient'),
    ('patient.modifier',      'Modifier les informations d''un patient'),
    ('patient.supprimer',     'Supprimer un patient'),

    -- Utilisateurs
    ('utilisateur.lire',      'Voir la liste des utilisateurs'),
    ('utilisateur.creer',     'Creer un nouvel utilisateur'),
    ('utilisateur.modifier',  'Modifier un utilisateur'),
    ('utilisateur.supprimer', 'Supprimer un utilisateur'),

    -- Permissions
    ('permission.lire',       'Voir les permissions des roles'),
    ('permission.gerer',      'Modifier les permissions des roles'),

    -- Prestations
    ('prestation.lire',       'Voir les prestations'),
    ('prestation.creer',      'Creer une prestation'),
    ('prestation.modifier',   'Modifier une prestation'),
    ('prestation.supprimer',  'Supprimer une prestation'),

    -- Ordonnances
    ('ordonnance.lire',       'Voir les ordonnances'),
    ('ordonnance.creer',      'Creer une ordonnance'),
    ('ordonnance.modifier',   'Modifier une ordonnance'),
    ('ordonnance.annuler',    'Annuler une ordonnance'),
    ('ordonnance.supprimer',  'Supprimer une ordonnance'),
    ('ordonnance.signer',     'Signer/apposer cachet'),
    ('ordonnance.delivrer',   'Delivrer les medicaments'),

    -- Structures
    ('structure.lire',        'Voir les structures'),
    ('structure.gerer',       'Gerer les structures'),

    -- Medicaments
    ('medicament.lire',       'Voir les medicaments'),
    ('medicament.creer',      'Creer un medicament'),
    ('medicament.modifier',   'Modifier un medicament'),
    ('medicament.supprimer',  'Supprimer un medicament'),

    -- Examens
    ('examen.lire',           'Voir les examens'),
    ('examen.creer',          'Creer un examen'),
    ('examen.modifier',       'Modifier un examen'),
    ('examen.supprimer',      'Supprimer un examen'),

    -- Prise_en_charge
    ('pec.lire',              'Voir les prises en charge'),
    ('pec.creer',             'Creer une prise en charge'),
    ('pec.valider',           'Valider/rejeter une prise en charge')
) AS src(code, description)
ON target.code = src.code
WHEN MATCHED THEN UPDATE SET description = src.description
WHEN NOT MATCHED THEN INSERT (code, description) VALUES (src.code, src.description);
GO


-- ---------------------------------------------------------------------
-- Permissions par rôle
-- ---------------------------------------------------------------------

-- ADMINISTRATEUR : toutes les permissions
INSERT INTO RolePermission (role, id_permission)
SELECT 'administrateur', id_permission FROM Permission
WHERE id_permission NOT IN (
    SELECT id_permission FROM RolePermission WHERE role = 'administrateur'
);
GO

-- AGENT D'ACCUEIL
INSERT INTO RolePermission (role, id_permission)
SELECT 'agent_accueil', id_permission FROM Permission
WHERE code IN (
    'patient.lire', 'patient.creer', 'patient.modifier',
    'prestation.lire', 'prestation.creer', 'prestation.modifier',
    'structure.lire',
    'pec.lire', 'pec.creer'
)
AND id_permission NOT IN (SELECT id_permission FROM RolePermission WHERE role = 'agent_accueil');
GO

-- MEDECIN
INSERT INTO RolePermission (role, id_permission)
SELECT 'medecin', id_permission FROM Permission
WHERE code IN (
    'patient.lire',
    'prestation.lire', 'prestation.creer', 'prestation.modifier',
    'ordonnance.lire', 'ordonnance.creer', 'ordonnance.modifier',
    'ordonnance.annuler', 'ordonnance.signer',
    'examen.lire', 'examen.creer', 'examen.modifier',
    'medicament.lire',
    'structure.lire',
    'pec.lire'
)
AND id_permission NOT IN (SELECT id_permission FROM RolePermission WHERE role = 'medecin');
GO

-- PHARMACIEN
INSERT INTO RolePermission (role, id_permission)
SELECT 'pharmacien', id_permission FROM Permission
WHERE code IN (
    'patient.lire',
    'ordonnance.lire', 'ordonnance.delivrer',
    'medicament.lire', 'medicament.creer', 'medicament.modifier', 'medicament.supprimer',
    'structure.lire'
)
AND id_permission NOT IN (SELECT id_permission FROM RolePermission WHERE role = 'pharmacien');
GO

-- DIRECTEUR DE STRUCTURE
INSERT INTO RolePermission (role, id_permission)
SELECT 'directeur_structure', id_permission FROM Permission
WHERE code IN (
    'patient.lire',
    'utilisateur.lire',
    'prestation.lire', 'prestation.modifier',
    'ordonnance.lire',
    'examen.lire',
    'medicament.lire',
    'structure.lire',
    'pec.lire', 'pec.valider'
)
AND id_permission NOT IN (SELECT id_permission FROM RolePermission WHERE role = 'directeur_structure');
GO

-- CAISSIER DE STRUCTURE
INSERT INTO RolePermission (role, id_permission)
SELECT 'caissier_structure', id_permission FROM Permission
WHERE code IN (
    'patient.lire',
    'prestation.lire',
    'structure.lire',
    'pec.lire'
)
AND id_permission NOT IN (SELECT id_permission FROM RolePermission WHERE role = 'caissier_structure');
GO


-- ---------------------------------------------------------------------
-- Grille de couverture (fonds → %)
-- ---------------------------------------------------------------------
MERGE TauxCouverture AS target
USING (VALUES
    (1, 40.00,  'Couverture faible'),
    (2, 60.00,  'Couverture moyenne'),
    (3, 80.00,  'Couverture elevee'),
    (4, 100.00, 'Couverture totale')
) AS src(fonds, taux_pourcent, libelle)
ON target.fonds = src.fonds
WHEN MATCHED THEN UPDATE SET taux_pourcent = src.taux_pourcent, libelle = src.libelle
WHEN NOT MATCHED THEN INSERT (fonds, taux_pourcent, libelle)
    VALUES (src.fonds, src.taux_pourcent, src.libelle);
GO


-- ---------------------------------------------------------------------
-- Tarifs fixes (consultation, hospitalisation)
-- ---------------------------------------------------------------------
MERGE Tarif AS target
USING (VALUES
    ('consultation',    5000.00),
    ('hospitalisation', 25000.00)
) AS src(type_prestation, montant)
ON target.type_prestation = src.type_prestation
WHEN MATCHED THEN UPDATE SET montant = src.montant
WHEN NOT MATCHED THEN INSERT (type_prestation, montant)
    VALUES (src.type_prestation, src.montant);
GO


-- =====================================================================
-- VERIFICATION FINALE
-- =====================================================================
PRINT '=== Tables creees ===';
SELECT name FROM sys.tables ORDER BY name;

PRINT '=== Grille de couverture ===';
SELECT * FROM TauxCouverture ORDER BY fonds;

PRINT '=== Tarifs ===';
SELECT * FROM Tarif ORDER BY type_prestation;

PRINT '=== Permissions par role ===';
SELECT rp.role, COUNT(*) AS nb_permissions
FROM RolePermission rp
GROUP BY rp.role
ORDER BY rp.role;
GO
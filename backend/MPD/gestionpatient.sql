-- =====================================================================
-- MODELE PHYSIQUE DE DONNEES (MPD) - SQL SERVER
-- Systeme de gestion de la prise en charge des assures
-- =====================================================================

-- Optionnel : recréer la base proprement
-- IF DB_ID('gestionPatients') IS NOT NULL DROP DATABASE gestionPatients;
-- CREATE DATABASE gestionPatients;
-- GO
-- USE gestionPatients;
-- GO

-- =====================================================================
-- 1. STRUCTURE
-- =====================================================================
CREATE TABLE Structure (
    id_structure    INT IDENTITY(1,1) PRIMARY KEY,
    raison_sociale  NVARCHAR(100) NOT NULL,
    addresse        NVARCHAR(200) NOT NULL,
    type_structure  NVARCHAR(30)  NOT NULL
        CONSTRAINT CK_Structure_type CHECK (type_structure IN ('hopital', 'pharmacie'))
);
GO

-- =====================================================================
-- 2. PATIENT  (avec gestion d'assuré principal)
-- =====================================================================
CREATE TABLE Patient (
    id_patient          INT IDENTITY(1,1) PRIMARY KEY,
    photo_url           NVARCHAR(255) NULL,
    prenom              NVARCHAR(100) NOT NULL,
    nom                 NVARCHAR(100) NOT NULL,
    sex                 NVARCHAR(10)  NOT NULL,
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

-- =====================================================================
-- 3. UTILISATEUR  (avec 2 rôles supplémentaires)
-- =====================================================================
CREATE TABLE Utilisateur (
    id_utilisateur      INT IDENTITY(1,1) PRIMARY KEY,

    -- Identifiants de connexion
    username            NVARCHAR(50)  NOT NULL,
    mot_de_passe        NVARCHAR(255) NOT NULL,   -- hash BCrypt

    -- Informations personnelles
    nom                 NVARCHAR(100) NOT NULL,
    email               NVARCHAR(150) NULL,
    telephone           NVARCHAR(20)  NULL,

    -- Rôle et rattachement
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

    -- Gestion du compte
    actif               BIT           NOT NULL DEFAULT 1,
    date_creation       DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    derniere_connexion  DATETIME2     NULL,

    -- Contraintes
    CONSTRAINT UQ_Utilisateur_username UNIQUE (username),
    CONSTRAINT FK_Utilisateur_Structure FOREIGN KEY (id_structure)
        REFERENCES Structure(id_structure)
);
GO

-- =====================================================================
-- 4. PRESTATION  (type_prestation nettoyé)
-- =====================================================================
CREATE TABLE Prestation (
    id_prestation   INT IDENTITY(1,1) PRIMARY KEY,
    montant         DECIMAL(10,2) NOT NULL,
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

-- =====================================================================
-- 5. PRISE_EN_CHARGE
-- =====================================================================
CREATE TABLE Prise_en_charge (
    id_pec              INT IDENTITY(1,1) PRIMARY KEY,
    montant_pec         DECIMAL(10,2) NOT NULL,
    date_pec            DATE          NOT NULL,
    numero_de_feuille   NVARCHAR(255) NULL,
    type_feuille        NVARCHAR(255) NULL,
    id_acteur           INT           NOT NULL,
    statut              NVARCHAR(20)  NOT NULL,
    id_prestation       INT           NOT NULL,

    CONSTRAINT FK_PriseEnCharge_Prestation FOREIGN KEY (id_prestation)
        REFERENCES Prestation(id_prestation),
    CONSTRAINT UQ_PriseEnCharge_Prestation UNIQUE (id_prestation),
    CONSTRAINT FK_PriseEnCharge_Acteur FOREIGN KEY (id_acteur)
        REFERENCES Utilisateur(id_utilisateur)
);
GO

-- =====================================================================
-- 6. ORDONNANCE
-- =====================================================================
CREATE TABLE Ordonnance (
    id_ordonnance      INT IDENTITY(1,1) PRIMARY KEY,
    date_ordonnance    DATE          NOT NULL,
    statut             NVARCHAR(20)  NOT NULL,
    signature_medecin  NVARCHAR(255) NULL,
    cachet_medecin     NVARCHAR(255) NULL,
    signature_patient  NVARCHAR(255) NULL,
    id_prestation      INT NOT NULL,
    id_utilisateur     INT NOT NULL,

    CONSTRAINT FK_Ordonnance_Prestation FOREIGN KEY (id_prestation)
        REFERENCES Prestation(id_prestation),
    CONSTRAINT FK_Ordonnance_Utilisateur FOREIGN KEY (id_utilisateur)
        REFERENCES Utilisateur(id_utilisateur)
);
GO

-- =====================================================================
-- 7. EXAMEN
-- =====================================================================
CREATE TABLE Examen (
    id_examen       INT IDENTITY(1,1) PRIMARY KEY,
    type_examen     NVARCHAR(50)  NOT NULL,
    date_examen     DATE          NOT NULL,
    statut          NVARCHAR(20)  NOT NULL,
    id_prestation   INT NOT NULL,

    CONSTRAINT FK_Examen_Prestation FOREIGN KEY (id_prestation)
        REFERENCES Prestation(id_prestation)
);
GO

-- =====================================================================
-- 8. MEDICAMENTS
-- =====================================================================
CREATE TABLE Medicaments (
    id_medicament   INT IDENTITY(1,1) PRIMARY KEY,
    nom_medicament  NVARCHAR(100) NOT NULL,
    dosage          NVARCHAR(50)  NULL,
    quantite        INT           NOT NULL DEFAULT 0,
    id_structure    INT NOT NULL,

    CONSTRAINT FK_Medicaments_Structure FOREIGN KEY (id_structure)
        REFERENCES Structure(id_structure)
);
GO

-- =====================================================================
-- 9. PRESCRIPTION
-- =====================================================================
CREATE TABLE Prescription (
    id_ordonnance       INT NOT NULL,
    id_medicament       INT NOT NULL,
    posologie           NVARCHAR(100) NULL,
    quantite_prescrite  INT NOT NULL,

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
CREATE TABLE Permission (
    id_permission INT IDENTITY(1,1) PRIMARY KEY,
    code          NVARCHAR(50) NOT NULL UNIQUE,
    description   NVARCHAR(200) NULL
);
GO

-- =====================================================================
-- 11. ROLE_PERMISSION  (relation many-to-many)
-- =====================================================================
CREATE TABLE RolePermission (
    role          NVARCHAR(30) NOT NULL,
    id_permission INT NOT NULL,

    CONSTRAINT PK_RolePermission PRIMARY KEY (role, id_permission),
    CONSTRAINT FK_RolePermission_Permission FOREIGN KEY (id_permission)
        REFERENCES Permission(id_permission)
);
GO
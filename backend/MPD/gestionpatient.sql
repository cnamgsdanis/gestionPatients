-- =====================================================================
-- MODELE PHYSIQUE DE DONNEES (MPD) - SQL SERVER
-- Systeme de gestion de la prise en charge des assures
-- Ordre de creation respectant les dependances de cles etrangeres :
--   1. Structure
--   2. Patient
--   3. Utilisateur      (depend de Structure)
--   4. Prestation        (depend de Patient, Utilisateur, Structure)
--   5. Prise_en_charge   (depend de Prestation)
--   6. Ordonnance        (depend de Prestation, Utilisateur)
--   7. Examen            (depend de Prestation)
--   8. Medicaments       (depend de Structure)
--   9. Prescription      (depend de Ordonnance, Medicaments)
-- =====================================================================

-- 1. STRUCTURE
CREATE TABLE Structure (
    id_structure    INT IDENTITY(1,1) PRIMARY KEY,
    raison_sociale  NVARCHAR(100) NOT NULL,
    addresse        NVARCHAR(200) NOT NULL,
    type_structure  NVARCHAR(30)  NOT NULL
        CONSTRAINT CK_Structure_type CHECK (type_structure IN ('hopital', 'pharmacie'))
);
GO

-- 2. PATIENT
CREATE TABLE Patient (
    id_patient      INT IDENTITY(1,1) PRIMARY KEY,
    prenom          NVARCHAR(100) NOT NULL,
    nom             NVARCHAR(100) NOT NULL,
    sex             NVARCHAR(10)  NOT NULL,
    contact         NVARCHAR(100) NULL,
    statut_assure   BIT           NOT NULL DEFAULT 0,
    fonds           DECIMAL(10,2) NULL,
    matricule_nag   NVARCHAR(50)  NULL
);
GO

-- 3. UTILISATEUR
CREATE TABLE Utilisateur (
    id_utilisateur  INT IDENTITY(1,1) PRIMARY KEY,
    nom             NVARCHAR(100) NOT NULL,
    role            NVARCHAR(20)  NOT NULL,
    mot_de_passe    NVARCHAR(255) NOT NULL,
    telephone       NVARCHAR(20)  NULL,
    id_structure    INT NOT NULL,
    CONSTRAINT FK_Utilisateur_Structure FOREIGN KEY (id_structure)
        REFERENCES Structure(id_structure)
);
GO

-- 4. PRESTATION
CREATE TABLE Prestation (
    id_prestation   INT IDENTITY(1,1) PRIMARY KEY,
    montant         DECIMAL(10,2) NOT NULL,
    date_prs        DATE          NOT NULL,
    type_prestation NVARCHAR(30)  NOT NULL,
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

-- 5. PRISE_EN_CHARGE
CREATE TABLE Prise_en_charge (
    id_pec          INT IDENTITY(1,1) PRIMARY KEY,
    montant_pec     DECIMAL(10,2) NOT NULL,
    date_pec        DATE          NOT NULL,
    statut          NVARCHAR(20)  NOT NULL,
    id_prestation   INT NOT NULL,
    CONSTRAINT FK_PriseEnCharge_Prestation FOREIGN KEY (id_prestation)
        REFERENCES Prestation(id_prestation),
    CONSTRAINT UQ_PriseEnCharge_Prestation UNIQUE (id_prestation)
);
GO

-- 6. ORDONNANCE
CREATE TABLE Ordonnance (
    id_ordonnance      INT IDENTITY(1,1) PRIMARY KEY,
    date_ordonnance    DATE          NOT NULL,
    statut             NVARCHAR(20)  NOT NULL,
    signature_medecin  BIT           NOT NULL DEFAULT 0,
    cachet_medecin     BIT           NOT NULL DEFAULT 0,
    signature_patient  BIT           NOT NULL DEFAULT 0,
    code_retrait       NVARCHAR(50)  NULL,
    id_prestation      INT NOT NULL,
    id_utilisateur     INT NOT NULL,
    CONSTRAINT FK_Ordonnance_Prestation FOREIGN KEY (id_prestation)
        REFERENCES Prestation(id_prestation),
    CONSTRAINT FK_Ordonnance_Utilisateur FOREIGN KEY (id_utilisateur)
        REFERENCES Utilisateur(id_utilisateur)
);
GO

-- 7. EXAMEN
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

-- 8. MEDICAMENTS
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

-- 9. PRESCRIPTION (table d'association Ordonnance <-> Medicaments, relation N,N)
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
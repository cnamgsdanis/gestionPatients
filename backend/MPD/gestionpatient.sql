-- =====================================================================
-- MODELE PHYSIQUE DE DONNEES (MPD) - SQL SERVER
-- Systeme de gestion de la prise en charge des assures
-- ---------------------------------------------------------------------
-- Version : 4.2 (NAG texte de 10 chiffres, nature, permissions de départ, profils multiples,
--           mot de passe temporaire, réglages système)
-- Date    : 2026-09-20
-- ---------------------------------------------------------------------
-- Script IDEMPOTENT : chaque structure est protégée par un IF NOT EXISTS.
-- Il sert à CRÉER la base (installation neuve) ET à METTRE À NIVEAU une base
-- créée avec une version précédente (section 13 bis : NAG INT → NVARCHAR(20),
-- colonne nature, colonnes de délivrance, statuts d'ordonnance).
--
-- À exécuter en UTF-8 avec l'option -I (identifiants entre guillemets, requise
-- par les index filtrés) :
--   sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\gestionpatient.sql
-- puis, pour les nouveaux modules (feuilles, règlements, messages, journal), dans l'ordre :
--   sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v5_integration_front.sql
--   sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v6_livraison_partielle_controles.sql
--   sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v7_profils_et_mdp_initial.sql
-- (v4.2 : la section 13 ter ci-dessous reprend déjà ce que la v7 ajoute à Utilisateur et le réglage
--  Parametre_systeme de la v6 ; les tables Feuille_soins, Ordonnance_ligne, Ordonnance_delivrance, Reglement,
--  Notification et Journal_evenement restent créées par les migrations v5 et v6.)
--
-- Contient les 13 tables :
--   1. Structure
--   2. Patient
--   3. Utilisateur
--   4. Prestation
--   5. Prise_en_charge
--   6. Ordonnance
--   7. Examen
--   8. Medicaments
--   9. Prescription
--  10. Permission
--  11. RolePermission
--  12. TauxCouverture
--  13. Tarif
-- puis : 13 bis. mise à niveau, 13 ter. profils / mot de passe temporaire / réglages système,
-- 14. données de départ (permissions et droits).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. CREATION / INITIALISATION DE LA BASE DE DONNEES
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = 'gestionpatient')
BEGIN
    CREATE DATABASE gestionpatient;
END
GO

USE gestionpatient;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO


-- =====================================================================
-- 1. STRUCTURE (hôpitaux et pharmacies)
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Structure')
BEGIN
    CREATE TABLE Structure (
        id_structure    INT IDENTITY(1,1) PRIMARY KEY,
        raison_sociale  NVARCHAR(100) NOT NULL,
        addresse        NVARCHAR(200) NOT NULL,
        type_structure  NVARCHAR(30)  NOT NULL
            CONSTRAINT CK_Structure_type CHECK (type_structure IN ('hopital', 'pharmacie'))
    );
END
GO


-- =====================================================================
-- 2. PATIENT
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Patient')
BEGIN
    CREATE TABLE Patient (
        id_patient          INT IDENTITY(1,1) PRIMARY KEY,
        photo_url           NVARCHAR(255) NULL,
        prenom              NVARCHAR(100) NOT NULL,
        nom                 NVARCHAR(100) NOT NULL,
        sex                 NVARCHAR(10)  NOT NULL
            CONSTRAINT CK_Patient_sex CHECK (sex IN ('M', 'F')),
        contact             NVARCHAR(100) NULL,
        adresse             NVARCHAR(255) NULL,
        date_naissance      DATE          NULL,
        -- statut de l'assuré : 1 = actif, 0 = SUSPENDU (un assuré suspendu ne peut recevoir aucune prestation)
        statut_assure       BIT           NOT NULL DEFAULT 0,
        fonds               TINYINT       NULL
            CONSTRAINT CK_Patient_fonds CHECK (fonds IN (1, 2, 3, 4)),

        -- NAG = TEXTE de exactement 10 chiffres (pas de plage numérique : 2345678901 est valide)
        matricule_nag       NVARCHAR(20)  NULL
            CONSTRAINT CK_Patient_nag_10
                CHECK (matricule_nag IS NULL OR matricule_nag LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),

        id_assure_principal INT           NULL,

        -- nature : 'Assuré principal' | 'Ayant droit' | 'Conjoint' (texte libre côté base)
        nature              NVARCHAR(50)  NULL,

        CONSTRAINT FK_Patient_AssurePrincipal
            FOREIGN KEY (id_assure_principal) REFERENCES Patient(id_patient)
    );
END
GO

-- Unicité du NAG (plusieurs NULL autorisés via index filtré)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Patient_matricule_nag' AND object_id = OBJECT_ID('Patient'))
BEGIN
    CREATE UNIQUE INDEX UQ_Patient_matricule_nag
        ON Patient(matricule_nag)
        WHERE matricule_nag IS NOT NULL;
END
GO

-- Unicité du téléphone (plusieurs NULL autorisés via index filtré).
-- (Une contrainte UNIQUE classique n'accepterait qu'UN SEUL assuré sans téléphone.)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Patient_contact' AND object_id = OBJECT_ID('Patient'))
BEGIN
    CREATE UNIQUE INDEX UX_Patient_contact
        ON Patient(contact)
        WHERE contact IS NOT NULL;
END
GO

-- Index pour la recherche rapide par matricule NAG
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Patient_matricule_nag' AND object_id = OBJECT_ID('Patient'))
BEGIN
    CREATE INDEX IX_Patient_matricule_nag ON Patient(matricule_nag);
END
GO


-- =====================================================================
-- 3. UTILISATEUR
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Utilisateur')
BEGIN
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
        id_structure        INT           NOT NULL,
        actif               BIT           NOT NULL DEFAULT 1,
        date_creation       DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
        derniere_connexion  DATETIME2     NULL,

        CONSTRAINT UQ_Utilisateur_username UNIQUE (username),
        CONSTRAINT FK_Utilisateur_Structure FOREIGN KEY (id_structure)
            REFERENCES Structure(id_structure)
    );
END
GO


-- =====================================================================
-- 4. PRESTATION
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Prestation')
BEGIN
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
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Prestation_patient' AND object_id = OBJECT_ID('Prestation'))
    CREATE INDEX IX_Prestation_patient ON Prestation(id_patient);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Prestation_date' AND object_id = OBJECT_ID('Prestation'))
    CREATE INDEX IX_Prestation_date ON Prestation(date_prs);
GO


-- =====================================================================
-- 5. PRISE_EN_CHARGE
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Prise_en_charge')
BEGIN
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
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PEC_statut' AND object_id = OBJECT_ID('Prise_en_charge'))
    CREATE INDEX IX_PEC_statut ON Prise_en_charge(statut);
GO


-- =====================================================================
-- 6. ORDONNANCE
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Ordonnance')
BEGIN
    CREATE TABLE Ordonnance (
        id_ordonnance           INT IDENTITY(1,1) PRIMARY KEY,
        date_ordonnance         DATE          NOT NULL,
        statut                  NVARCHAR(25)  NOT NULL
            CONSTRAINT CK_Ordonnance_statut
            CHECK (statut IN ('en_attente', 'validee', 'envoyee',
                              'delivree', 'partiellement_delivree', 'annulee')),
        signature_medecin       NVARCHAR(255) NULL,
        cachet_medecin          NVARCHAR(255) NULL,
        signature_patient       NVARCHAR(255) NULL,
        code_retrait            NVARCHAR(50)  NULL,
        id_prestation           INT NOT NULL,
        id_utilisateur          INT NOT NULL,
        id_prestation_pharmacie INT NULL,

        CONSTRAINT FK_Ordonnance_Prestation FOREIGN KEY (id_prestation)
            REFERENCES Prestation(id_prestation),
        CONSTRAINT FK_Ordonnance_Utilisateur FOREIGN KEY (id_utilisateur)
            REFERENCES Utilisateur(id_utilisateur),
        CONSTRAINT FK_Ordonnance_PrestationPharmacie FOREIGN KEY (id_prestation_pharmacie)
            REFERENCES Prestation(id_prestation)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Ordonnance_code_retrait' AND object_id = OBJECT_ID('Ordonnance'))
BEGIN
    CREATE UNIQUE INDEX UQ_Ordonnance_code_retrait
        ON Ordonnance(code_retrait)
        WHERE code_retrait IS NOT NULL;
END
GO


-- =====================================================================
-- 7. EXAMEN
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Examen')
BEGIN
    CREATE TABLE Examen (
        id_examen     INT IDENTITY(1,1) PRIMARY KEY,
        type_examen   NVARCHAR(50)  NOT NULL,
        date_examen   DATE          NOT NULL,
        statut        NVARCHAR(20)  NOT NULL
            CONSTRAINT CK_Examen_statut
            CHECK (statut IN ('en_attente', 'en_cours', 'termine', 'annule')),
        id_prestation INT NOT NULL,

        CONSTRAINT FK_Examen_Prestation FOREIGN KEY (id_prestation)
            REFERENCES Prestation(id_prestation)
    );
END
GO


-- =====================================================================
-- 8. MEDICAMENTS
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Medicaments')
BEGIN
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
END
GO


-- =====================================================================
-- 9. PRESCRIPTION
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Prescription')
BEGIN
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
END
GO


-- =====================================================================
-- 10. PERMISSION
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Permission')
BEGIN
    CREATE TABLE Permission (
        id_permission INT IDENTITY(1,1) PRIMARY KEY,
        code          NVARCHAR(50) NOT NULL UNIQUE,
        description   NVARCHAR(200) NULL
    );
END
GO


-- =====================================================================
-- 11. ROLE_PERMISSION
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RolePermission')
BEGIN
    CREATE TABLE RolePermission (
        role          NVARCHAR(30) NOT NULL,
        id_permission INT NOT NULL,

        CONSTRAINT PK_RolePermission PRIMARY KEY (role, id_permission),
        CONSTRAINT FK_RolePermission_Permission FOREIGN KEY (id_permission)
            REFERENCES Permission(id_permission)
    );
END
GO


-- =====================================================================
-- 12. TAUX_COUVERTURE
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TauxCouverture')
BEGIN
    CREATE TABLE TauxCouverture (
        id_taux          INT IDENTITY(1,1) PRIMARY KEY,
        fonds            TINYINT       NOT NULL
            CONSTRAINT CK_TauxCouverture_fonds CHECK (fonds IN (1, 2, 3, 4)),
        type_prestation  NVARCHAR(30)  NOT NULL
            CONSTRAINT CK_TauxCouverture_type
            CHECK (type_prestation IN ('consultation', 'examen', 'pharmacie', 'hospitalisation')),
        pourcentage_pec  DECIMAL(5,2)  NOT NULL
            CONSTRAINT CK_TauxCouverture_pourcentage CHECK (pourcentage_pec >= 0 AND pourcentage_pec <= 100),

        CONSTRAINT UQ_TauxCouverture_Fonds_Type UNIQUE (fonds, type_prestation)
    );
END
GO


-- =====================================================================
-- 13. TARIF
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Tarif')
BEGIN
    CREATE TABLE Tarif (
        id_tarif        INT IDENTITY(1,1) PRIMARY KEY,
        type_prestation NVARCHAR(30)  NOT NULL
            CONSTRAINT CK_Tarif_type
            CHECK (type_prestation IN ('consultation', 'examen', 'pharmacie', 'hospitalisation')),
        code_acte       NVARCHAR(50)  NULL,
        libelle         NVARCHAR(150) NOT NULL,
        montant_tarif   DECIMAL(10,2) NOT NULL
            CONSTRAINT CK_Tarif_montant CHECK (montant_tarif >= 0),
        id_structure    INT NOT NULL,

        CONSTRAINT FK_Tarif_Structure FOREIGN KEY (id_structure)
            REFERENCES Structure(id_structure)
    );
END
GO

-- =====================================================================
-- 13 bis. MISE A NIVEAU d'une base créée avec une version précédente du script
--         (sans effet sur une installation neuve). Idempotent.
-- =====================================================================

-- a) Patient.nature
IF COL_LENGTH('Patient', 'nature') IS NULL
    ALTER TABLE Patient ADD nature NVARCHAR(50) NULL;
GO

-- b) Patient.matricule_nag : INT (v4.0) -> NVARCHAR(20) (10 chiffres)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Patient') AND name = 'matricule_nag' AND system_type_id = 56)   -- 56 = int
BEGIN
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Patient_nag_10' AND parent_object_id = OBJECT_ID('Patient'))
        ALTER TABLE Patient DROP CONSTRAINT CK_Patient_nag_10;
    IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_Patient_matricule_nag' AND parent_object_id = OBJECT_ID('Patient'))
        ALTER TABLE Patient DROP CONSTRAINT UQ_Patient_matricule_nag;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Patient_matricule_nag' AND object_id = OBJECT_ID('Patient'))
        DROP INDEX UQ_Patient_matricule_nag ON Patient;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Patient_matricule_nag' AND object_id = OBJECT_ID('Patient'))
        DROP INDEX IX_Patient_matricule_nag ON Patient;
    ALTER TABLE Patient ALTER COLUMN matricule_nag NVARCHAR(20) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Patient_nag_10' AND parent_object_id = OBJECT_ID('Patient'))
    ALTER TABLE Patient ADD CONSTRAINT CK_Patient_nag_10
        CHECK (matricule_nag IS NULL OR matricule_nag LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Patient_matricule_nag' AND object_id = OBJECT_ID('Patient'))
    CREATE UNIQUE INDEX UQ_Patient_matricule_nag ON Patient(matricule_nag) WHERE matricule_nag IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Patient_matricule_nag' AND object_id = OBJECT_ID('Patient'))
    CREATE INDEX IX_Patient_matricule_nag ON Patient(matricule_nag);
GO

-- c) Patient.contact : ancienne unicité (contrainte UNIQUE classique, ou index filtré nommé UQ_Patient_contact)
--    -> index filtré UX_Patient_contact (créé AVANT la suppression de l'ancien)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Patient_contact' AND object_id = OBJECT_ID('Patient'))
    CREATE UNIQUE INDEX UX_Patient_contact ON Patient(contact) WHERE contact IS NOT NULL;
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_Patient_contact' AND parent_object_id = OBJECT_ID('Patient'))
    ALTER TABLE Patient DROP CONSTRAINT UQ_Patient_contact;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Patient_contact' AND object_id = OBJECT_ID('Patient'))
    DROP INDEX UQ_Patient_contact ON Patient;
GO

-- d) Prescription : suivi de ce qui est réellement délivré
IF COL_LENGTH('Prescription', 'quantite_delivree') IS NULL
    ALTER TABLE Prescription ADD quantite_delivree INT NULL DEFAULT 0;
GO
IF COL_LENGTH('Prescription', 'statut_delivrance') IS NULL
BEGIN
    ALTER TABLE Prescription ADD statut_delivrance NVARCHAR(20) NULL;
    -- les lignes déjà présentes sont « non délivrées » au départ
    EXEC('UPDATE Prescription SET statut_delivrance = ''en_attente'' WHERE statut_delivrance IS NULL');
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Prescription_statut' AND parent_object_id = OBJECT_ID('Prescription'))
    ALTER TABLE Prescription ADD CONSTRAINT CK_Prescription_statut
        CHECK (statut_delivrance IS NULL OR statut_delivrance IN ('en_attente', 'delivre', 'partiel', 'non_delivre'));
GO

-- e) Ordonnance : statuts élargis (délivrance partielle)
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Ordonnance_statut' AND parent_object_id = OBJECT_ID('Ordonnance')
           AND definition NOT LIKE '%partiellement_delivree%')
BEGIN
    ALTER TABLE Ordonnance DROP CONSTRAINT CK_Ordonnance_statut;
    ALTER TABLE Ordonnance ADD CONSTRAINT CK_Ordonnance_statut
        CHECK (statut IN ('en_attente', 'validee', 'envoyee', 'delivree', 'partiellement_delivree', 'annulee'));
END
GO

-- =====================================================================
-- 13 ter. PROFILS MULTIPLES, MOT DE PASSE TEMPORAIRE, REGLAGES SYSTEME (v4.2)
--         Idempotent ; identique à migration_v7_profils_et_mdp_initial.sql (Utilisateur)
--         et à la partie « Parametre_systeme » de migration_v6_livraison_partielle_controles.sql.
-- =====================================================================

-- a) Utilisateur_profil : les profils (rôles) de chaque compte. Utilisateur.role reste le PROFIL PRINCIPAL
--    (celui de la connexion par défaut) ; il figure toujours dans cette table.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Utilisateur_profil')
BEGIN
    CREATE TABLE Utilisateur_profil (
        id_utilisateur INT          NOT NULL
            CONSTRAINT FK_UProfil_Utilisateur REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
        profil         NVARCHAR(30) NOT NULL
            CONSTRAINT CK_UProfil_profil CHECK (profil IN (
                'administrateur', 'agent_accueil', 'pharmacien', 'medecin', 'directeur_structure', 'caissier_structure')),
        date_ajout     DATETIME2    NOT NULL CONSTRAINT DF_UProfil_date DEFAULT SYSDATETIME(),
        CONSTRAINT PK_Utilisateur_profil PRIMARY KEY (id_utilisateur, profil)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UProfil_profil')
    CREATE INDEX IX_UProfil_profil ON Utilisateur_profil (profil, id_utilisateur);
GO
INSERT INTO Utilisateur_profil (id_utilisateur, profil)
SELECT u.id_utilisateur, u.role
FROM Utilisateur u
WHERE NOT EXISTS (SELECT 1 FROM Utilisateur_profil p WHERE p.id_utilisateur = u.id_utilisateur AND p.profil = u.role);
GO

-- b) Utilisateur.doit_changer_mdp : 1 = mot de passe TEMPORAIRE (compte créé ou réinitialisé par un administrateur),
--    à remplacer à la première connexion ; les comptes existants ne sont pas concernés (0).
IF COL_LENGTH('Utilisateur', 'doit_changer_mdp') IS NULL
    ALTER TABLE Utilisateur ADD doit_changer_mdp BIT NOT NULL CONSTRAINT DF_Utilisateur_chgmdp DEFAULT 0;
GO

-- c) Parametre_systeme : réglages modifiables par l'administrateur.
--    controles_antifraude = '1' (actifs, défaut) | '0' (désactivés : mode supervision de l'administrateur)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Parametre_systeme')
BEGIN
    CREATE TABLE Parametre_systeme (
        cle          NVARCHAR(60)  NOT NULL CONSTRAINT PK_Parametre_systeme PRIMARY KEY,
        valeur       NVARCHAR(200) NOT NULL,
        modifie_par  INT NULL CONSTRAINT FK_Parametre_Utilisateur REFERENCES Utilisateur(id_utilisateur),
        modifie_le   DATETIME2 NOT NULL CONSTRAINT DF_Parametre_date DEFAULT SYSDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM Parametre_systeme WHERE cle = 'controles_antifraude')
    INSERT INTO Parametre_systeme (cle, valeur) VALUES ('controles_antifraude', '1');
GO


-- =====================================================================
-- 14. DONNEES DE DEPART : permissions et droits par rôle
-- ---------------------------------------------------------------------
-- Sans ces lignes, AuthGuard.verifierPermission() refuse tout le monde (y compris
-- l'administrateur) : le cache de PermissionService reste vide.
-- Idempotent. Les droits PAR DÉFAUT ne sont donnés qu'aux permissions créées par
-- cette exécution : relancer le script ne remet pas un droit retiré par un administrateur.
-- Les permissions des nouveaux modules (feuille.*, reglement.*, notification.*, journal.*)
-- sont créées par migration_v5_integration_front.sql.
-- Descriptions sans accents (compatibilité des consoles).
-- =====================================================================
DECLARE @perm TABLE (code NVARCHAR(50), description NVARCHAR(200));
INSERT INTO @perm (code, description) VALUES
 ('patient.lire',          'Voir la liste et le detail des patients'),
 ('patient.creer',         'Creer un patient'),
 ('patient.modifier',      'Modifier un patient'),
 ('patient.supprimer',     'Supprimer un patient'),
 ('utilisateur.lire',      'Voir la liste des utilisateurs'),
 ('utilisateur.creer',     'Creer un utilisateur'),
 ('utilisateur.modifier',  'Modifier un utilisateur'),
 ('utilisateur.supprimer', 'Supprimer un utilisateur'),
 ('permission.lire',       'Voir les permissions des roles'),
 ('permission.gerer',      'Modifier les permissions des roles'),
 ('prestation.lire',       'Voir les prestations'),
 ('prestation.creer',      'Creer une prestation'),
 ('prestation.modifier',   'Modifier une prestation'),
 ('prestation.supprimer',  'Supprimer une prestation'),
 ('ordonnance.lire',       'Voir les ordonnances'),
 ('ordonnance.creer',      'Creer une ordonnance'),
 ('ordonnance.modifier',   'Modifier une ordonnance'),
 ('ordonnance.signer',     'Signer une ordonnance'),
 ('ordonnance.annuler',    'Annuler une ordonnance'),
 ('ordonnance.delivrer',   'Delivrer les medicaments'),
 ('examen.lire',           'Voir les examens'),
 ('examen.creer',          'Creer un examen'),
 ('examen.modifier',       'Modifier un examen'),
 ('examen.supprimer',      'Supprimer un examen'),
 ('pec.lire',              'Voir les prises en charge'),
 ('pec.creer',             'Creer une prise en charge'),
 ('pec.valider',           'Valider/rejeter une prise en charge'),
 ('medicament.lire',       'Voir les medicaments'),
 ('medicament.creer',      'Creer un medicament'),
 ('medicament.modifier',   'Modifier un medicament'),
 ('medicament.supprimer',  'Supprimer un medicament'),
 ('structure.lire',        'Voir les structures'),
 ('structure.gerer',       'Gerer les structures'),
 ('controle.gerer',        'Activer ou desactiver les controles anti-fraude');

DECLARE @nouvelles TABLE (id_permission INT, code NVARCHAR(50));
INSERT INTO Permission (code, description)
OUTPUT inserted.id_permission, inserted.code INTO @nouvelles
SELECT p.code, p.description FROM @perm p
WHERE NOT EXISTS (SELECT 1 FROM Permission x WHERE x.code = p.code);

DECLARE @roles TABLE (role NVARCHAR(30), code NVARCHAR(50));
INSERT INTO @roles (role, code) VALUES
 -- agent d'accueil
 ('agent_accueil','patient.lire'), ('agent_accueil','patient.creer'), ('agent_accueil','patient.modifier'),
 ('agent_accueil','prestation.lire'), ('agent_accueil','prestation.creer'), ('agent_accueil','prestation.modifier'), ('agent_accueil','prestation.supprimer'),
 ('agent_accueil','structure.lire'), ('agent_accueil','pec.lire'),
 -- medecin
 ('medecin','patient.lire'), ('medecin','prestation.lire'), ('medecin','prestation.creer'), ('medecin','prestation.modifier'),
 ('medecin','ordonnance.lire'), ('medecin','ordonnance.creer'), ('medecin','ordonnance.modifier'), ('medecin','ordonnance.signer'),
 ('medecin','examen.lire'), ('medecin','examen.creer'), ('medecin','examen.modifier'), ('medecin','pec.lire'), ('medecin','structure.lire'),
 -- pharmacien
 ('pharmacien','patient.lire'), ('pharmacien','ordonnance.lire'), ('pharmacien','ordonnance.delivrer'), ('pharmacien','structure.lire'),
 -- directeur de structure
 ('directeur_structure','patient.lire'), ('directeur_structure','utilisateur.lire'), ('directeur_structure','prestation.lire'),
 ('directeur_structure','ordonnance.lire'), ('directeur_structure','examen.lire'), ('directeur_structure','pec.lire'), ('directeur_structure','structure.lire'),
 -- caissier de structure
 ('caissier_structure','patient.lire'), ('caissier_structure','prestation.lire'), ('caissier_structure','pec.lire'), ('caissier_structure','structure.lire');

INSERT INTO RolePermission (role, id_permission)
SELECT r.role, n.id_permission FROM @roles r JOIN @nouvelles n ON n.code = r.code
WHERE NOT EXISTS (SELECT 1 FROM RolePermission x WHERE x.role = r.role AND x.id_permission = n.id_permission);

-- l'administrateur reçoit toutes les permissions créées
INSERT INTO RolePermission (role, id_permission)
SELECT 'administrateur', n.id_permission FROM @nouvelles n
WHERE NOT EXISTS (SELECT 1 FROM RolePermission x WHERE x.role = 'administrateur' AND x.id_permission = n.id_permission);
GO

PRINT 'Creation / mise a niveau du schema de base de donnees terminee avec succes.';
SELECT (SELECT COUNT(*) FROM Permission) AS permissions, (SELECT COUNT(*) FROM RolePermission) AS droits_par_role;
GO
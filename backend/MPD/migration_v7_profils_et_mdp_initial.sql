-- =====================================================================
-- migration_v7_profils_et_mdp_initial.sql
-- ---------------------------------------------------------------------
--  1. PLUSIEURS PROFILS PAR UTILISATEUR
--     Un « profil » est un rôle (administrateur, medecin, pharmacien, ...) : c'est lui qui
--     décide des interfaces (écrans) et des droits. Un compte peut en porter plusieurs
--     (ex. un médecin qui est aussi chef de la pharmacie de l'hôpital) et l'administrateur
--     en ajoute ou en retire depuis « Gestion des utilisateurs ».
--       * NOUVELLE table Utilisateur_profil (id_utilisateur, profil, date_ajout)
--       * Utilisateur.role reste le PROFIL PRINCIPAL (celui utilisé par défaut à la connexion) ;
--         il figure toujours dans Utilisateur_profil
--       * les comptes existants reçoivent leur rôle actuel comme unique profil
--  2. MOT DE PASSE À CHANGER À LA PREMIÈRE CONNEXION
--       * Utilisateur.doit_changer_mdp (BIT, 0 par défaut : les comptes existants ne sont pas concernés)
--         mis à 1 quand un administrateur crée un compte ou réinitialise un mot de passe,
--         remis à 0 quand l'utilisateur choisit son propre mot de passe
--
-- 100 % ADDITIF et IDEMPOTENT. À exécuter après migration_v6_livraison_partielle_controles.sql :
--   sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v7_profils_et_mdp_initial.sql
-- Documentation : backend/docs/05-integration-front.md (sections 14 et 15)
-- =====================================================================

USE gestionpatient;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------
-- 1. Utilisateur_profil : les profils (rôles) de chaque compte
-- ---------------------------------------------------------------------
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

-- Chaque compte existant garde son rôle actuel comme profil (principal)
INSERT INTO Utilisateur_profil (id_utilisateur, profil)
SELECT u.id_utilisateur, u.role
FROM Utilisateur u
WHERE NOT EXISTS (SELECT 1 FROM Utilisateur_profil p WHERE p.id_utilisateur = u.id_utilisateur AND p.profil = u.role);
GO

-- ---------------------------------------------------------------------
-- 2. Utilisateur.doit_changer_mdp : mot de passe temporaire à remplacer
-- ---------------------------------------------------------------------
IF COL_LENGTH('Utilisateur', 'doit_changer_mdp') IS NULL
    ALTER TABLE Utilisateur ADD doit_changer_mdp BIT NOT NULL CONSTRAINT DF_Utilisateur_chgmdp DEFAULT 0;
GO

SELECT 'Migration v7 terminee' AS etat,
       (SELECT COUNT(*) FROM Utilisateur_profil) AS profils,
       (SELECT COUNT(*) FROM Utilisateur WHERE doit_changer_mdp = 1) AS comptes_a_changer_mdp;
GO

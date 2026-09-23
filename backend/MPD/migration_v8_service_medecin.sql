-- =====================================================================
-- migration_v8_service_medecin.sql
-- ---------------------------------------------------------------------
--  SERVICE MEDICAL DU MEDECIN
--    * NOUVELLE colonne Utilisateur.service (NVARCHAR(50), NULL) : le service
--      médical du compte (Cardiologie, Pédiatrie, ...), pertinent pour les
--      comptes médecin. Même liste que le menu « Service » du formulaire
--      Nouvelle prise en charge (frontend/index.html, #pec-service).
--    * Permet d'afficher le service du médecin connecté dans l'Espace Médecin
--      et d'y filtrer la file d'attente par service, en plus du filtre
--      « mes patients / tous les médecins » déjà existant.
--
-- 100 % ADDITIF et IDEMPOTENT. À exécuter après migration_v7_profils_et_mdp_initial.sql :
--   sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v8_service_medecin.sql
-- =====================================================================

USE gestionpatient;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('Utilisateur', 'service') IS NULL
    ALTER TABLE Utilisateur ADD service NVARCHAR(50) NULL;
GO

SELECT 'Migration v8 terminee' AS etat,
       (SELECT COUNT(*) FROM Utilisateur WHERE service IS NOT NULL) AS comptes_avec_service;
GO

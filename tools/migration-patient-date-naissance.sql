-- ==========================================================================
-- migration-patient-date-naissance.sql — Ajoute Patient.date_naissance
-- --------------------------------------------------------------------------
-- Ni le schéma initial (backend/MPD/gestionpatient.sql) ni la spec du
-- Dossier Patient ne prévoyaient de date de naissance — champ ajouté après
-- coup car le manque se voyait dans l'UI ("Date de naissance : —").
-- Migration additive, nullable : sans risque pour les lignes existantes.
--
-- Usage : sqlcmd -S <serveur> -E -i tools/migration-patient-date-naissance.sql
--         (ou -U sa -P <mot de passe> selon l'authentification utilisée)
-- Idempotent : peut être relancé sans erreur.
-- ==========================================================================

USE gestionPatients;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('Patient') AND name = 'date_naissance'
)
BEGIN
    ALTER TABLE Patient ADD date_naissance DATE NULL;
END
GO

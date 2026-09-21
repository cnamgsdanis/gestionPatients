-- =====================================================================
-- donnees_demo.sql — 3 assurés de DÉMONSTRATION (facultatif)
-- ---------------------------------------------------------------------
-- Pour essayer le circuit sans avoir d'assurés en base : un assuré actif,
-- son ayant droit, et un assuré SUSPENDU (aucune prestation possible).
-- Les noms commencent par « DEMO » pour les reconnaître et les supprimer.
--
-- Idempotent. À exécuter après migration_v5_integration_front.sql :
--   sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\donnees_demo.sql
--
-- Pour les retirer (uniquement s'ils n'ont aucune prestation) :
--   DELETE FROM Patient WHERE nom LIKE N'DEMO%' AND id_assure_principal IS NOT NULL;
--   DELETE FROM Patient WHERE nom LIKE N'DEMO%';
-- =====================================================================

USE gestionpatient;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Patient WHERE matricule_nag = '1000000001')
    INSERT INTO Patient (prenom, nom, sex, contact, adresse, date_naissance, statut_assure, fonds, matricule_nag, nature)
    VALUES (N'Sylvie', N'DEMO MOUSSAVOU', 'F', '060000001', N'Libreville', '1988-03-14', 1, 2, '1000000001', N'Assuré principal');

IF NOT EXISTS (SELECT 1 FROM Patient WHERE matricule_nag = '1000000002')
    INSERT INTO Patient (prenom, nom, sex, contact, adresse, date_naissance, statut_assure, fonds, matricule_nag, id_assure_principal, nature)
    VALUES (N'Junior', N'DEMO MOUSSAVOU', 'M', '060000002', N'Libreville', '2016-07-02', 1, 2, '1000000002',
            (SELECT id_patient FROM Patient WHERE matricule_nag = '1000000001'), N'Ayant droit');

IF NOT EXISTS (SELECT 1 FROM Patient WHERE matricule_nag = '1000000003')
    INSERT INTO Patient (prenom, nom, sex, contact, adresse, date_naissance, statut_assure, fonds, matricule_nag, nature)
    VALUES (N'Thierry', N'DEMO NDOUTOUME', 'M', '060000003', N'Port-Gentil', '1975-11-21', 0, 1, '1000000003', N'Assuré principal');
GO

SELECT matricule_nag AS NAG, prenom, nom, nature, CASE statut_assure WHEN 1 THEN 'actif' ELSE 'SUSPENDU' END AS statut
FROM Patient WHERE nom LIKE N'DEMO%' ORDER BY matricule_nag;
GO

-- ==========================================================================
-- migration-dossier-patient.sql — Module "Dossier Patient" (Consultations /
-- Examens), CREATE/READ/UPDATE uniquement, jamais de suppression.
-- --------------------------------------------------------------------------
-- Complète le schéma existant (backend/MPD/gestionpatient.sql,
-- tools/seed-database.sql) sans rien casser :
--   1) Patient.adresse — colonne requise par la spec du dossier patient,
--      absente du schéma initial. Ajout additif, nullable : sans risque pour
--      les lignes existantes.
--   2) Nouveaux codes de permission : prestation.modifier (existait déjà en
--      lire/creer, il manquait modifier pour permettre au médecin de
--      modifier une consultation), examen.lire / examen.creer /
--      examen.modifier (le module Examen n'avait encore aucun code réservé).
--      Volontairement AUCUN prestation.supprimer ni examen.supprimer : la
--      spec interdit la suppression d'une consultation ou d'un examen, donc
--      aucune route API ne l'implémente et aucune permission ne l'autorise.
--
-- Usage : sqlcmd -S <serveur> -E -i tools/migration-dossier-patient.sql
--         (ou -U sa -P <mot de passe> selon l'authentification utilisée)
-- Idempotent : peut être relancé sans dupliquer les données.
-- ⚠️ PermissionService met les permissions en cache au démarrage du serveur
-- (voir backend/service/PermissionService.java) : redémarrer le backend
-- Java après avoir exécuté ce script pour que les nouveaux codes prennent
-- effet (verifierPermission("examen.lire"...) échouerait sinon jusqu'au
-- prochain redémarrage).
-- ==========================================================================

USE gestionPatients;
GO

-- ---- 1. Patient.adresse ---------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('Patient') AND name = 'adresse'
)
BEGIN
    ALTER TABLE Patient ADD adresse NVARCHAR(255) NULL;
END
GO

-- ---- 2. Nouveaux codes de permission ---------------------------------------
IF NOT EXISTS (SELECT 1 FROM Permission WHERE code = 'prestation.modifier')
    INSERT INTO Permission (code, description) VALUES ('prestation.modifier', 'Modifier une prestation (consultation)');
GO
IF NOT EXISTS (SELECT 1 FROM Permission WHERE code = 'examen.lire')
    INSERT INTO Permission (code, description) VALUES ('examen.lire', 'Voir les examens');
GO
IF NOT EXISTS (SELECT 1 FROM Permission WHERE code = 'examen.creer')
    INSERT INTO Permission (code, description) VALUES ('examen.creer', 'Creer un examen');
GO
IF NOT EXISTS (SELECT 1 FROM Permission WHERE code = 'examen.modifier')
    INSERT INTO Permission (code, description) VALUES ('examen.modifier', 'Modifier un examen');
GO

-- ---- 3. Attribution par rôle ------------------------------------------------
-- administrateur : toutes les permissions, y compris les nouvelles.
INSERT INTO RolePermission (role, id_permission)
SELECT 'administrateur', p.id_permission
FROM Permission p
WHERE p.code IN ('prestation.modifier', 'examen.lire', 'examen.creer', 'examen.modifier')
  AND NOT EXISTS (
      SELECT 1 FROM RolePermission rp
      WHERE rp.role = 'administrateur' AND rp.id_permission = p.id_permission
  );
GO

-- medecin : peut créer/lire/modifier consultations et examens (jamais supprimer).
INSERT INTO RolePermission (role, id_permission)
SELECT 'medecin', p.id_permission
FROM Permission p
WHERE p.code IN ('prestation.modifier', 'examen.lire', 'examen.creer', 'examen.modifier')
  AND NOT EXISTS (
      SELECT 1 FROM RolePermission rp
      WHERE rp.role = 'medecin' AND rp.id_permission = p.id_permission
  );
GO

-- agent_accueil, directeur_structure, caissier_structure : lecture seule sur
-- les examens, en cohérence avec le prestation.lire déjà accordé à ces rôles
-- dans tools/seed-database.sql.
INSERT INTO RolePermission (role, id_permission)
SELECT r.role, p.id_permission
FROM Permission p
CROSS JOIN (VALUES ('agent_accueil'), ('directeur_structure'), ('caissier_structure')) AS r(role)
WHERE p.code = 'examen.lire'
  AND NOT EXISTS (
      SELECT 1 FROM RolePermission rp
      WHERE rp.role = r.role AND rp.id_permission = p.id_permission
  );
GO

SELECT (SELECT COUNT(*) FROM Permission) AS permissions,
       (SELECT COUNT(*) FROM RolePermission) AS role_permissions;

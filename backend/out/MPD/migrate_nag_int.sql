-- =====================================================================
-- Migration : matricule_nag NVARCHAR → INT (chiffres uniquement)
-- Base : gestionpatient
-- =====================================================================
USE gestionpatient;
GO

-- 1. Vider les anciens NAG texte (ex: NAG-2026-0001)
UPDATE Patient SET matricule_nag = NULL;
GO

-- 2. Type INT, 10 chiffres (1000000000–2147483647)
ALTER TABLE Patient ALTER COLUMN matricule_nag INT NULL;
GO

-- 3. Index unique filtré (plusieurs NULL autorisés)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_Patient_matricule_nag' AND object_id = OBJECT_ID('Patient')
)
BEGIN
    CREATE UNIQUE INDEX UQ_Patient_matricule_nag
        ON Patient(matricule_nag)
        WHERE matricule_nag IS NOT NULL;
END
GO

-- 4. CHECK : 10 chiffres INT, aucun prefixe impose
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Patient_nag_10')
    ALTER TABLE Patient DROP CONSTRAINT CK_Patient_nag_10;
GO

ALTER TABLE Patient ADD CONSTRAINT CK_Patient_nag_10
    CHECK (matricule_nag IS NULL OR (matricule_nag >= 1000000000 AND matricule_nag <= 2147483647));
GO

PRINT 'Migration NAG INT terminee.';
GO

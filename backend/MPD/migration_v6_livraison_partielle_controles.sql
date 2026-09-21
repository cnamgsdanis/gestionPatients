-- =====================================================================
-- migration_v6_livraison_partielle_controles.sql
-- ---------------------------------------------------------------------
--  1. LIVRAISON PARTIELLE en pharmacie : une ordonnance peut être servie en
--     plusieurs fois, par plusieurs pharmacies (rupture de stock : le patient
--     va chercher le reste ailleurs).
--       * Ordonnance_ligne.quantite_servie  (quantité déjà servie, tous lieux confondus)
--       * Ordonnance_ligne.statut_delivrance : + 'partiel'
--       * NOUVELLE table Ordonnance_delivrance : UNE ligne par livraison
--         (quantite, prix_unitaire, montant_total, part_assurance, part_patient,
--          id_structure_pharmacie, id_pharmacien, date_delivrance)
--       * les lignes déjà servies en une fois sont converties en livraison
--  2. INTERRUPTEUR DES CONTRÔLES ANTI-FRAUDE (Super Admin)
--       * NOUVELLE table Parametre_systeme (clé / valeur, qui, quand)
--       * permission controle.gerer (administrateur)
--
-- 100 % ADDITIF et IDEMPOTENT. À exécuter après migration_v5_integration_front.sql :
--   sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v6_livraison_partielle_controles.sql
-- Documentation : backend/docs/05-integration-front.md (section 13)
-- =====================================================================

USE gestionpatient;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------
-- 1. Ordonnance_ligne : quantité servie et statut « partiel »
-- ---------------------------------------------------------------------
IF COL_LENGTH('Ordonnance_ligne', 'quantite_servie') IS NULL
    ALTER TABLE Ordonnance_ligne ADD quantite_servie INT NOT NULL CONSTRAINT DF_OrdLigne_servie DEFAULT 0;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_OrdLigne_statut' AND definition NOT LIKE '%partiel%')
BEGIN
    ALTER TABLE Ordonnance_ligne DROP CONSTRAINT CK_OrdLigne_statut;
    ALTER TABLE Ordonnance_ligne ADD CONSTRAINT CK_OrdLigne_statut
        CHECK (statut_delivrance IN ('non_delivre', 'partiel', 'delivre'));
END
GO

-- ---------------------------------------------------------------------
-- 2. Ordonnance_delivrance : une ligne par livraison (prix, montants, pharmacie, pharmacien, date)
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Ordonnance_delivrance')
BEGIN
    CREATE TABLE Ordonnance_delivrance (
        id_delivrance          INT IDENTITY(1,1) PRIMARY KEY,
        id_ligne               INT NOT NULL CONSTRAINT FK_OrdDeliv_Ligne REFERENCES Ordonnance_ligne(id_ligne) ON DELETE CASCADE,
        quantite               INT NOT NULL CONSTRAINT CK_OrdDeliv_quantite CHECK (quantite > 0),
        prix_unitaire          DECIMAL(12,2) NOT NULL CONSTRAINT CK_OrdDeliv_prix CHECK (prix_unitaire > 0),
        montant_total          DECIMAL(14,2) NOT NULL,
        part_assurance         DECIMAL(14,2) NOT NULL,
        part_patient           DECIMAL(14,2) NOT NULL,
        id_structure_pharmacie INT NOT NULL CONSTRAINT FK_OrdDeliv_Structure   REFERENCES Structure(id_structure),
        id_pharmacien          INT NOT NULL CONSTRAINT FK_OrdDeliv_Pharmacien  REFERENCES Utilisateur(id_utilisateur),
        date_delivrance        DATETIME2 NOT NULL CONSTRAINT DF_OrdDeliv_date DEFAULT SYSDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_OrdDeliv_ligne')    CREATE INDEX IX_OrdDeliv_ligne    ON Ordonnance_delivrance (id_ligne);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_OrdDeliv_pharmacie') CREATE INDEX IX_OrdDeliv_pharmacie ON Ordonnance_delivrance (id_structure_pharmacie, date_delivrance);
GO

-- Les lignes servies en une fois (ancien fonctionnement) deviennent une livraison
INSERT INTO Ordonnance_delivrance (id_ligne, quantite, prix_unitaire, montant_total, part_assurance, part_patient, id_structure_pharmacie, id_pharmacien, date_delivrance)
SELECT l.id_ligne, l.quantite, l.prix_unitaire, COALESCE(l.montant_total, l.prix_unitaire * l.quantite),
       COALESCE(l.part_assurance, 0), COALESCE(l.part_patient, 0), l.id_structure_pharmacie, l.id_pharmacien,
       CAST(COALESCE(l.date_delivrance, CAST(SYSDATETIME() AS DATE)) AS DATETIME2)
FROM Ordonnance_ligne l
WHERE l.statut_delivrance = 'delivre' AND l.prix_unitaire IS NOT NULL
  AND l.id_structure_pharmacie IS NOT NULL AND l.id_pharmacien IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM Ordonnance_delivrance d WHERE d.id_ligne = l.id_ligne);
UPDATE Ordonnance_ligne SET quantite_servie = quantite WHERE statut_delivrance = 'delivre' AND quantite_servie = 0;
GO

-- ---------------------------------------------------------------------
-- 3. Parametre_systeme : réglages modifiables par l'administrateur
--    controles_antifraude = '1' (actifs, par défaut) | '0' (désactivés : mode supervision)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. Permission controle.gerer (administrateur uniquement)
-- ---------------------------------------------------------------------
DECLARE @nouvelle TABLE (id_permission INT);
INSERT INTO Permission (code, description)
OUTPUT inserted.id_permission INTO @nouvelle
SELECT 'controle.gerer', 'Activer ou desactiver les controles anti-fraude'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE code = 'controle.gerer');
INSERT INTO RolePermission (role, id_permission)
SELECT 'administrateur', n.id_permission FROM @nouvelle n
WHERE NOT EXISTS (SELECT 1 FROM RolePermission x WHERE x.role = 'administrateur' AND x.id_permission = n.id_permission);
GO

SELECT 'Migration v6 terminee' AS etat,
       (SELECT COUNT(*) FROM Ordonnance_delivrance) AS livraisons,
       (SELECT valeur FROM Parametre_systeme WHERE cle = 'controles_antifraude') AS controles_antifraude,
       (SELECT COUNT(*) FROM Permission) AS permissions;
GO

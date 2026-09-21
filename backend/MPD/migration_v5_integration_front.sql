-- =====================================================================
-- migration_v5_integration_front.sql
-- ---------------------------------------------------------------------
-- Ajouts necessaires pour brancher le front-end (frontend/) sur la base :
--   * colonnes Utilisateur : prenom, code_praticien, type_praticien
--   * type de structure 'administration' (rattachement des comptes admin)
--   * Patient.contact : unicité seulement quand un téléphone est renseigné
--   * nouvelles tables : Catalogue_medicament, Feuille_soins,
--     Ordonnance_ligne, Reglement, Notification,
--     Notification_destinataire, Journal_evenement
--   * permissions manquantes (codes utilises par le code Java) + droits
--     par defaut des roles
--   * structure d'administration + grille de couverture par defaut
--
-- 100 % ADDITIF et IDEMPOTENT : aucune table ni donnee existante n'est
-- supprimee ; le script peut etre relance sans rien dupliquer.
--
-- Usage (UTF-8 + identifiants entre guillemets : -I !) :
--   sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\MPD\migration_v5_integration_front.sql
-- Documentation : backend/docs/05-integration-front.md
-- =====================================================================

USE gestionpatient;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------
-- 1. Structure : type 'administration' (rattachement du compte admin)
-- ---------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Structure_type' AND definition NOT LIKE '%administration%')
BEGIN
    ALTER TABLE Structure DROP CONSTRAINT CK_Structure_type;
    ALTER TABLE Structure ADD CONSTRAINT CK_Structure_type
        CHECK (type_structure IN ('hopital', 'pharmacie', 'administration'));
END
GO

-- ---------------------------------------------------------------------
-- 2. Utilisateur : prenom, code_praticien, type_praticien
-- ---------------------------------------------------------------------
IF COL_LENGTH('Utilisateur', 'prenom') IS NULL
    ALTER TABLE Utilisateur ADD prenom NVARCHAR(100) NULL;
IF COL_LENGTH('Utilisateur', 'code_praticien') IS NULL
    ALTER TABLE Utilisateur ADD code_praticien NVARCHAR(30) NULL;
IF COL_LENGTH('Utilisateur', 'type_praticien') IS NULL
    ALTER TABLE Utilisateur ADD type_praticien NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Utilisateur_type_praticien')
    ALTER TABLE Utilisateur ADD CONSTRAINT CK_Utilisateur_type_praticien
        CHECK (type_praticien IS NULL OR type_praticien IN (N'Généraliste', N'Spécialiste', N'Autre'));
GO

-- ---------------------------------------------------------------------
-- 2 bis. Patient : téléphone unique SEULEMENT quand il est renseigné (index unique
--    filtré UX_Patient_contact). Selon la version du script de création, l'unicité
--    existait sous la forme d'une contrainte UNIQUE classique (qui n'accepte qu'UNE
--    seule valeur NULL, donc un seul assuré sans téléphone) ou d'un index filtré
--    nommé UQ_Patient_contact : dans les deux cas on la remplace par UX_Patient_contact
--    (le nouvel index est créé AVANT la suppression de l'ancien).
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Patient_contact' AND object_id = OBJECT_ID('Patient'))
    CREATE UNIQUE INDEX UX_Patient_contact ON Patient (contact) WHERE contact IS NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_Patient_contact' AND parent_object_id = OBJECT_ID('Patient'))
    ALTER TABLE Patient DROP CONSTRAINT UQ_Patient_contact;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Patient_contact' AND object_id = OBJECT_ID('Patient'))
    DROP INDEX UQ_Patient_contact ON Patient;
GO

-- ---------------------------------------------------------------------
-- 3. Catalogue_medicament : designations et prix de reference
--    (le stock d'une pharmacie reste dans Medicaments)
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Catalogue_medicament')
BEGIN
    CREATE TABLE Catalogue_medicament (
        id_catalogue   INT IDENTITY(1,1) PRIMARY KEY,
        designation    NVARCHAR(200) NOT NULL,
        prix_reference DECIMAL(12,2) NULL CONSTRAINT CK_Catalogue_prix CHECK (prix_reference IS NULL OR prix_reference >= 0),
        actif          BIT NOT NULL CONSTRAINT DF_Catalogue_actif DEFAULT 1,
        CONSTRAINT UQ_Catalogue_designation UNIQUE (designation)
    );
END
GO

-- Liste de depart (a modifier / completer par le metier)
IF NOT EXISTS (SELECT 1 FROM Catalogue_medicament)
BEGIN
    INSERT INTO Catalogue_medicament (designation, prix_reference) VALUES
    (N'Paracétamol 500mg (boîte de 16)', 800),
    (N'Amoxicilline 500mg (boîte de 12)', 2500),
    (N'Ibuprofène 400mg (boîte de 20)', 1500),
    (N'Oméprazole 20mg (boîte de 14)', 3200),
    (N'Metformine 850mg (boîte de 30)', 2800),
    (N'Amlodipine 5mg (boîte de 30)', 3500),
    (N'Salbutamol spray (100 doses)', 4200),
    (N'Sérum physiologique (10 unidoses)', 1200);
END
GO

-- ---------------------------------------------------------------------
-- 4. Feuille_soins : une feuille de consultation ou d'examen.
--    Le contenu complet (JSON) est ce que l'interface manipule ; les
--    colonnes servent aux recherches, aux droits et aux liens.
--    Statuts stockes en ASCII : 'en_attente' | 'validee'.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Feuille_soins')
BEGIN
    CREATE TABLE Feuille_soins (
        id_feuille        INT IDENTITY(1,1) PRIMARY KEY,
        id_client         BIGINT        NOT NULL,                  -- identifiant genere par le navigateur
        numero            NVARCHAR(30)  NULL,                      -- attribue par le serveur (Fyyyy-00001)
        type_feuille      NVARCHAR(20)  NOT NULL CONSTRAINT CK_Feuille_type   CHECK (type_feuille IN ('consultation', 'examen')),
        statut            NVARCHAR(20)  NOT NULL CONSTRAINT CK_Feuille_statut CHECK (statut IN ('en_attente', 'validee')),
        matricule_nag     NVARCHAR(20)  NOT NULL,
        id_patient        INT           NOT NULL CONSTRAINT FK_Feuille_Patient     REFERENCES Patient(id_patient),
        id_medecin        INT           NULL     CONSTRAINT FK_Feuille_Medecin     REFERENCES Utilisateur(id_utilisateur),
        id_agent          INT           NOT NULL CONSTRAINT FK_Feuille_Agent       REFERENCES Utilisateur(id_utilisateur),
        id_structure      INT           NOT NULL CONSTRAINT FK_Feuille_Structure   REFERENCES Structure(id_structure),
        date_feuille      DATE          NOT NULL,
        avec_ordonnance   BIT           NOT NULL CONSTRAINT DF_Feuille_ord DEFAULT 0,
        contenu           NVARCHAR(MAX) NOT NULL CONSTRAINT CK_Feuille_json CHECK (ISJSON(contenu) = 1),
        id_prestation     INT           NULL     CONSTRAINT FK_Feuille_Prestation  REFERENCES Prestation(id_prestation),
        date_creation     DATETIME2     NOT NULL CONSTRAINT DF_Feuille_creation DEFAULT SYSDATETIME(),
        date_modification DATETIME2     NOT NULL CONSTRAINT DF_Feuille_modif    DEFAULT SYSDATETIME(),
        date_validation   DATETIME2     NULL,
        CONSTRAINT UQ_Feuille_id_client UNIQUE (id_client)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Feuille_numero') CREATE UNIQUE INDEX UX_Feuille_numero ON Feuille_soins (numero) WHERE numero IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Feuille_nag')    CREATE INDEX IX_Feuille_nag    ON Feuille_soins (matricule_nag);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Feuille_statut') CREATE INDEX IX_Feuille_statut ON Feuille_soins (statut, id_medecin);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Feuille_struct') CREATE INDEX IX_Feuille_struct ON Feuille_soins (id_structure, statut);
GO

-- ---------------------------------------------------------------------
-- 5. Ordonnance_ligne : lignes d'ordonnance en texte libre, avec le prix
--    unitaire SAISI par le pharmacien a la delivrance
--    (Prescription reste reservee au flux "stock d'une pharmacie").
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Ordonnance_ligne')
BEGIN
    CREATE TABLE Ordonnance_ligne (
        id_ligne               INT IDENTITY(1,1) PRIMARY KEY,
        id_ordonnance          INT NOT NULL CONSTRAINT FK_OrdLigne_Ordonnance REFERENCES Ordonnance(id_ordonnance) ON DELETE CASCADE,
        position               INT NOT NULL,
        designation            NVARCHAR(200) NOT NULL,
        quantite               INT NOT NULL CONSTRAINT CK_OrdLigne_quantite CHECK (quantite > 0),
        posologie              NVARCHAR(300) NULL,
        statut_delivrance      NVARCHAR(20) NOT NULL CONSTRAINT DF_OrdLigne_statut DEFAULT 'non_delivre'
                               CONSTRAINT CK_OrdLigne_statut CHECK (statut_delivrance IN ('non_delivre', 'delivre')),
        prix_unitaire          DECIMAL(12,2) NULL CONSTRAINT CK_OrdLigne_prix CHECK (prix_unitaire IS NULL OR prix_unitaire > 0),
        montant_total          DECIMAL(14,2) NULL,
        part_assurance         DECIMAL(14,2) NULL,
        part_patient           DECIMAL(14,2) NULL,
        id_structure_pharmacie INT NULL CONSTRAINT FK_OrdLigne_Structure   REFERENCES Structure(id_structure),
        id_pharmacien          INT NULL CONSTRAINT FK_OrdLigne_Pharmacien  REFERENCES Utilisateur(id_utilisateur),
        date_delivrance        DATE NULL,
        CONSTRAINT UQ_OrdLigne_position UNIQUE (id_ordonnance, position)
    );
END
GO

-- ---------------------------------------------------------------------
-- 6. Reglement : paiements / avances aux hopitaux et pharmacies
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Reglement')
BEGIN
    CREATE TABLE Reglement (
        id_reglement   INT IDENTITY(1,1) PRIMARY KEY,
        kind           NVARCHAR(20)  NOT NULL CONSTRAINT CK_Reglement_kind CHECK (kind IN ('hopital', 'pharmacie')),
        id_structure   INT           NULL CONSTRAINT FK_Reglement_Structure REFERENCES Structure(id_structure),
        structure_nom  NVARCHAR(150) NOT NULL,
        montant        DECIMAL(14,2) NOT NULL CONSTRAINT CK_Reglement_montant CHECK (montant > 0),
        type_reglement NVARCHAR(20)  NOT NULL CONSTRAINT DF_Reglement_type DEFAULT 'reglement'
                       CONSTRAINT CK_Reglement_type CHECK (type_reglement IN ('reglement', 'avance')),
        note           NVARCHAR(300) NULL,
        date_reglement DATETIME2     NOT NULL CONSTRAINT DF_Reglement_date DEFAULT SYSDATETIME(),
        id_utilisateur INT           NOT NULL CONSTRAINT FK_Reglement_Utilisateur REFERENCES Utilisateur(id_utilisateur)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reglement_structure') CREATE INDEX IX_Reglement_structure ON Reglement (kind, structure_nom);
GO

-- ---------------------------------------------------------------------
-- 7. Notification + destinataires (messages de l'administrateur, alertes)
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Notification')
BEGIN
    CREATE TABLE Notification (
        id_notification INT IDENTITY(1,1) PRIMARY KEY,
        id_expediteur   INT NULL CONSTRAINT FK_Notification_Expediteur REFERENCES Utilisateur(id_utilisateur),  -- NULL = systeme
        cible_type      NVARCHAR(20)  NOT NULL CONSTRAINT CK_Notification_cible CHECK (cible_type IN ('all', 'role', 'etablissement', 'user')),
        cible_valeur    NVARCHAR(150) NULL,
        titre           NVARCHAR(150) NOT NULL,
        message         NVARCHAR(2000) NOT NULL,
        priorite        NVARCHAR(20)  NOT NULL CONSTRAINT DF_Notification_prio DEFAULT 'info'
                        CONSTRAINT CK_Notification_prio CHECK (priorite IN ('info', 'importante', 'urgente')),
        categorie       NVARCHAR(20)  NOT NULL CONSTRAINT DF_Notification_cat DEFAULT 'message'
                        CONSTRAINT CK_Notification_cat CHECK (categorie IN ('message', 'securite', 'systeme')),
        date_envoi      DATETIME2     NOT NULL CONSTRAINT DF_Notification_date DEFAULT SYSDATETIME(),
        expire_le       DATETIME2     NULL,
        accuse_requis   BIT           NOT NULL CONSTRAINT DF_Notification_accuse DEFAULT 0
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Notification_destinataire')
BEGIN
    CREATE TABLE Notification_destinataire (
        id_notification INT NOT NULL CONSTRAINT FK_NotifDest_Notification REFERENCES Notification(id_notification) ON DELETE CASCADE,
        id_utilisateur  INT NOT NULL CONSTRAINT FK_NotifDest_Utilisateur  REFERENCES Utilisateur(id_utilisateur),
        lu_le           DATETIME2 NULL,
        accuse_le       DATETIME2 NULL,
        CONSTRAINT PK_Notification_destinataire PRIMARY KEY (id_notification, id_utilisateur)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_NotifDest_user') CREATE INDEX IX_NotifDest_user ON Notification_destinataire (id_utilisateur, lu_le);
GO

-- ---------------------------------------------------------------------
-- 8. Journal_evenement : journal d'audit en AJOUT SEUL, chaine par hash
--    (les colonnes revue_* sont les seules modifiables ; aucune suppression)
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Journal_evenement')
BEGIN
    CREATE TABLE Journal_evenement (
        id_evenement      BIGINT IDENTITY(1,1) PRIMARY KEY,
        horodatage        DATETIME2(3)  NOT NULL CONSTRAINT DF_Journal_horodatage DEFAULT SYSUTCDATETIME(),  -- UTC
        origine           NVARCHAR(10)  NOT NULL CONSTRAINT DF_Journal_origine DEFAULT 'api',                -- 'api' (serveur) | 'ui' (interface)
        session_id        NVARCHAR(60)  NULL,
        correlation_id    NVARCHAR(60)  NULL,
        id_utilisateur    INT           NULL,
        login             NVARCHAR(50)  NULL,
        nom_affiche       NVARCHAR(150) NULL,
        role              NVARCHAR(30)  NULL,
        id_structure      INT           NULL,
        etablissement     NVARCHAR(150) NULL,
        categorie         NVARCHAR(40)  NOT NULL,
        action            NVARCHAR(80)  NOT NULL,
        libelle           NVARCHAR(300) NULL,
        resultat          NVARCHAR(10)  NOT NULL CONSTRAINT DF_Journal_resultat DEFAULT 'SUCCES',
        message           NVARCHAR(500) NULL,
        ressource_type    NVARCHAR(40)  NULL,
        ressource_id      NVARCHAR(60)  NULL,
        ressource_libelle NVARCHAR(200) NULL,
        nag_masque        NVARCHAR(20)  NULL,
        avant             NVARCHAR(MAX) NULL,
        apres             NVARCHAR(MAX) NULL,
        contexte          NVARCHAR(MAX) NULL,
        ip                NVARCHAR(60)  NULL,
        user_agent        NVARCHAR(300) NULL,
        severite          NVARCHAR(10)  NOT NULL CONSTRAINT DF_Journal_severite DEFAULT 'INFO',
        score             INT           NOT NULL CONSTRAINT DF_Journal_score DEFAULT 0,
        regles            NVARCHAR(MAX) NULL,
        statut_revue      NVARCHAR(20)  NOT NULL CONSTRAINT DF_Journal_revue DEFAULT 'Nouveau',
        revue_par         NVARCHAR(150) NULL,
        revue_le          DATETIME2(3)  NULL,
        revue_note        NVARCHAR(500) NULL,
        hash_precedent    NVARCHAR(64)  NULL,
        hash              NVARCHAR(64)  NOT NULL
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Journal_horodatage') CREATE INDEX IX_Journal_horodatage ON Journal_evenement (horodatage DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Journal_user')       CREATE INDEX IX_Journal_user       ON Journal_evenement (id_utilisateur, horodatage);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Journal_action')     CREATE INDEX IX_Journal_action     ON Journal_evenement (action, horodatage);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Journal_score')      CREATE INDEX IX_Journal_score      ON Journal_evenement (score) WHERE score >= 25;
GO

IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_Journal_no_delete')
    EXEC('CREATE TRIGGER TR_Journal_no_delete ON Journal_evenement INSTEAD OF DELETE AS
          BEGIN
              THROW 51000, ''Journal_evenement est en ajout seul : suppression interdite.'', 1;
          END');
GO

IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_Journal_no_update')
    EXEC('CREATE TRIGGER TR_Journal_no_update ON Journal_evenement AFTER UPDATE AS
          BEGIN
              IF UPDATE(horodatage) OR UPDATE(id_utilisateur) OR UPDATE(login) OR UPDATE(role) OR UPDATE(categorie)
                 OR UPDATE(action) OR UPDATE(resultat) OR UPDATE(avant) OR UPDATE(apres) OR UPDATE(ip)
                 OR UPDATE(severite) OR UPDATE(score) OR UPDATE(hash) OR UPDATE(hash_precedent)
              BEGIN
                  THROW 51001, ''Journal_evenement est en ajout seul : seules les colonnes revue_* sont modifiables.'', 1;
              END
          END');
GO

-- ---------------------------------------------------------------------
-- 9. Permissions : codes utilises par le code Java + nouveaux modules.
--    Les droits par defaut ne sont donnes QU'AUX permissions creees par
--    cette execution (relancer le script ne remet pas un droit retire).
-- ---------------------------------------------------------------------
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
 ('pec.valider',           'Valider ou rejeter une prise en charge'),
 ('medicament.lire',       'Voir les medicaments'),
 ('medicament.creer',      'Creer un medicament'),
 ('medicament.modifier',   'Modifier un medicament'),
 ('medicament.supprimer',  'Supprimer un medicament'),
 ('structure.lire',        'Voir les structures'),
 ('structure.gerer',       'Gerer les structures'),
 ('feuille.creer',         'Creer une feuille de soins (accueil)'),
 ('feuille.lire',          'Voir les feuilles de soins, medecins et catalogue'),
 ('feuille.modifier',      'Modifier une feuille de soins (selon le role)'),
 ('feuille.valider',       'Valider une feuille de soins (medecin)'),
 ('feuille.delivrer',      'Delivrer une ordonnance (pharmacie)'),
 ('feuille.supprimer',     'Supprimer une feuille de soins'),
 ('reglement.lire',        'Voir les reglements des hopitaux et pharmacies'),
 ('reglement.creer',       'Enregistrer un reglement ou une avance'),
 ('notification.envoyer',  'Envoyer des messages aux utilisateurs'),
 ('journal.lire',          'Consulter le journal d''audit'),
 ('journal.gerer',         'Examiner les alertes du journal');

DECLARE @nouvelles TABLE (id_permission INT, code NVARCHAR(50));
INSERT INTO Permission (code, description)
OUTPUT inserted.id_permission, inserted.code INTO @nouvelles
SELECT p.code, p.description FROM @perm p
WHERE NOT EXISTS (SELECT 1 FROM Permission x WHERE x.code = p.code);

DECLARE @roles TABLE (role NVARCHAR(30), code NVARCHAR(50));
INSERT INTO @roles (role, code) VALUES
 -- agent d'accueil
 ('agent_accueil','patient.lire'), ('agent_accueil','patient.creer'), ('agent_accueil','patient.modifier'),
 ('agent_accueil','prestation.lire'), ('agent_accueil','prestation.creer'), ('agent_accueil','prestation.modifier'), ('agent_accueil','prestation.supprimer'), ('agent_accueil','structure.lire'),
 ('agent_accueil','pec.lire'), ('agent_accueil','feuille.creer'), ('agent_accueil','feuille.lire'), ('agent_accueil','feuille.modifier'),
 -- medecin
 ('medecin','patient.lire'), ('medecin','prestation.lire'), ('medecin','prestation.creer'), ('medecin','prestation.modifier'),
 ('medecin','ordonnance.lire'), ('medecin','ordonnance.creer'), ('medecin','ordonnance.modifier'), ('medecin','ordonnance.signer'),
 ('medecin','examen.lire'), ('medecin','examen.creer'), ('medecin','examen.modifier'), ('medecin','pec.lire'), ('medecin','structure.lire'),
 ('medecin','feuille.lire'), ('medecin','feuille.creer'), ('medecin','feuille.modifier'), ('medecin','feuille.valider'),
 -- pharmacien
 ('pharmacien','patient.lire'), ('pharmacien','ordonnance.lire'), ('pharmacien','ordonnance.delivrer'), ('pharmacien','structure.lire'),
 ('pharmacien','feuille.lire'), ('pharmacien','feuille.modifier'), ('pharmacien','feuille.delivrer'),
 -- directeur de structure
 ('directeur_structure','patient.lire'), ('directeur_structure','utilisateur.lire'), ('directeur_structure','prestation.lire'),
 ('directeur_structure','ordonnance.lire'), ('directeur_structure','examen.lire'), ('directeur_structure','pec.lire'),
 ('directeur_structure','structure.lire'), ('directeur_structure','feuille.lire'), ('directeur_structure','reglement.lire'),
 ('directeur_structure','reglement.creer'), ('directeur_structure','journal.lire'),
 -- caissier de structure
 ('caissier_structure','patient.lire'), ('caissier_structure','prestation.lire'), ('caissier_structure','pec.lire'),
 ('caissier_structure','structure.lire'), ('caissier_structure','feuille.lire'), ('caissier_structure','reglement.lire'),
 ('caissier_structure','reglement.creer');

INSERT INTO RolePermission (role, id_permission)
SELECT r.role, n.id_permission FROM @roles r JOIN @nouvelles n ON n.code = r.code
WHERE NOT EXISTS (SELECT 1 FROM RolePermission x WHERE x.role = r.role AND x.id_permission = n.id_permission);

-- l'administrateur recoit toutes les permissions nouvellement creees
INSERT INTO RolePermission (role, id_permission)
SELECT 'administrateur', n.id_permission FROM @nouvelles n
WHERE NOT EXISTS (SELECT 1 FROM RolePermission x WHERE x.role = 'administrateur' AND x.id_permission = n.id_permission);
GO

-- ---------------------------------------------------------------------
-- 10. Structure d'administration (obligatoire : Utilisateur.id_structure
--     est NOT NULL) et grille de couverture par defaut.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM Structure WHERE type_structure = 'administration')
    INSERT INTO Structure (raison_sociale, addresse, type_structure)
    VALUES (N'CNAMGS - Administration', N'Libreville', 'administration');
GO

-- Taux de prise en charge par defaut : 80 % pour chaque fonds et chaque type
-- de prestation (a ajuster par le metier : UPDATE TauxCouverture ...).
IF NOT EXISTS (SELECT 1 FROM TauxCouverture)
BEGIN
    INSERT INTO TauxCouverture (fonds, type_prestation, pourcentage_pec)
    SELECT f.fonds, t.type_prestation, 80
    FROM (VALUES (1), (2), (3), (4)) AS f(fonds)
    CROSS JOIN (VALUES ('consultation'), ('examen'), ('pharmacie'), ('hospitalisation')) AS t(type_prestation);
END
GO

SELECT 'Migration v5 terminee' AS etat,
       (SELECT COUNT(*) FROM Permission)     AS permissions,
       (SELECT COUNT(*) FROM RolePermission) AS droits_par_role,
       (SELECT COUNT(*) FROM Structure)      AS structures,
       (SELECT COUNT(*) FROM Catalogue_medicament) AS catalogue,
       (SELECT COUNT(*) FROM TauxCouverture) AS taux_couverture;
GO

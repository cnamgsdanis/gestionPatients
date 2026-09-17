-- ==========================================================================
-- seed-database.sql — Données de démarrage pour la base gestionPatients
-- --------------------------------------------------------------------------
-- Ne modifie AUCUNE table ni logique existante : complète uniquement les
-- données requises pour que l'API (déjà codée dans backend/) fonctionne.
--
-- 1) La table Structure a une contrainte NOT NULL référencée par
--    Utilisateur.id_structure : il faut au moins une ligne avant de créer
--    un compte (voir backend/GUIDE.md, section "Données de démarrage").
-- 2) Les tables Permission / RolePermission sont bien définies dans
--    backend/MPD/gestionpatient.sql (lignes 198-218) mais celui-ci ne
--    contient aucune donnée de départ. Sans elles, AuthGuard.verifierPermission()
--    échoue pour tout le monde (y compris l'administrateur) puisque le
--    cache de PermissionService reste vide au démarrage — voir
--    backend/service/PermissionService.java. Les codes et l'affectation par
--    rôle ci-dessous reprennent exactement ceux documentés dans
--    backend/docs/04-permission.md ("Permissions de base" /
--    "Permissions par défaut"), déjà vérifiés contre le code des
--    contrôleurs.
--
-- Usage : sqlcmd -S <serveur> -E -i tools/seed-database.sql
--         (ou -U sa -P <mot de passe> selon l'authentification utilisée)
-- Idempotent : peut être relancé sans dupliquer les données.
-- ==========================================================================

USE gestionPatients;
GO

-- ---- 1. Structure de démarrage ------------------------------------------
IF NOT EXISTS (SELECT 1 FROM Structure)
BEGIN
    INSERT INTO Structure (raison_sociale, addresse, type_structure)
    VALUES ('Hopital Principal', 'Libreville', 'hopital');
END
GO

-- ---- 2. Tables Permission / RolePermission (si absentes) -----------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Permission')
BEGIN
    CREATE TABLE Permission (
        id_permission INT IDENTITY(1,1) PRIMARY KEY,
        code          NVARCHAR(50) NOT NULL UNIQUE,
        description   NVARCHAR(200) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RolePermission')
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

-- ---- 3. Permissions de base (backend/docs/04-permission.md) --------------
IF NOT EXISTS (SELECT 1 FROM Permission)
BEGIN
    INSERT INTO Permission (code, description) VALUES
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
    ('ordonnance.lire',       'Voir les ordonnances'),
    ('ordonnance.creer',      'Creer une ordonnance'),
    ('ordonnance.delivrer',   'Delivrer les medicaments'),
    ('structure.lire',        'Voir les structures'),
    ('structure.gerer',       'Gerer les structures');
END
GO

-- ---- 4. Permissions par défaut par rôle -----------------------------------
IF NOT EXISTS (SELECT 1 FROM RolePermission)
BEGIN
    INSERT INTO RolePermission (role, id_permission)
    SELECT 'administrateur', id_permission FROM Permission;

    INSERT INTO RolePermission (role, id_permission)
    SELECT 'agent_accueil', id_permission FROM Permission
    WHERE code IN ('patient.lire','patient.creer','patient.modifier','prestation.lire','prestation.creer','structure.lire');

    INSERT INTO RolePermission (role, id_permission)
    SELECT 'medecin', id_permission FROM Permission
    WHERE code IN ('patient.lire','prestation.lire','prestation.creer','ordonnance.lire','ordonnance.creer','structure.lire');

    INSERT INTO RolePermission (role, id_permission)
    SELECT 'pharmacien', id_permission FROM Permission
    WHERE code IN ('patient.lire','ordonnance.lire','ordonnance.delivrer','structure.lire');

    INSERT INTO RolePermission (role, id_permission)
    SELECT 'directeur_structure', id_permission FROM Permission
    WHERE code IN ('patient.lire','utilisateur.lire','prestation.lire','ordonnance.lire','structure.lire');

    INSERT INTO RolePermission (role, id_permission)
    SELECT 'caissier_structure', id_permission FROM Permission
    WHERE code IN ('patient.lire','prestation.lire','structure.lire');
END
GO

SELECT (SELECT COUNT(*) FROM Structure) AS structures,
       (SELECT COUNT(*) FROM Permission) AS permissions,
       (SELECT COUNT(*) FROM RolePermission) AS role_permissions;

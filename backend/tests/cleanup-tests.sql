-- Supprime UNIQUEMENT les données créées par backend/tests/api-integration.test.js (préfixes ZTEST / zt_).
-- Les données réelles (comptes, assurés, feuilles, journal des vrais utilisateurs) ne sont PAS touchées.
-- Usage : sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\tests\cleanup-tests.sql
-- Conservés : permissions, droits, catalogue de départ, taux, structure d'administration, comptes admin et réels.
--
-- Le journal d'audit est en ajout seul (chaîne d'empreintes) : les événements produits par les tests y restent
-- (acteurs « zt_… », identifiables). Pour repartir d'un journal vide sur une base de TEST uniquement :
--   backend/tests/purge-journal.sql
USE gestionpatient;
SET NOCOUNT ON;

DECLARE @pat TABLE (id INT);
INSERT INTO @pat SELECT id_patient FROM Patient WHERE prenom = N'ZTEST' OR nom LIKE N'ZTEST%';
DECLARE @usr TABLE (id INT);
INSERT INTO @usr SELECT id_utilisateur FROM Utilisateur WHERE username LIKE N'zt[_]%';
DECLARE @str TABLE (id INT);
INSERT INTO @str SELECT id_structure FROM Structure WHERE raison_sociale LIKE N'ZTEST%';
-- début de la fenêtre de test = création du plus ancien compte de test encore présent (NULL s'il n'y en a plus).
-- date_creation est à l'heure du serveur, date_envoi des messages en UTC : on convertit avant de comparer.
DECLARE @debut DATETIME2 = (SELECT DATEADD(MINUTE, DATEDIFF(MINUTE, SYSDATETIME(), SYSUTCDATETIME()), MIN(date_creation)) FROM Utilisateur WHERE username LIKE N'zt[_]%');

-- feuilles et ce que leur validation a créé (livraisons et profils suivent leurs parents en cascade)
DELETE FROM Feuille_soins WHERE id_patient IN (SELECT id FROM @pat) OR id_agent IN (SELECT id FROM @usr) OR id_structure IN (SELECT id FROM @str);
DECLARE @prest TABLE (id INT);
INSERT INTO @prest SELECT id_prestation FROM Prestation WHERE id_patient IN (SELECT id FROM @pat) OR id_utilisateur IN (SELECT id FROM @usr) OR id_structure IN (SELECT id FROM @str);
DELETE FROM Ordonnance WHERE id_prestation IN (SELECT id FROM @prest) OR id_utilisateur IN (SELECT id FROM @usr);   -- lignes et livraisons en cascade
DELETE FROM Examen WHERE id_prestation IN (SELECT id FROM @prest);
DELETE FROM Prise_en_charge WHERE id_prestation IN (SELECT id FROM @prest) OR id_acteur IN (SELECT id FROM @usr);
DELETE FROM Prestation WHERE id_prestation IN (SELECT id FROM @prest);

DELETE FROM Reglement WHERE structure_nom LIKE N'ZTEST%' OR id_utilisateur IN (SELECT id FROM @usr);

-- messages : ceux des comptes de test, et ceux du système / de l'admin émis PENDANT la fenêtre de test (alertes de sécurité provoquées par les tests)
DELETE FROM Notification WHERE id_expediteur IN (SELECT id FROM @usr)
   OR (@debut IS NOT NULL AND date_envoi >= @debut AND (id_expediteur IS NULL OR id_expediteur = (SELECT id_utilisateur FROM Utilisateur WHERE username = N'admin')));
DELETE FROM Notification_destinataire WHERE id_utilisateur IN (SELECT id FROM @usr);

DELETE FROM Catalogue_medicament WHERE designation LIKE N'ZTEST%';
DELETE FROM Utilisateur WHERE id_utilisateur IN (SELECT id FROM @usr);   -- leurs profils (Utilisateur_profil) partent en cascade
DELETE FROM Patient WHERE id_patient IN (SELECT id FROM @pat) AND id_assure_principal IS NOT NULL;
DELETE FROM Patient WHERE id_patient IN (SELECT id FROM @pat);
DELETE FROM Structure WHERE id_structure IN (SELECT id FROM @str);

-- interrupteur des contrôles anti-fraude : remis sur « actifs »
UPDATE Parametre_systeme SET valeur = '1', modifie_par = NULL WHERE cle = 'controles_antifraude';

SELECT 'nettoyage terminé' AS etat,
  (SELECT COUNT(*) FROM Patient) AS patients, (SELECT COUNT(*) FROM Utilisateur) AS utilisateurs,
  (SELECT COUNT(*) FROM Structure) AS structures, (SELECT COUNT(*) FROM Feuille_soins) AS feuilles,
  (SELECT COUNT(*) FROM Prestation) AS prestations, (SELECT COUNT(*) FROM Notification) AS messages,
  (SELECT COUNT(*) FROM Journal_evenement) AS journal,
  (SELECT COUNT(*) FROM Utilisateur_profil) AS profils, (SELECT COUNT(*) FROM Ordonnance_delivrance) AS livraisons;

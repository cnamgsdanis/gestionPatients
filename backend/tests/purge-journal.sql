-- ⚠ DESTRUCTIF : vide TOUT le journal d'audit (les événements des vrais utilisateurs aussi) et repart d'une chaîne d'empreintes vide.
-- À n'utiliser que sur une base de TEST ou de recette, ou sur une base dont le journal ne contient que du bruit de test.
-- Le journal est normalement en ajout seul (déclencheurs) : le déclencheur de suppression est suspendu le temps de la purge.
-- Usage : sqlcmd -S localhost\SQLEXPRESS -E -C -I -f 65001 -b -i backend\tests\purge-journal.sql
USE gestionpatient;
SET NOCOUNT ON;

DISABLE TRIGGER TR_Journal_no_delete ON Journal_evenement;
DELETE FROM Journal_evenement;
ENABLE TRIGGER TR_Journal_no_delete ON Journal_evenement;
DBCC CHECKIDENT ('Journal_evenement', RESEED, 0) WITH NO_INFOMSGS;

SELECT 'journal purgé' AS etat, (SELECT COUNT(*) FROM Journal_evenement) AS evenements;

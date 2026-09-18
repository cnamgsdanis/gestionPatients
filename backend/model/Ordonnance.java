package model;
import java.util.List;
/**
 * Modèle représentant une ordonnance médicale.
 * Correspond à une ligne de la table Ordonnance.
 */
public class Ordonnance {

    

    public int     id_ordonnance;
    public String  date_ordonnance;      // ISO 8601 (yyyy-MM-dd)
    public String  statut;                // 'en_attente', 'validee', 'envoyee', 'delivree', 'annulee'
    public String  signature_medecin;     // chemin/URL de l'image de signature (peut être null)
    public String  cachet_medecin;        // chemin/URL du cachet (peut être null)
    public String  signature_patient;     // chemin/URL de la signature patient (peut être null)
    public String  code_retrait;          // code unique pour retirer en pharmacie (peut être null)
    public Integer id_prestation_pharmacie;
    public int     id_prestation;         // FK vers Prestation
    public int     id_utilisateur;        // FK vers Utilisateur (le médecin qui a émis)

    // Champs d'affichage (remplis par le DAO via JOIN)
    public String  patient_nom;           // nom complet du patient
    public String  medecin_nom;           // nom complet du médecin

    public List<Prescription> medicaments;

    public Ordonnance() {}

    /** Vrai si l'ordonnance peut être délivrée en pharmacie. */
    public boolean estDelivrable() {
        return "envoyee".equals(statut)
            && signature_medecin != null
            && cachet_medecin != null;
    }

    /** Vrai si l'ordonnance a déjà été délivrée. */
    public boolean estDelivree() {
        return "delivree".equals(statut);
    }
}
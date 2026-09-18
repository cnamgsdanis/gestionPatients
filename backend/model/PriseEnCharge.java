package model;

import java.math.BigDecimal;

/**
 * Modèle représentant une prise en charge (PEC).
 * Une PEC est unique par prestation (contrainte UNIQUE en SQL).
 */
public class PriseEnCharge {

    public int id_pec;
    public BigDecimal montant_pec; // montant couvert par l'assurance
    public String date_pec; // ISO 8601 (yyyy-MM-dd)
    public String numero_de_feuille;
    public String type_feuille;
    public int id_acteur; // utilisateur qui a créé la PEC
    public String statut; // 'en_attente', 'validee', 'rejetee'
    public int id_prestation;
    public String patient_nom; // rempli par JOIN
    public String acteur_nom; // rempli par JOIN
    // Champs calculés (non stockés, ajoutés pour l'affichage)
    public BigDecimal part_patient; // reste à payer par le patient

    public PriseEnCharge() {
    }
}
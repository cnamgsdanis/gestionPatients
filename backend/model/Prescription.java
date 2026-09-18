package model;

import java.math.BigDecimal;

/**
 * Ligne de prescription : un médicament prescrit dans une ordonnance.
 * Trace aussi ce qui a été réellement délivré en pharmacie.
 */
public class Prescription {

    public int    id_ordonnance;
    public int    id_medicament;
    public String posologie;
    public int    quantite_prescrite;

    //  Traçabilité de la délivrance
    public Integer quantite_delivree;   // null ou 0 si rien délivré
    public String  statut_delivrance;   // 'en_attente', 'delivre', 'partiel', 'non_delivre'

    // Champs d'affichage (JOIN)
    public String     nom_medicament;
    public String     dosage;
    public BigDecimal prix_unitaire;    // prix du médicament (pour calcul)
    public int        stock_disponible; // stock actuel (pour info)

    public Prescription() {}
}
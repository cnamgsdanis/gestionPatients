package model;

import java.math.BigDecimal;

public class Medicament {

    public int        id_medicament;
    public String     nom_medicament;
    public String     dosage;
    public int        quantite;
    public BigDecimal prix;             
    public int        id_structure;
    public String     structure_nom;

    public Medicament() {}
}
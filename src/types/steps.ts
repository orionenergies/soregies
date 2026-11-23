/**
 * Types spécifiques aux steps du workflow Soregies
 */

import { StepResult } from './bot';

/**
 * Représentation d'une ligne du tableau « Mes index » (état et identifiants lus dans le DOM)
 */
export interface IndexRow {
  /** Numéro de dossier / contrat (colonne « Dossier ») */
  contractLineId: string;
  /** Code PRM / MPT (colonne « Contrat ») */
  mptCode: string;
  /** Date de début de la période, format YYYY-MM-DD (colonne « Date début ») */
  fromDate: string | null;
  /** Libellé de l'état de saisie (Ouverte, Fermée, Interdite, Contestable, À venir) */
  status: string;
  /** Position de la ligne dans la page du tableau (0-based) */
  position: number;
  /** Page du tableau (0-based) sur laquelle la ligne se trouve */
  pageIndex: number;
}

/**
 * Résultat du step de remplissage du formulaire « Saisir ma production »
 */
export interface FormFillResult extends StepResult {
  data: {
    statementDate: string | null;
  };
}

/**
 * Résultat du step de soumission (vérification + confirmation)
 */
export interface SubmissionResult extends StepResult {
  data: {
    submitted: boolean;
  };
}

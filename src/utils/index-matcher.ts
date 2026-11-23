import { IndexRow } from '../types';
import { daysBetween, formatFrenchDate, monthKey, normalizeReference } from './date-utils';

/** Libellé de l'état de saisie permettant de déclarer une production (colonne « Saisie »). */
export const OPEN_STATUS_LABEL = 'Ouverte';

/**
 * Indique si une ligne du tableau « Mes index » correspond à la référence fournie.
 * La référence peut être un numéro de dossier (la cellule affiche « principal/secondaire » en cas
 * d'index lié) ou un code PRM / contrat.
 */
export function rowMatchesReference(row: IndexRow, reference: string): boolean {
  const target = normalizeReference(reference);
  if (!target) return false;

  const dossierParts = row.contractLineId.split('/').map(normalizeReference);
  return dossierParts.includes(target) || normalizeReference(row.mptCode) === target;
}

/** Compare le libellé d'état (insensible à la casse et aux espaces) à « Ouverte ». */
export function isOpenStatus(status: string): boolean {
  return status.trim().toLowerCase() === OPEN_STATUS_LABEL.toLowerCase();
}

export interface IndexRowSelection {
  /** Lignes du contrat correspondant à la période demandée (même mois / année de début) */
  periodRows: IndexRow[];
  /** Ligne retenue : ouverte si possible, sinon la plus proche de startDate */
  chosen?: IndexRow;
  /** Libellé lisible des périodes disponibles pour le contrat (diagnostic) */
  availablePeriods: string;
}

/**
 * Sélectionne la ligne d'index à déclarer parmi celles du contrat.
 *
 * 1. Ne conserve que les lignes de la référence dont la « Date début » est dans le même mois/année
 *    que `startDate`.
 * 2. Parmi elles, privilégie les lignes « Ouverte » puis la plus proche de `startDate` (en jours).
 */
export function selectIndexRow(rows: IndexRow[], reference: string, startDate: string): IndexRowSelection {
  const contractRows = rows.filter(row => rowMatchesReference(row, reference));

  const availablePeriods = contractRows
    .map(row => `${row.fromDate ? formatFrenchDate(row.fromDate) : 'date inconnue'} (${row.status || 'état inconnu'})`)
    .join(', ');

  const targetMonth = monthKey(startDate);
  const periodRows = contractRows.filter(row => row.fromDate !== null && monthKey(row.fromDate) === targetMonth);

  const ordered = [...periodRows].sort((a, b) => {
    const openDelta = Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status));
    if (openDelta !== 0) return openDelta;
    return daysBetween(a.fromDate!, startDate) - daysBetween(b.fromDate!, startDate);
  });

  const selection: IndexRowSelection = { periodRows, availablePeriods };
  if (ordered[0]) selection.chosen = ordered[0];
  return selection;
}

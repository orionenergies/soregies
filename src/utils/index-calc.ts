/**
 * Calculs purs liés à la saisie d'index Soregies (testables sans navigateur).
 */

export interface StartIndexResolution {
  startIndex: number;
  alerts: string[];
}

/**
 * Détermine l'ancien index à utiliser, avec les mêmes alertes que le bot EDF OA :
 * - ancien index Soregies illisible → index Airtable (`startIndex` du JSON d'entrée), sinon erreur ;
 * - ancien index Soregies présent et différent de celui d'Airtable → celui de Soregies est conservé
 *   et une alerte le signale.
 */
export function resolveStartIndex(
  soregiesStartIndex: number | null,
  airtableStartIndex: number | undefined
): StartIndexResolution {
  const alerts: string[] = [];

  if (soregiesStartIndex === null) {
    if (airtableStartIndex === undefined) {
      throw new Error(
        'L\'"Ancien index" Soregies est illisible et aucun startIndex Airtable ' +
        'n\'a été fourni dans la configuration. Impossible de remplir le formulaire.'
      );
    }
    alerts.push(`Index Ancien Soregies illisible, index Airtable utilisé (${airtableStartIndex})`);
    return { startIndex: airtableStartIndex, alerts };
  }

  if (airtableStartIndex !== undefined && soregiesStartIndex !== airtableStartIndex) {
    if (soregiesStartIndex === 0) {
      alerts.push(`Index de début Soregies à 0, conservé (au lieu de l'index Airtable ${airtableStartIndex})`);
    } else {
      alerts.push(
        `Index de début Soregies (${soregiesStartIndex}) utilisé au lieu de l'index Airtable (${airtableStartIndex})`
      );
    }
  }

  return { startIndex: soregiesStartIndex, alerts };
}

/** Nouvel index = ancien index + production, arrondi à 3 décimales pour éviter les artefacts flottants. */
export function computeNewIndex(startIndex: number, kwhProduction: number): number {
  return Math.round((startIndex + kwhProduction) * 1000) / 1000;
}

export interface StatementDateResolution {
  date: string | null;
  alert?: string;
}

/**
 * Détermine la date de relevé à saisir.
 * - `endDate` absent : la date par défaut de Soregies (aujourd'hui) est conservée (`date: null`) ;
 * - `endDate` comprise entre les bornes `min` / `max` du champ : utilisée ;
 * - sinon : date du jour conservée, avec une alerte.
 */
export function resolveStatementDate(
  endDate: string | undefined,
  minDate: string | null,
  maxDate: string | null
): StatementDateResolution {
  if (!endDate) return { date: null };

  const belowMin = minDate !== null && endDate < minDate;
  const aboveMax = maxDate !== null && endDate > maxDate;

  if (belowMin || aboveMax) {
    return {
      date: null,
      alert:
        `Date de relevé ${endDate} hors des bornes acceptées par Soregies ` +
        `(${minDate ?? '…'} à ${maxDate ?? '…'}), date du jour conservée`
    };
  }

  return { date: endDate };
}

/** Vérifie que la production affichée par Soregies correspond à kwhProduction (tolérance absolue en kWh). */
export function isWithinTolerance(found: number, expected: number, toleranceKwh: number): boolean {
  return Math.abs(found - expected) <= toleranceKwh;
}

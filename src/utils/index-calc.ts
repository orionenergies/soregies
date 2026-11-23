/**
 * Calculs purs liés à la saisie d'index Soregies (testables sans navigateur).
 */

/**
 * Alertes informatives sur l'ancien index (la production est saisie directement, l'ancien index
 * n'est plus utilisé pour calculer le nouvel index) :
 * - ancien index Soregies illisible ;
 * - ancien index Soregies différent de l'index de début Airtable (`startIndex`).
 */
export function compareStartIndex(
  soregiesStartIndex: number | null,
  airtableStartIndex: number | undefined
): string[] {
  if (soregiesStartIndex === null) {
    return ['Ancien index Soregies illisible, comparaison avec l\'index Airtable impossible'];
  }
  if (airtableStartIndex !== undefined && soregiesStartIndex !== airtableStartIndex) {
    return [`Index de début Soregies (${soregiesStartIndex}) différent de l'index Airtable (${airtableStartIndex})`];
  }
  return [];
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
 * Valide la date de relevé à saisir (startDate + 1 mois) par rapport aux bornes du champ.
 * - date absente : la date par défaut de Soregies (aujourd'hui) est conservée (`date: null`) ;
 * - date comprise entre les bornes `min` / `max` du champ : utilisée ;
 * - sinon : date du jour conservée, avec une alerte.
 */
export function resolveStatementDate(
  statementDate: string | undefined,
  minDate: string | null,
  maxDate: string | null
): StatementDateResolution {
  if (!statementDate) return { date: null };

  const belowMin = minDate !== null && statementDate < minDate;
  const aboveMax = maxDate !== null && statementDate > maxDate;

  if (belowMin || aboveMax) {
    return {
      date: null,
      alert:
        `Date de relevé ${statementDate} hors des bornes acceptées par Soregies ` +
        `(${minDate ?? '…'} à ${maxDate ?? '…'}), date du jour conservée`
    };
  }

  return { date: statementDate };
}

/** Vérifie que la production affichée par Soregies correspond à kwhProduction (tolérance absolue en kWh). */
export function isWithinTolerance(found: number, expected: number, toleranceKwh: number): boolean {
  return Math.abs(found - expected) <= toleranceKwh;
}

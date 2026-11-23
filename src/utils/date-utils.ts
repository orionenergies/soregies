/**
 * Utilitaires de dates et de références pour le bot Soregies.
 * Les dates manipulées sont des chaînes ISO `YYYY-MM-DD` (calendrier Europe/Paris).
 */

/** Date du jour au format YYYY-MM-DD, selon le fuseau Europe/Paris. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

/** Clé année-mois (`YYYY-MM`) d'une date ISO. */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Format français DD/MM/YYYY d'une date ISO. */
export function formatFrenchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Nombre de jours entre deux dates ISO (valeur absolue). */
export function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / msPerDay));
}

/** Normalise une référence (dossier / PRM) pour comparaison : sans espaces, en majuscules. */
export function normalizeReference(value: string): string {
  return value.replace(/[\s\u00a0]+/g, '').toUpperCase();
}

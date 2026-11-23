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

/**
 * Ajoute `months` mois à une date ISO en conservant le jour, ramené au dernier jour du mois cible
 * s'il n'existe pas (ex: 2026-01-31 + 1 mois = 2026-02-28).
 */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const resultDay = Math.min(day, lastDay);
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(resultDay).padStart(2, '0');
  return `${target.getUTCFullYear()}-${mm}-${dd}`;
}

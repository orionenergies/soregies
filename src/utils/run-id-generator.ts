import { RUN_ID_CONFIG } from '../constants';

/**
 * Génère un identifiant unique pour chaque exécution du bot.
 * Format : {source}-{shortId}-{YYYYMMDD}-{HHmmss}-{rand4}
 * Exemple : bot-soregies-20260324-110626-k7x2
 */
export function generateRunId(
  source: string = RUN_ID_CONFIG.source,
  shortId: string = RUN_ID_CONFIG.shortId
): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${source}-${shortId}-${date}-${time}-${rand}`;
}

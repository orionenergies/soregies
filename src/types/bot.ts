/**
 * Types et interfaces TypeScript pour le bot Soregies
 * Définit les structures de données pour les entrées et les résultats
 *
 * Centralisé dans /src/types/ pour une meilleure organisation
 */

import { ErrorSource, IssueCode, IssueSource } from './error-classification';

/**
 * Résultat de l'exécution du bot (3 états) :
 * - success : le bot a terminé sans problème (HTTP 200)
 * - issue   : le bot a terminé techniquement mais une condition métier a été rencontrée (HTTP 200, champ issue présent)
 * - error   : échec technique du bot (HTTP 500)
 */
export type ResultStatus = 'success' | 'issue' | 'error';

/**
 * Détails structurés accompagnant une issue.
 * Champs présents selon le code (voir IssueCode).
 */
export interface IssueDetail {
  // INVOICE_NOT_FOUND
  statusFacture?: string;
  // DUPLICATE_INVOICE
  errorCode?: string;
  // PRODUCTION_NULL
  fieldName?: string;
  invalidValue?: number;
}

/**
 * Informations de debugging — présent uniquement sur result === 'error' en mode production.
 */
export interface DebugInfo {
  stepName?: string;
  action?: string;
  screenshotBase64?: string;
}

/**
 * Détails métier spécifiques au bot Soregies.
 * Contient toutes les données opérationnelles et de monitoring.
 *
 * Soregies ne propose que la déclaration de production (pas de déclaration par index ni de
 * production anniversaire).
 */
export interface SoregiesBusinessDetails {
  useCase?: 'declaration';
  statusFacture?: string;
}

export interface BotResult {
  runId: string;
  result: ResultStatus;
  message: string;
  timestamp: string;
  executionTimeMs: number;
  // Logs d'exécution en texte brut (une ligne par message) — toujours présent.
  // Permet à Make de transmettre les logs au monitoring sans décoder de base64.
  logs: string;
  // Identifiant de la centrale (SPV) — toujours présent, "" si indisponible.
  spv: string;
  // URL Airtable du record déclencheur — toujours présent, "" si non fourni en entrée.
  // Simple écho de l'input pour alimenter le champ "Base Record Url" du monitoring.
  baseRecordUrl: string;
  // Issue métier (présent si result === 'issue')
  issue?: {
    code?: IssueCode;
    source?: IssueSource;
    detail?: IssueDetail;
  };
  // Erreur technique (présent si result === 'error')
  error?: {
    source?: ErrorSource;
    code?: string;
  };
  // Debug info (présent si result === 'error' en mode production)
  debug?: DebugInfo;
  // Données spécifiques à cette automation — toujours présent
  businessDetails: SoregiesBusinessDetails;
}

export interface BotFormData {
  dossierId?: string;
  submit: boolean;
  debugMode: boolean;
  configuration: {
    [key: string]: unknown;
  };
}

export interface ConsoleLogEntry {
  type: 'log' | 'debug' | 'info' | 'warning' | 'error';
  text: string;
  timestamp: number;
}

export interface StepResult {
  success: boolean;
  message: string;
  alerts?: string[];
  data?: Record<string, unknown>;
  statusFacture?: 'valide';
}

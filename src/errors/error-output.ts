/**
 * Construction de toutes les sorties liées aux erreurs pour bot.ts handleError().
 *
 * - buildErrorMessage() → message string + contexte (stepName, action)
 * - buildIssueFields()  → issueCode, issueSource, issueDetail
 * - buildDebugInfo()    → objet DebugInfo (screenshot)
 */

import type { DebugInfo, IssueDetail } from '../types/bot';
import { IssueCode, IssueSource, classifyIssue, getErrorType } from '../types/error-classification';
import {
  StepError,
  PlatformError,
  InvoiceNotFoundIssue,
  BtaNotFoundIssue,
  ValidationIssue,
  DuplicateInvoiceLitigation,
  ProductionNullLitigation,
} from '../types/errors';
import {
  PLATFORM_ERROR_MESSAGES,
  PLATFORM_ERROR_GENERIC,
  TECHNICAL_ERROR_GENERIC,
  UNKNOWN_ERROR_GENERIC,
} from './messages';

// ─── Message string ───────────────────────────────────────────────────────────

/**
 * Construit le message humain retourné dans result.message,
 * ainsi que stepName et action utilisés dans result.debug.
 */
export function buildErrorMessage(error: unknown): {
  errorMessage: string;
  stepName?: string;
  action?: string;
} {
  // Issues / litigations → le message de l'erreur suffit
  if (
    error instanceof InvoiceNotFoundIssue ||
    error instanceof BtaNotFoundIssue ||
    error instanceof ValidationIssue ||
    error instanceof DuplicateInvoiceLitigation ||
    error instanceof ProductionNullLitigation
  ) {
    return { errorMessage: (error as Error).message };
  }

  if (error instanceof PlatformError) {
    const msg =
      PLATFORM_ERROR_MESSAGES[error.errorCode.toLowerCase()] ??
      PLATFORM_ERROR_GENERIC(error.errorCode, error.action, error.detail);
    return { errorMessage: msg, action: error.action };
  }

  if (error instanceof StepError) {
    const actionParts: string[] = [];
    if (error.errorType) actionParts.push(error.errorType);
    if (error.fieldName) actionParts.push(`champ "${error.fieldName}"`);
    if (error.selector) actionParts.push(`sélecteur "${error.selector}"`);
    const action = actionParts.length > 0 ? actionParts.join(', ') : undefined;

    const parts = [`Step ${error.stepNumber}: ${error.stepName}`];
    if (action) parts.push(`Action: ${action}`);
    if (error.subStep) parts.push(`Sous-étape: ${error.subStep}`);
    parts.push(`Erreur: ${error.message}`);

    const result: { errorMessage: string; stepName?: string; action?: string } = {
      errorMessage: parts.join(' | '),
      stepName: error.stepName,
    };
    if (action) result.action = action;
    return result;
  }

  if (error instanceof Error) {
    getErrorType(error); // kept for side-effect-free classification check
    return { errorMessage: error.message || TECHNICAL_ERROR_GENERIC };
  }

  return { errorMessage: UNKNOWN_ERROR_GENERIC };
}

// ─── Structured issue fields ──────────────────────────────────────────────────

/**
 * Pour result === 'issue' : retourne issueCode, issueSource, et les détails structurés.
 */
export function buildIssueFields(error: unknown): {
  issueCode: IssueCode;
  issueSource: IssueSource;
  issueDetail?: IssueDetail;
} {
  const { issueCode, issueSource } = classifyIssue(error);
  const issueDetail = extractIssueDetail(error);
  return issueDetail ? { issueCode, issueSource, issueDetail } : { issueCode, issueSource };
}

function extractIssueDetail(error: unknown): IssueDetail | undefined {
  if (error instanceof InvoiceNotFoundIssue && error.invoiceStatus) {
    return { statusFacture: error.invoiceStatus };
  }
  if (error instanceof DuplicateInvoiceLitigation) {
    return { errorCode: error.errorCode };
  }
  if (error instanceof ProductionNullLitigation) {
    return { fieldName: error.fieldName, invalidValue: error.invalidValue };
  }
  return undefined;
}

// ─── Debug info ───────────────────────────────────────────────────────────────

/**
 * Pour result === 'error' : construit l'objet DebugInfo à partir des captures.
 */
export function buildDebugInfo(options: {
  stepName?: string;
  action?: string;
  screenshotBase64?: string;
}): DebugInfo {
  const debug: DebugInfo = {};
  if (options.stepName) debug.stepName = options.stepName;
  if (options.action) debug.action = options.action;
  if (options.screenshotBase64) debug.screenshotBase64 = options.screenshotBase64;
  return debug;
}

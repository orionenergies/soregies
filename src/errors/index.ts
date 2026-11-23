/**
 * Point d'entrée centralisé pour la gestion d'erreurs.
 */

// Classes d'erreur
export {
  StepError,
  BtaNotFoundIssue,
  ValidationIssue,
  InvoiceNotFoundIssue,
  DuplicateInvoiceLitigation,
  ProductionNullLitigation,
  PlatformError
} from '../types/errors';

// Classification
export {
  ErrorType,
  ErrorStatus,
  ErrorSource,
  IssueCode,
  IssueSource,
  getErrorType,
  getErrorStatus,
  classifyError,
  classifyIssue,
  isError,
  isIssue,
  isLitigation
} from '../types/error-classification';

// Construction des sorties d'erreur (message + champs structurés)
export { buildErrorMessage, buildIssueFields, buildDebugInfo } from './error-output';

// Capture de debugging (screenshot)
export { captureErrorScreenshot } from './capture';

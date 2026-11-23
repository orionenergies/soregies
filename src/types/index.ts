/**
 * Hub central d'exports pour tous les types du bot Soregies
 * Centralise tous les types dans un seul point d'import
 *
 * Usage:
 * import { BotResult, BotConfig, StepError, ValidationIssue } from './types';
 */

// Bot core types
export * from './bot';

// Configuration types
export * from './config';

// Error types
export * from './errors';
export * from './error-classification';

// Validation types
export * from './validation';

// Step types
export { IndexRow, FormFillResult, SubmissionResult } from './steps';

// Utility types
export * from './utils';

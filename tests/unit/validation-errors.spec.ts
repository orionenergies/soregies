import { test, expect } from '@playwright/test';
import { validateInput, getSoregiesDeclarationConfig } from '../../src/validation';
import { BotFormData } from '../../src/types';
import {
  BtaNotFoundIssue,
  InvoiceNotFoundIssue,
  ValidationIssue,
  DuplicateInvoiceLitigation,
  ProductionNullLitigation,
  PlatformError,
  StepError
} from '../../src/errors';
import { classifyError, classifyIssue } from '../../src/types/error-classification';
import { resolveProducerRetry } from '../../src/utils/workflow-helpers';

const validInput = (invoice: Record<string, unknown> = {}): BotFormData =>
  ({
    submit: false,
    debugMode: false,
    configuration: {
      invoice: {
        spv: 'SPV Exemple',
        reference: 'D100200',
        startDate: '2026-10-01',
        kwhProduction: 250,
        startIndex: 1000,
        ...invoice
      }
    }
  }) as unknown as BotFormData;

test.describe('validation', () => {
  test('accepte le JSON d\'entrée EDF OA (prodAnniversaire ignoré)', () => {
    const input = validInput({ prodAnniversaire: 12, baseRecordUrl: 'https://airtable.com/x' });
    expect(() => validateInput(input)).not.toThrow();
    const config = getSoregiesDeclarationConfig(input);
    expect(config.reference).toBe('D100200');
    expect(config.kwhProduction).toBe(250);
    expect(config.startIndex).toBe(1000);
  });

  test('normalise les dates DD/MM/YYYY', () => {
    const config = getSoregiesDeclarationConfig(validInput({ startDate: '01/10/2026', endDate: '21/11/2026' }));
    expect(config.startDate).toBe('2026-10-01');
    expect(config.endDate).toBe('2026-11-21');
  });

  test('rejette une entrée invalide avec ValidationIssue', () => {
    expect(() => validateInput(validInput({ reference: '' }))).toThrow(ValidationIssue);
    expect(() => validateInput(validInput({ spv: undefined }))).toThrow(ValidationIssue);
    expect(() => validateInput(validInput({ startDate: 'pas-une-date' }))).toThrow(ValidationIssue);
    expect(() => validateInput(validInput({ kwhProduction: -1 }))).toThrow(ValidationIssue);
    expect(() => validateInput({ submit: 'oui', debugMode: false } as unknown as BotFormData)).toThrow(ValidationIssue);
  });
});

test.describe('classification des erreurs', () => {
  test('issues → httpResult issue avec le bon code', () => {
    const cases: Array<[Error, string, string]> = [
      [new BtaNotFoundIssue('D1', 0), 'BTA_NOT_FOUND', 'platform'],
      [new InvoiceNotFoundIssue('Période absente', 'Fermée'), 'INVOICE_NOT_FOUND', 'platform'],
      [new ValidationIssue('x'), 'INVALID_INPUT', 'caller'],
      [new DuplicateInvoiceLitigation('http_409', 'Validation'), 'DUPLICATE_INVOICE', 'business'],
      [new ProductionNullLitigation('kwhProduction', 0), 'PRODUCTION_NULL', 'business']
    ];
    for (const [error, code, source] of cases) {
      expect(classifyError(error).httpResult).toBe('issue');
      expect(classifyIssue(error)).toEqual({ issueCode: code, issueSource: source });
    }
  });

  test('PlatformError → error/platform, autres erreurs → error/caller', () => {
    expect(classifyError(new PlatformError('http_500', 'Validation'))).toEqual({
      httpResult: 'error',
      errorSource: 'platform'
    });
    expect(classifyError(new Error('boom'))).toEqual({ httpResult: 'error', errorSource: 'caller' });
    expect(classifyError(new StepError({ stepName: 'Step', stepNumber: 4, errorType: 'test', message: 'oops' })).httpResult).toBe('error');
  });
});

test.describe('retry multi-profils', () => {
  test('retente tant qu\'il reste des profils', () => {
    const issue = new BtaNotFoundIssue('D1', 0, undefined, 3);
    expect(resolveProducerRetry(issue, 0, 1)).toEqual({ shouldRetry: true, totalMatches: 3 });
    expect(resolveProducerRetry(issue, 2, 1)).toEqual({ shouldRetry: false, totalMatches: 3 });
  });

  test('ne retente pas sur une autre erreur', () => {
    expect(resolveProducerRetry(new Error('x'), 0, 3)).toEqual({ shouldRetry: false, totalMatches: 3 });
  });
});

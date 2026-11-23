import { test, expect } from '@playwright/test';
import { IndexRow } from '../../src/types';
import { selectIndexRow, rowMatchesReference, isOpenStatus } from '../../src/utils/index-matcher';
import { compareStartIndex, computeNewIndex, resolveStatementDate, isWithinTolerance } from '../../src/utils/index-calc';
import { normalizeReference, monthKey, addMonths } from '../../src/utils/date-utils';
import { parseLocalizedNumber } from '../../src/pages/index-detail-page';

const row = (overrides: Partial<IndexRow>): IndexRow => ({
  contractLineId: 'D100200',
  mptCode: 'PRM001',
  fromDate: '2026-10-01',
  status: 'Ouverte',
  position: 0,
  pageIndex: 0,
  ...overrides
});

test.describe('index-matcher', () => {
  test('reconnaît un dossier, un dossier lié (A/B) et un PRM', () => {
    expect(rowMatchesReference(row({}), 'd100200')).toBe(true);
    expect(rowMatchesReference(row({ contractLineId: 'D1/D2' }), 'D2')).toBe(true);
    expect(rowMatchesReference(row({}), 'PRM001')).toBe(true);
    expect(rowMatchesReference(row({}), 'D999')).toBe(false);
    expect(rowMatchesReference(row({}), '  ')).toBe(false);
  });

  test('isOpenStatus ignore la casse et les espaces', () => {
    expect(isOpenStatus(' ouverte ')).toBe(true);
    expect(isOpenStatus('Fermée')).toBe(false);
  });

  test('privilégie la ligne ouverte du même mois', () => {
    const rows = [
      row({ status: 'Fermée', fromDate: '2026-10-01', position: 0 }),
      row({ status: 'Ouverte', fromDate: '2026-10-15', position: 1 }),
      row({ status: 'Ouverte', fromDate: '2026-11-01', position: 2 })
    ];
    const selection = selectIndexRow(rows, 'D100200', '2026-10-01');
    expect(selection.periodRows).toHaveLength(2);
    expect(selection.chosen?.position).toBe(1);
  });

  test('aucune ligne pour la période : pas de sélection, périodes listées', () => {
    const selection = selectIndexRow([row({ fromDate: '2026-09-01' })], 'D100200', '2026-10-01');
    expect(selection.chosen).toBeUndefined();
    expect(selection.availablePeriods).toContain('Ouverte');
  });
});

test.describe('index-calc', () => {
  test('compareStartIndex : alerte seulement si illisible ou différent', () => {
    expect(compareStartIndex(1000, 1000)).toEqual([]);
    expect(compareStartIndex(1000, undefined)).toEqual([]);
    expect(compareStartIndex(1000, 900)).toHaveLength(1);
    expect(compareStartIndex(null, 900)).toHaveLength(1);
  });

  test('computeNewIndex évite les artefacts flottants', () => {
    expect(computeNewIndex(1000, 250)).toBe(1250);
    expect(computeNewIndex(0.1, 0.2)).toBe(0.3);
  });

  test('resolveStatementDate', () => {
    expect(resolveStatementDate(undefined, '2026-10-01', '2026-11-23')).toEqual({ date: null });
    expect(resolveStatementDate('2026-11-01', '2026-10-01', '2026-11-23')).toEqual({ date: '2026-11-01' });
    const out = resolveStatementDate('2027-01-01', '2026-10-01', '2026-11-23');
    expect(out.date).toBeNull();
    expect(out.alert).toBeTruthy();
  });

  test('isWithinTolerance', () => {
    expect(isWithinTolerance(255, 250, 10)).toBe(true);
    expect(isWithinTolerance(261, 250, 10)).toBe(false);
  });
});

test.describe('utilitaires', () => {
  test('normalizeReference / monthKey', () => {
    expect(normalizeReference(' d 100-200 ')).toBe(normalizeReference('D100-200'));
    expect(monthKey('2026-10-15')).toBe(monthKey('2026-10-01'));
  });

  test('addMonths : +1 mois, jour ramené en fin de mois, changement d\'année', () => {
    expect(addMonths('2026-10-01', 1)).toBe('2026-11-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  test('parseLocalizedNumber', () => {
    expect(parseLocalizedNumber('12\u00a0345,5 kWh')).toBe(12345.5);
    expect(parseLocalizedNumber('1 000')).toBe(1000);
    expect(parseLocalizedNumber('—')).toBeNull();
    expect(parseLocalizedNumber('')).toBeNull();
  });
});

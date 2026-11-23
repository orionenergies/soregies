import { test, expect } from '@playwright/test';
import { runBot, BotFormData, BotResult } from '../../src/bot';
import {
  MockIndexEvent,
  MockProfile,
  MockScenario,
  patchChromiumWithMock
} from './mock-soregies-api';

/**
 * Tests de bout en bout du bot Soregies contre l'application Angular réelle
 * (https://mon-espace-producteur.soregies.fr) dont l'API est simulée.
 *
 * Nécessite un accès réseau au site et un Chromium installé :
 *   npm run test:e2e-mock
 */

const EMAIL = 'producteur@example.com';
const PASSWORD = 'mot-de-passe-valide';

function isoToday(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function profile(id: number, fullName: string): MockProfile {
  return {
    id,
    fullName,
    email: `${fullName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    address: '1 rue du Soleil, 75001 Paris',
    producerOk: true,
    managerOk: false
  };
}

function event(overrides: Partial<MockIndexEvent> & Pick<MockIndexEvent, 'id' | 'profileId'>): MockIndexEvent {
  return {
    contractLineId: 'D100200',
    mptCode: '12345678901234',
    fromDate: '2026-10-01',
    state: 'open',
    oldIndexValue: 1000,
    ...overrides
  };
}

function formData(invoice: Record<string, unknown>, submit = true): BotFormData {
  return {
    submit,
    debugMode: false,
    configuration: {
      invoice: {
        reference: 'D100200',
        spv: 'SOLARION 11',
        startDate: '2026-10-01',
        kwhProduction: 250,
        baseRecordUrl: 'https://airtable.com/appXXX/tblYYY/recZZZ',
        ...invoice
      }
    }
  };
}

async function runWithScenario(
  scenario: MockScenario,
  data: BotFormData
): Promise<{ result: BotResult; validations: Array<Record<string, unknown>> }> {
  process.env['NODE_ENV'] = 'production';
  process.env['SOREGIES_USERNAME'] = EMAIL;
  process.env['SOREGIES_PASSWORD'] = PASSWORD;

  const mock = patchChromiumWithMock(scenario);
  try {
    const result = await runBot(data);
    const recorder = await Promise.race([mock.recorder, Promise.resolve(null)]);
    return { result, validations: recorder?.validations ?? [] };
  } finally {
    mock.restore();
  }
}

function baseScenario(overrides: Partial<MockScenario> = {}): MockScenario {
  return {
    login: { email: EMAIL, password: PASSWORD },
    profiles: [profile(1, 'SOLARION 11')],
    events: [event({ id: 501, profileId: 1 })],
    ...overrides
  };
}

test.describe.configure({ mode: 'serial', timeout: 240000 });

test.describe('Bot Soregies - déclaration de production (API simulée)', () => {
  test('succès : saisie de la production soumise (date = startDate + 1 mois)', async () => {
    const { result, validations } = await runWithScenario(baseScenario(), formData({}));

    expect(result.result).toBe('success');
    expect(result.message).toBe('Déclaration soumise avec succès. L\'index a été enregistré sur Soregies.');
    expect(result.spv).toBe('SOLARION 11');
    expect(result.baseRecordUrl).toBe('https://airtable.com/appXXX/tblYYY/recZZZ');
    expect(result.runId).toMatch(/^bot-soregies-\d{8}-\d{6}-[a-z0-9]{4}$/);
    expect(result.businessDetails).toEqual({
      useCase: 'declaration',
      methodeDeclaration: 'index',
      statusFacture: 'valide',
      startIndexSoregies: 1000
    });
    expect(result.logs).toContain('AUTHENTIFICATION');

    expect(validations).toHaveLength(1);
    expect(validations[0]).toMatchObject({
      id: 501,
      indexValue: 1250,
      production: 250,
      indexDate: '2026-11-01'
    });
  });

  test('succès : plusieurs profils homonymes, contrat trouvé sur le second (retry)', async () => {
    const scenario = baseScenario({
      profiles: [profile(1, 'SOLARION 11'), profile(2, 'SOLARION 11 BIS')],
      events: [event({ id: 601, profileId: 2, contractLineId: 'D100200' })]
    });

    const { result, validations } = await runWithScenario(scenario, formData({}));

    expect(result.result).toBe('success');
    expect(result.logs).toContain('essai du profil suivant');
    expect(validations).toHaveLength(1);
    expect(validations[0]).toMatchObject({ id: 601, indexValue: 1250 });
  });

  test('succès : référence donnée par le code PRM', async () => {
    const { result } = await runWithScenario(baseScenario(), formData({ reference: '12345678901234' }));
    expect(result.result).toBe('success');
  });

  test('succès : index lié (deux dossiers), production totale conforme', async () => {
    const scenario = baseScenario({
      events: [event({
        id: 701,
        profileId: 1,
        linked: { id: 702, contractLineId: 'D100201', oldIndexValue: 500, productionBreakdown: 60 }
      })]
    });

    const { result, validations } = await runWithScenario(scenario, formData({ reference: 'D100201' }));

    expect(result.result).toBe('success');
    expect(result.businessDetails.startIndexSoregies).toBe(1500);
    expect(validations[0]).toMatchObject({ id: 701, linkedIndexId: 702 });
    const total = Number(validations[0]?.['production']) + Number(validations[0]?.['linkedIndexProduction']);
    expect(Math.abs(total - 250)).toBeLessThanOrEqual(1);
  });

  test('succès avec alerte : startIndex Airtable différent de l\'ancien index Soregies', async () => {
    const { result } = await runWithScenario(baseScenario(), formData({ startIndex: 900 }));

    expect(result.result).toBe('success');
    expect(result.message).toContain('Index de début Soregies (1000) différent de l\'index Airtable (900)');
  });

  test('submit=false : formulaire prêt, aucune soumission', async () => {
    const { result, validations } = await runWithScenario(baseScenario(), formData({}, false));

    expect(result.result).toBe('success');
    expect(result.message).toBe('Navigation Soregies terminée, formulaire prêt (non soumis)');
    expect(validations).toHaveLength(0);
  });

  test('error : identifiants refusés (HTTP 500 côté bot)', async () => {
    const { result } = await runWithScenario(
      baseScenario({ login: { email: EMAIL, password: 'autre-mot-de-passe' } }),
      formData({})
    );

    expect(result.result).toBe('error');
    expect(result.error).toEqual({ source: 'caller', code: 'StepError' });
    expect(result.message).toContain('Authentification');
    expect(result.debug?.stepName).toBe('Authentification au portail Soregies');
    expect(result.debug?.screenshotBase64).toBeTruthy();
  });

  test('issue BTA_NOT_FOUND : contrat introuvable', async () => {
    const { result } = await runWithScenario(baseScenario(), formData({ reference: 'D999999' }));

    expect(result.result).toBe('issue');
    expect(result.issue).toMatchObject({ code: 'BTA_NOT_FOUND', source: 'platform' });
    expect(result.message).toContain('D999999');
  });

  test('issue INVOICE_NOT_FOUND : période absente', async () => {
    const { result } = await runWithScenario(baseScenario(), formData({ startDate: '2025-03-01' }));

    expect(result.result).toBe('issue');
    expect(result.issue).toMatchObject({ code: 'INVOICE_NOT_FOUND', source: 'platform' });
    expect(result.message).toContain('périodes disponibles');
  });

  test('issue INVOICE_NOT_FOUND : ligne à l\'état « Fermée »', async () => {
    const scenario = baseScenario({ events: [event({ id: 801, profileId: 1, state: 'close' })] });
    const { result, validations } = await runWithScenario(scenario, formData({}));

    expect(result.result).toBe('issue');
    expect(result.issue).toMatchObject({
      code: 'INVOICE_NOT_FOUND',
      source: 'platform',
      detail: { statusFacture: 'Fermée' }
    });
    expect(validations).toHaveLength(0);
  });

  test('issue PRODUCTION_NULL : kwhProduction = 0', async () => {
    const { result, validations } = await runWithScenario(baseScenario(), formData({ kwhProduction: 0 }));

    expect(result.result).toBe('issue');
    expect(result.issue).toMatchObject({
      code: 'PRODUCTION_NULL',
      source: 'business',
      detail: { fieldName: 'kwhProduction', invalidValue: 0 }
    });
    expect(validations).toHaveLength(0);
  });

  test('issue INVALID_INPUT : données d\'entrée invalides', async () => {
    const { result } = await runWithScenario(baseScenario(), formData({ reference: '' }));

    expect(result.result).toBe('issue');
    expect(result.issue).toMatchObject({ code: 'INVALID_INPUT', source: 'caller' });
  });

  test('issue DUPLICATE_INVOICE : validation refusée avec HTTP 409', async () => {
    const scenario = baseScenario({
      validate: { status: 409, body: { flash: 'Une saisie existe déjà pour cette période' } }
    });
    const { result } = await runWithScenario(scenario, formData({}));

    expect(result.result).toBe('issue');
    expect(result.issue).toMatchObject({ code: 'DUPLICATE_INVOICE', source: 'business' });
  });

  test('error platform : API en erreur 500 à la validation', async () => {
    const scenario = baseScenario({ validate: { status: 500, body: { flash: 'Erreur interne' } } });
    const { result } = await runWithScenario(scenario, formData({}));

    expect(result.result).toBe('error');
    expect(result.error).toEqual({ source: 'platform', code: 'PlatformError' });
    expect(result.message).toContain('http_500');
  });
});

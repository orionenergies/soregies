import { BrowserContext, Route, chromium } from 'playwright';

/**
 * Simulation de l'API REST de « Mon Espace Producteur » pour tester le bot de bout en bout.
 *
 * L'application Angular réelle est servie par le vrai site (https://mon-espace-producteur.soregies.fr) ;
 * seules les requêtes vers l'API (api-mon-espace-producteur.clients-prod.aws.soregies.fr) sont
 * interceptées et simulées. Aucun identifiant réel n'est nécessaire.
 */

const API_HOST = 'api-mon-espace-producteur.clients-prod.aws.soregies.fr';

export interface MockProfile {
  id: number;
  fullName: string;
  email: string;
  address: string;
  producerOk: boolean;
  managerOk: boolean;
}

export type MockIndexState = 'open' | 'close' | 'forbidden' | 'next';

export interface MockIndexEvent {
  id: number;
  profileId: number;
  contractLineId: string;
  mptCode: string;
  /** Début de période (YYYY-MM-DD) */
  fromDate: string;
  state: MockIndexState;
  oldIndexValue: number;
  linked?: { id: number; contractLineId: string; oldIndexValue: number; productionBreakdown: number };
}

export interface ValidateBehavior {
  status: number;
  body: unknown;
}

export interface MockScenario {
  login: { email: string; password: string };
  profiles: MockProfile[];
  events: MockIndexEvent[];
  /** Comportement forcé de la route de validation (par défaut : succès) */
  validate?: ValidateBehavior;
  /** Si défini, force le statut HTTP des requêtes `index-events` (liste / détail) */
  indexEventsStatus?: number;
}

export interface MockRecorder {
  /** Corps JSON reçus sur POST …/validate */
  validations: Array<Record<string, unknown>>;
  /** Profil actuellement sélectionné (dernier GET contacts/{id}) */
  requests: string[];
}

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fakeJwt(email: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: 'user-1',
    email,
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    profile: 'PRODUCER'
  })}.signature`;
}

/** Construit l'événement d'index tel que renvoyé par l'API, selon l'état simulé. */
function buildApiEvent(event: MockIndexEvent, profiles: MockProfile[]): Record<string, unknown> {
  const profile = profiles.find(p => p.id === event.profileId);

  // Les dates de facturation théoriques pilotent l'état affiché (Ouverte / Interdite / À venir…)
  const theoretical =
    event.state === 'forbidden' ? isoDaysFromNow(-120)
    : event.state === 'next' ? isoDaysFromNow(70)
    : isoDaysFromNow(-5);

  const closed = event.state === 'close';

  const api: Record<string, unknown> = {
    id: event.id,
    version: 1,
    fromDate: event.fromDate,
    theoreticalDateNextInvoice: theoretical,
    indexDate: closed ? isoDaysFromNow(-40) : null,
    invoicedOk: closed,
    emailSentOk: true,
    manualEntry: null,
    oldIndexValue: event.oldIndexValue,
    indexValue: closed ? event.oldIndexValue + 100 : null,
    production: closed ? 100 : null,
    productionDuration: closed ? 30 : null,
    contractLine: {
      contractLineId: event.contractLineId,
      consentOk: false,
      invoicingRhythmSelect: '1',
      productionBreakdown: event.linked ? String(event.linked.productionBreakdown) : undefined,
      mpt: { code: event.mptCode, address: { fullName: '1 rue du Soleil' }, exchangeRef: null },
      status: { code: 'ACT', name: 'Actif' },
      userSegment: { code: 'P2' },
      linkedContractLine: event.linked
        ? { contractLineId: event.linked.contractLineId, mpt: { code: `${event.mptCode}-2` }, status: { code: 'ACT', name: 'Actif' } }
        : undefined
    },
    ownerPartner: { mainContact: { fullName: profile?.fullName ?? 'Titulaire' } }
  };

  if (event.linked) {
    api['linkedIndex'] = {
      id: event.linked.id,
      version: 1,
      oldIndexValue: event.linked.oldIndexValue,
      indexValue: null,
      production: null,
      contractLine: {
        contractLineId: event.linked.contractLineId,
        status: { code: 'ACT', name: 'Actif' },
        mpt: { code: `${event.mptCode}-2` }
      }
    };
  }

  return api;
}

/** Port de la fonction `Rh` de l'application (état affiché d'une ligne d'index). */
function eventState(event: MockIndexEvent): MockIndexState {
  return event.state;
}

const EDIT_LABEL: Record<string, string> = { open: 'open', close: 'close', forbidden: 'forbidden', contest: 'contest' };

export async function installMockApi(
  context: BrowserContext,
  scenario: MockScenario
): Promise<MockRecorder> {
  const recorder: MockRecorder = { validations: [], requests: [] };

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

  await context.route(`https://${API_HOST}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }

    recorder.requests.push(`${method} ${path}${url.search}`);

    if (path.endsWith('/iam/login') && method === 'POST') {
      const body = request.postDataJSON() as { login?: string; password?: string };
      if (body.login === scenario.login.email && body.password === scenario.login.password) {
        await json(route, 200, {
          authenticationResult: {
            idToken: fakeJwt(body.login),
            accessToken: 'access-token',
            refreshToken: 'refresh-token'
          }
        });
      } else {
        await json(route, 401, { message: 'Incorrect username or password' });
      }
      return;
    }

    if (path.endsWith('/billing-system/contacts') && method === 'GET') {
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const filtered = scenario.profiles.filter(
        p => !search || p.fullName.toLowerCase().includes(search) || p.email.toLowerCase().includes(search)
      );
      await json(route, 200, { total: filtered.length, data: filtered });
      return;
    }

    const contactMatch = path.match(/\/billing-system\/contacts\/(\d+)$/);
    if (contactMatch && method === 'GET') {
      const profile = scenario.profiles.find(p => String(p.id) === contactMatch[1]);
      await json(route, profile ? 200 : 404, profile ?? {});
      return;
    }

    if (path.endsWith('/billing-system/index-events') && method === 'GET') {
      if (scenario.indexEventsStatus) {
        await json(route, scenario.indexEventsStatus, { message: 'boom' });
        return;
      }

      const search = (url.searchParams.get('search') || '').toLowerCase();
      const edit = (url.searchParams.get('edit') || '').split(',').filter(Boolean);
      const offset = Number(url.searchParams.get('offset') || '0');
      const limit = Number(url.searchParams.get('limit') || '10');
      const selectedProfileId = Number(url.searchParams.get('partnerId') || '0');

      const filtered = scenario.events
        .filter(event => !selectedProfileId || event.profileId === selectedProfileId)
        .filter(event => {
          if (!search) return true;
          return [event.contractLineId, event.mptCode, event.linked?.contractLineId ?? '']
            .some(value => value.toLowerCase().includes(search));
        })
        .filter(event => {
          if (edit.length === 0) return true;
          return edit.map(value => EDIT_LABEL[value]).includes(eventState(event));
        });

      await json(route, 200, {
        total: filtered.length,
        data: filtered.slice(offset, offset + limit).map(event => buildApiEvent(event, scenario.profiles))
      });
      return;
    }

    const detailMatch = path.match(/\/billing-system\/index-events\/(\d+)$/);
    if (detailMatch && method === 'GET') {
      if (scenario.indexEventsStatus) {
        await json(route, scenario.indexEventsStatus, { message: 'boom' });
        return;
      }
      const event = scenario.events.find(e => String(e.id) === detailMatch[1]);
      await json(route, event ? 200 : 404, event ? { data: buildApiEvent(event, scenario.profiles) } : {});
      return;
    }

    const validateMatch = path.match(/\/billing-system\/index-events\/(\d+)\/validate$/);
    if (validateMatch && method === 'POST') {
      recorder.validations.push(request.postDataJSON() as Record<string, unknown>);
      if (scenario.validate) {
        await json(route, scenario.validate.status, scenario.validate.body);
        return;
      }
      const event = scenario.events.find(e => String(e.id) === validateMatch[1]);
      if (event) event.state = 'close';
      await json(route, 200, { data: {} });
      return;
    }

    // Appels annexes (contrats, consentement, Linky…) : réponse vide
    await json(route, 200, { total: 0, data: [] });
  });

  return recorder;
}

/**
 * Fait en sorte que chaque contexte créé par `chromium.launch()` (donc par le bot) soit équipé de
 * l'API simulée. Retourne une fonction de restauration et l'enregistreur des appels.
 */
export function patchChromiumWithMock(scenario: MockScenario): {
  recorder: Promise<MockRecorder>;
  restore: () => void;
} {
  const originalLaunch = chromium.launch.bind(chromium);
  let resolveRecorder!: (recorder: MockRecorder) => void;
  const recorder = new Promise<MockRecorder>((resolve) => { resolveRecorder = resolve; });

  (chromium as unknown as { launch: typeof chromium.launch }).launch = (async (options) => {
    const browser = await originalLaunch(options);
    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = (async (contextOptions) => {
      const context = await originalNewContext(contextOptions);
      resolveRecorder(await installMockApi(context, scenario));
      return context;
    }) as typeof browser.newContext;
    return browser;
  }) as typeof chromium.launch;

  return {
    recorder,
    restore: () => {
      (chromium as unknown as { launch: typeof chromium.launch }).launch = originalLaunch as typeof chromium.launch;
    }
  };
}

import { Browser, BrowserContext, Page, Response } from 'playwright';
import { BotConfig } from '../config';
import { Logger } from './logger';
import { ConsoleLogEntry } from '../types';
import { PlatformError, DuplicateInvoiceLitigation } from '../errors';

/** Hôte de l'API REST utilisée par l'application Angular « Mon Espace Producteur ». */
export const SOREGIES_API_HOST = 'api-mon-espace-producteur.clients-prod.aws.soregies.fr';

/** Segments d'API surveillés : une réponse en échec sur ces routes interrompt la déclaration. */
const WATCHED_API_SEGMENTS = ['/billing-system/contacts', '/billing-system/index-events'];

/** Route de validation d'une saisie d'index (POST …/index-events/{id}/validate). */
const VALIDATE_SEGMENT_REGEX = /\/index-events\/[^/]+\/validate/;

/** Motifs d'un message de refus indiquant qu'une saisie existe déjà pour la période. */
const DUPLICATE_FLASH_REGEX = /d[ée]j[àa]\s+(?:[ée]t[ée]\s+)?(?:saisi|d[ée]clar|enregistr)|en doublon|already/i;

/**
 * Erreur détectée en arrière-plan par le listener réseau.
 * (litige = doublon de déclaration ; sinon erreur de plateforme)
 */
type DetectedLitigeError = DuplicateInvoiceLitigation;

/**
 * Gestionnaire du navigateur pour le bot Soregies
 * Gère l'initialisation et le nettoyage du navigateur.
 *
 * Pas de réutilisation de session : l'application Soregies stocke ses jetons Cognito dans le
 * `sessionStorage` du navigateur, qui n'est pas persisté par Playwright (storageState).
 * Chaque exécution se reconnecte donc avec les identifiants.
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly config: BotConfig;
  private consoleLogs: ConsoleLogEntry[] = [];

  // Tracking des actions en cours pour détecter les erreurs de plateforme
  private currentAction: string | null = null;
  private detectedPlatformError: PlatformError | null = null;
  private detectedLitigeError: DetectedLitigeError | null = null;

  constructor(config: BotConfig) {
    this.config = config;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Page non initialisée. Appeler initializeBrowser() d\'abord.');
    }
    return this.page;
  }

  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Context non initialisé. Appeler initializeBrowser() d\'abord.');
    }
    return this.context;
  }

  /**
   * Retourne les logs de console collectés depuis le début de la session
   */
  getConsoleLogs(): ConsoleLogEntry[] {
    return [...this.consoleLogs];
  }

  /**
   * Réinitialise les logs de console
   */
  clearConsoleLogs(): void {
    this.consoleLogs = [];
  }

  /**
   * Initialise le navigateur et la page
   */
  async initializeBrowser(): Promise<void> {
    const { chromium } = await import('playwright');

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.config.browser.headless,
      timeout: this.config.browser.timeout,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };

    if (this.config.browser.slowMo && this.config.browser.slowMo > 0) {
      launchOptions.slowMo = this.config.browser.slowMo;
    }

    this.browser = await chromium.launch(launchOptions);

    const contextOptions: Parameters<typeof this.browser.newContext>[0] = {
      viewport: this.config.browser.viewport.width > 0 && this.config.browser.viewport.height > 0
        ? this.config.browser.viewport
        : null,
      userAgent: this.config.browser.userAgent,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris'
    };

    this.context = await this.browser.newContext(contextOptions);

    // Timeouts par défaut Playwright relevés à 60s : absorbe la latence variable
    // de la plateforme depuis Cloud Run.
    this.context.setDefaultTimeout(60000);
    this.context.setDefaultNavigationTimeout(60000);

    this.page = await this.context.newPage();

    this.consoleLogs = [];
    this.page.on('console', (msg) => {
      const type = msg.type() as ConsoleLogEntry['type'];
      const text = msg.text();
      if (this.consoleLogs.length >= 500) {
        this.consoleLogs.shift();
      }
      this.consoleLogs.push({
        type,
        text,
        timestamp: Date.now()
      });
    });

    this.setupPlatformErrorListener();
  }

  /**
   * Garde le navigateur ouvert (mode local uniquement)
   * @param reason 'debugging' pour une erreur, 'success' après un succès
   */
  async keepOpen(reason: 'debugging' | 'success'): Promise<void> {
    if (!this.browser) return;

    if (reason === 'debugging') {
      Logger.info('🔍 Navigateur maintenu ouvert pour debugging');
      Logger.info('📍 La page reste à l\'endroit exact où l\'erreur s\'est produite');
    } else {
      Logger.info('🔍 Le navigateur reste ouvert pour continuer le développement');
    }
    Logger.info('🔐 La session reste active, vous êtes toujours connecté');
  }

  /**
   * Enregistre l'action en cours pour le tracking des erreurs de plateforme
   * @param action Description de l'action en cours
   */
  setCurrentAction(action: string): void {
    this.currentAction = action;
    this.detectedPlatformError = null;
    this.detectedLitigeError = null;
  }

  /**
   * Efface l'action en cours
   */
  clearCurrentAction(): void {
    this.currentAction = null;
  }

  /**
   * Récupère l'erreur de plateforme détectée (si elle existe)
   */
  getDetectedPlatformError(): PlatformError | null {
    return this.detectedPlatformError;
  }

  /**
   * Réinitialise l'erreur de plateforme détectée
   */
  clearDetectedPlatformError(): void {
    this.detectedPlatformError = null;
  }

  /**
   * Récupère l'erreur de litige détectée (si elle existe)
   */
  getDetectedLitigeError(): DetectedLitigeError | null {
    return this.detectedLitigeError;
  }

  /**
   * Réinitialise l'erreur de litige détectée
   */
  clearDetectedLitigeError(): void {
    this.detectedLitigeError = null;
  }

  /**
   * Configure le listener qui détecte automatiquement les erreurs de plateforme.
   * L'application Soregies ne navigue pas vers une page d'erreur : elle affiche une alerte et les
   * erreurs transitent par les réponses de l'API REST, que l'on surveille donc directement.
   */
  private setupPlatformErrorListener(): void {
    if (!this.page) return;

    this.page.on('response', (response) => {
      this.inspectApiResponse(response).catch(() => {
        // Ignorer silencieusement : corps illisible, page fermée, etc.
      });
    });
  }

  /**
   * Analyse une réponse de l'API et enregistre une erreur détectée.
   * Seules les routes `contacts` et `index-events` sont surveillées (les appels annexes comme
   * le télérelevé Linky ou le consentement sont tolérés en échec par l'application).
   */
  private async inspectApiResponse(response: Response): Promise<void> {
    if (!this.currentAction) return;

    const url = response.url();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.host !== SOREGIES_API_HOST) return;
    if (!WATCHED_API_SEGMENTS.some(segment => parsed.pathname.includes(segment))) return;

    const status = response.status();
    // Les 401 ne sont pas surveillés : l'application renouvelle elle-même un jeton expiré
    if (status < 400 || status === 401) return;
    if (this.detectedPlatformError || this.detectedLitigeError) return;

    const action = this.currentAction;
    const isValidate = VALIDATE_SEGMENT_REGEX.test(parsed.pathname);
    const flash = await this.readFlashMessage(response);

    if (isValidate && (status === 409 || (flash && DUPLICATE_FLASH_REGEX.test(flash)))) {
      this.detectedLitigeError = new DuplicateInvoiceLitigation(
        'declaration_en_doublon',
        action,
        `La plateforme Soregies a refusé la saisie après "${action}" (HTTP ${status})` +
          (flash ? ` : ${flash}` : '') +
          '. La déclaration est en doublon et nécessite une vérification manuelle.'
      );
      Logger.warn(`⚠️ Litigation détectée: ${this.detectedLitigeError.message}`);
      return;
    }

    if (status >= 500 || isValidate) {
      this.detectedPlatformError = new PlatformError(
        `http_${status}`,
        action,
        `Erreur de la plateforme Soregies détectée après "${action}" (HTTP ${status}). URL: ${parsed.pathname}`,
        flash
      );
      Logger.warn(`⚠️ Erreur de plateforme détectée: ${this.detectedPlatformError.message}`);
    }
  }

  /** Lit le champ `flash` du corps JSON d'une réponse d'erreur (message utilisateur de l'API). */
  private async readFlashMessage(response: Response): Promise<string | undefined> {
    try {
      const body = await response.json() as { flash?: unknown; message?: unknown } | null;
      const raw = body?.flash ?? body?.message;
      return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Nettoie les ressources.
   * Si keepBrowserOpen est true (mode local), le navigateur reste ouvert pour inspection.
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      if (this.config.automation.keepBrowserOpen) {
        Logger.info('Le navigateur reste ouvert pour inspection manuelle');
        Logger.info('Vous pouvez maintenant inspecter le résultat dans le navigateur');
        return;
      }

      await this.browser.close();
      Logger.infoAlways('Navigateur fermé');
    }
  }
}

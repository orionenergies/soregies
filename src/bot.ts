/**
 * Bot d'automatisation Soregies (Mon Espace Producteur)
 * Orchestrateur principal qui coordonne toutes les étapes du workflow de déclaration de production.
 *
 * Même contrat d'entrée / sortie que le bot EDF OA, limité à l'instruction de déclaration :
 * - Step 0 : authentification
 * - Step 1 : choix du profil producteur (SPV)
 * - Step 2 : recherche du contrat (dossier / PRM)
 * - Step 3 : détection de la ligne d'index (période + état « Ouverte »)
 * - Step 4 : remplissage du formulaire (date de relevé + nouvel index)
 * - Step 5 : vérification de la production + validation
 */

import { buildConfig, BotConfig } from './config';
import { BotFormData, BotResult, StepResult } from './types';
import { Logger } from './utils/logger';
import {
  StepError,
  ValidationIssue,
  buildErrorMessage,
  buildIssueFields,
  buildDebugInfo,
  captureErrorScreenshot,
} from './errors';
import { classifyError } from './types/error-classification';
import { validateAndExtractConfig, SoregiesDeclarationConfig } from './validation';
import { BrowserManager } from './utils/browser-manager';
import { trackAction } from './utils/action-tracker';
import { selectProfileAndFindContract } from './utils/workflow-helpers';
import { ExecutionTimer } from './utils/metrics-tracker';
import { ResultBuilder } from './utils/result-builder';
import { generateRunId } from './utils/run-id-generator';

import { AuthenticationStep, IndexRouterStep } from './steps/common';
import { RemplissageFormulaireStep, SoumissionStep } from './steps/declaration';

export { BotFormData, BotResult } from './types';

export class Bot {
  private browserManager: BrowserManager | null = null;
  private formData: BotFormData;
  private currentConfig: BotConfig;
  private soregiesConfig: SoregiesDeclarationConfig | null = null;
  private timer: ExecutionTimer;
  private runId: string;
  // Cas d'usage ré-exposé tel quel dans businessDetails.useCase de la réponse.
  // Soregies ne supporte que la déclaration.
  private useCase?: 'declaration';

  constructor(formData: BotFormData) {
    this.formData = formData;
    this.currentConfig = buildConfig(formData.debugMode, formData.submit);
    this.timer = new ExecutionTimer();
    this.runId = generateRunId();
  }

  private getRunId(): string {
    return this.runId;
  }

  async run(): Promise<BotResult> {
    let hasError = false;
    this.timer.start();

    try {
      this.soregiesConfig = validateAndExtractConfig(this.formData, this.currentConfig);

      Logger.init(this.currentConfig.automation.debugMode);
      Logger.start();

      this.browserManager = new BrowserManager(this.currentConfig);
      await this.browserManager.initializeBrowser();
      const page = this.browserManager.getPage();

      // Step 0 : Authentification
      await trackAction(this.browserManager, 'Authentification au portail', async () => {
        const authenticationStep = new AuthenticationStep(page, this.currentConfig);
        return await authenticationStep.execute();
      });

      // Steps 1+2 : Sélection du profil producteur et recherche du contrat (avec retry)
      await selectProfileAndFindContract(
        page,
        this.browserManager,
        this.currentConfig,
        this.soregiesConfig
      );

      // Step 3 : Détection de la ligne d'index à déclarer
      await trackAction(this.browserManager, 'Détection de la ligne d\'index', async () => {
        const indexRouterStep = new IndexRouterStep(page, this.currentConfig, this.soregiesConfig!);
        return await indexRouterStep.execute();
      });

      // Comme pour EDF OA, le cas d'usage n'est connu qu'une fois la ligne d'index détectée
      this.useCase = 'declaration';

      return await this.handleDeclaration(page);

    } catch (error) {
      hasError = true;
      return await this.handleError(error);

    } finally {
      const isLocalMode = !this.currentConfig.browser.headless;
      if (this.browserManager && !isLocalMode && !hasError) {
        await this.browserManager.cleanup();
      }
    }
  }

  private async handleDeclaration(page: ReturnType<BrowserManager['getPage']>): Promise<BotResult> {
    if (this.soregiesConfig?.kwhProduction === undefined) {
      throw new ValidationIssue('Le champ kwhProduction est requis pour la déclaration de production');
    }

    Logger.action('Flow DECLARATION (saisie d\'index Soregies)');

    // Step 4 : Remplissage du formulaire
    const step4Result = await trackAction(this.browserManager!, 'Remplissage du formulaire', async () => {
      const remplissageFormulaireStep = new RemplissageFormulaireStep(page, this.currentConfig, this.soregiesConfig!);
      return await remplissageFormulaireStep.execute();
    });

    const step4Alerts = step4Result.alerts;
    const startIndexSoregies = step4Result.data.startIndexSoregies;

    // Step 5 : Vérification et validation de la production
    const submissionResult: StepResult = await trackAction(this.browserManager!, 'Validation de la production', async () => {
      const soumissionStep = new SoumissionStep(page, this.currentConfig, this.soregiesConfig!, this.browserManager!);
      return await soumissionStep.execute();
    });

    Logger.end();

    const isLocalMode = !this.currentConfig.browser.headless;
    if (isLocalMode && this.browserManager) {
      await this.browserManager.keepOpen('success');
    }

    const wasSubmitted = this.formData.submit;
    const message = ResultBuilder.buildDeclarationMessage({
      wasSubmitted,
      submissionResult,
      ...(step4Alerts && { step4Alerts })
    });

    const businessDetails = ResultBuilder.buildDeclarationBusinessDetails({
      startIndexSoregies,
      statusFacture: submissionResult.statusFacture,
    });

    return {
      runId: this.getRunId(),
      result: 'success',
      message,
      timestamp: new Date().toISOString(),
      executionTimeMs: this.timer.getElapsedMs(),
      ...ResultBuilder.buildExecutionMetadata(),
      spv: this.soregiesConfig?.spv ?? '',
      baseRecordUrl: this.soregiesConfig?.baseRecordUrl ?? '',
      businessDetails,
    };
  }

  private async handleError(error: unknown): Promise<BotResult> {
    const detectedLitigeError = this.browserManager?.getDetectedLitigeError();
    const detectedPlatformError = this.browserManager?.getDetectedPlatformError();

    if (detectedLitigeError) {
      error = detectedLitigeError;
      Logger.warn(`⚠️ Erreur de litige détectée: ${detectedLitigeError.message}`);
    } else if (detectedPlatformError) {
      error = detectedPlatformError;
      Logger.warn(`⚠️ Erreur de plateforme détectée: ${detectedPlatformError.message}`);
    }

    Logger.error(error instanceof StepError || error instanceof Error ? error : new Error(String(error)));

    const { errorMessage, stepName, action } = buildErrorMessage(error);
    const isLocalMode = !this.currentConfig.browser.headless;
    const errorTimestamp = Date.now();
    // Si l'erreur s'est produite avant que la page soit initialisée (ex: crash
    // Chromium au launch), getPage() jetterait "Page non initialisée" et masquerait
    // le vrai message d'erreur. On récupère la page de manière défensive.
    let page: ReturnType<BrowserManager['getPage']> | null = null;
    try {
      page = this.browserManager?.getPage() || null;
    } catch {
      page = null;
    }

    Logger.info('📸 Capture du screenshot en cours...');
    const screenshotResult = await captureErrorScreenshot(page, this.currentConfig, isLocalMode, errorTimestamp);

    const { httpResult, errorSource } = classifyError(error);

    const businessDetails: BotResult['businessDetails'] = {
      ...(this.useCase && { useCase: this.useCase }),
    };

    const result: BotResult = {
      runId: this.getRunId(),
      result: httpResult === 'error' ? 'error' : 'issue',
      message: errorMessage,
      timestamp: new Date().toISOString(),
      executionTimeMs: this.timer.getElapsedMs(),
      ...ResultBuilder.buildExecutionMetadata(),
      spv: this.soregiesConfig?.spv ?? '',
      baseRecordUrl: this.soregiesConfig?.baseRecordUrl ?? '',
      businessDetails,
    };

    if (httpResult === 'error') {
      // Crash technique → objet error
      result.error = {
        source: errorSource || 'caller',
        code: error instanceof Error ? error.name : 'UnknownError',
      };
      // Debug info en production
      const debug = buildDebugInfo({
        ...(stepName && { stepName }),
        ...(action && { action }),
        ...(!isLocalMode && screenshotResult.base64 && { screenshotBase64: screenshotResult.base64 })
      });
      if (Object.keys(debug).length > 0) result.debug = debug;
    } else {
      // Issue métier → objet issue
      const { issueCode, issueSource, issueDetail } = buildIssueFields(error);
      result.issue = {
        code: issueCode,
        source: issueSource,
        ...(issueDetail && { detail: issueDetail }),
      };
    }

    try {
      if (isLocalMode && this.browserManager) {
        Logger.info('📸 Screenshot sauvegardé dans le dossier screenshots/');
        await this.browserManager.keepOpen('debugging');
      } else if (this.browserManager) {
        await this.browserManager.cleanup();
      }
    } catch (cleanupError) {
      Logger.warn(`⚠️ Erreur lors du cleanup (ignorée): ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    }

    return result;
  }
}

export async function runBot(formData: BotFormData): Promise<BotResult> {
  const bot = new Bot(formData);
  return await bot.run();
}

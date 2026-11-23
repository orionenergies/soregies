import { Page } from 'playwright';
import { SubmissionResult } from '../../types';
import { BotConfig } from '../../config';
import { Logger } from '../../utils/logger';
import { StepError, PlatformError, DuplicateInvoiceLitigation } from '../../errors';
import { SoregiesDeclarationConfig } from '../../validation';
import { BUSINESS_RULES } from '../../constants';
import { IndexDetailPage } from '../../pages/index-detail-page';
import { BrowserManager } from '../../utils/browser-manager';
import { isWithinTolerance } from '../../utils/index-calc';

/**
 * Step Déclaration : vérification et soumission de la saisie d'index.
 *
 * Soregies n'a pas de page de récapitulatif : le contrôle de cohérence (production affichée vs
 * kwhProduction, tolérance ±10 kWh) est donc fait sur le formulaire, juste avant la confirmation
 * de la boîte de dialogue « Valider la production ».
 */
export class SoumissionStep {
  private readonly page: Page;
  private readonly config: BotConfig;
  private readonly declarationConfig: SoregiesDeclarationConfig;
  private readonly browserManager: BrowserManager;

  constructor(
    page: Page,
    config: BotConfig,
    declarationConfig: SoregiesDeclarationConfig,
    browserManager: BrowserManager
  ) {
    this.page = page;
    this.config = config;
    this.declarationConfig = declarationConfig;
    this.browserManager = browserManager;
  }

  async execute(): Promise<SubmissionResult> {
    const stepNumber = 5;
    const stepName = 'Vérification et validation de la production';

    try {
      Logger.step(stepNumber, stepName);

      const detailPage = new IndexDetailPage(this.page, this.config);

      // Étape 1 : Vérification métier - contrôle de la production calculée par Soregies
      await this.verifyTotalQuantity(detailPage);

      // Étape 2 : Le formulaire doit être valide (bouton « Valider la production » actif)
      if (!(await detailPage.isSubmitEnabled())) {
        const fieldErrors = await detailPage.readFieldErrors();
        throw new Error(
          'Le formulaire Soregies n\'est pas valide, le bouton "Valider la production" est désactivé' +
          (fieldErrors.length > 0 ? ` (${fieldErrors.join(' ; ')})` : '')
        );
      }

      // Étape 3 : Vérifier si on doit soumettre le formulaire
      if (!this.config.automation.finalSubmission) {
        Logger.info('🛑 Soumission désactivée (submit=false)');
        return {
          success: true,
          message: 'Formulaire validé, saisie prête (non soumise - submit=false)',
          data: { submitted: false }
        };
      }

      // Étape 4 : Valider la production et confirmer la boîte de dialogue
      const outcome = await detailPage.submitAndConfirm();

      if (outcome.kind === 'error') {
        // Laisser le listener réseau finir de lire le corps de la réponse d'erreur
        await this.page.waitForTimeout(500);
        const detected = this.browserManager.getDetectedLitigeError() ?? this.browserManager.getDetectedPlatformError();
        if (detected) throw detected;

        throw new PlatformError(
          'declaration_refusee',
          stepName,
          `Soregies a refusé la saisie : ${outcome.message}`,
          outcome.message
        );
      }

      Logger.infoAlways('✅ Déclaration soumise et enregistrée par Soregies');

      return {
        success: true,
        message: 'Déclaration soumise avec succès. L\'index a été enregistré sur Soregies.',
        statusFacture: 'valide',
        data: { submitted: true }
      };
    } catch (error) {
      if (error instanceof PlatformError || error instanceof DuplicateInvoiceLitigation) {
        throw error;
      }
      throw new StepError({
        stepName,
        stepNumber,
        errorType: 'Erreur lors de la validation de la production',
        message: error instanceof Error ? error.message : 'Erreur inconnue lors de la validation de la production',
        originalError: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  /**
   * Vérifie que la production affichée par Soregies correspond à kwhProduction (avec tolérance)
   */
  private async verifyTotalQuantity(detailPage: IndexDetailPage): Promise<void> {
    const expectedKwh = this.declarationConfig.kwhProduction;

    if (expectedKwh === undefined) {
      Logger.warn('⚠️ kwhProduction non défini, vérification de quantité ignorée');
      return;
    }

    const toleranceKwh = BUSINESS_RULES.recapQuantityToleranceKwh;
    const foundQuantity = await detailPage.readProductionTotal();

    const difference = Math.abs(foundQuantity - expectedKwh);

    if (!isWithinTolerance(foundQuantity, expectedKwh, toleranceKwh)) {
      const percentDiff = expectedKwh > 0 ? ((difference / expectedKwh) * 100).toFixed(2) : 'N/A';
      throw new StepError({
        stepName: 'Vérification et validation de la production',
        stepNumber: 5,
        errorType: 'Incohérence lors du remplissage du formulaire',
        message:
          `Le formulaire affiche une production différente de celle attendue. ` +
          `Le bot a probablement mal rempli le formulaire à l'étape précédente. ` +
          `Production affichée = ${foundQuantity} kWh, ` +
          `kwhProduction attendu = ${expectedKwh} kWh ` +
          `(différence: ${difference} kWh, ${percentDiff}%, tolérance: ±${toleranceKwh} kWh)`
      });
    }

    if (difference > 0) {
      const percentDiff = expectedKwh > 0 ? ((difference / expectedKwh) * 100).toFixed(2) : 'N/A';
      Logger.fieldSuccess(
        `Production vérifiée: ${foundQuantity} kWh ≈ kwhProduction ${expectedKwh} kWh ` +
        `(différence: ${difference} kWh, ${percentDiff}%, tolérance: ±${toleranceKwh} kWh)`
      );
    } else {
      Logger.fieldSuccess(`Production vérifiée: ${foundQuantity} kWh = kwhProduction`);
    }
  }
}

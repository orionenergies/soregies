import { Page } from 'playwright';
import { FormFillResult } from '../../types';
import { BotConfig } from '../../config';
import { Logger } from '../../utils/logger';
import { StepError, ProductionNullLitigation, InvoiceNotFoundIssue } from '../../errors';
import { SoregiesDeclarationConfig } from '../../validation';
import { BUSINESS_RULES } from '../../constants';
import { IndexDetailPage } from '../../pages/index-detail-page';
import { HomePage } from '../../pages/home-page';
import { computeNewIndex, resolveStatementDate } from '../../utils/index-calc';
import { firstDayOfNextMonth } from '../../utils/date-utils';

/**
 * Step Déclaration : remplissage du formulaire « Saisir ma production » de Soregies.
 * La ligne d'index a déjà été ouverte par le routeur (step 3).
 *
 * Renseigne la date de relevé (1er jour du mois suivant startDate, si acceptée par le champ) puis
 * la production (kwhProduction) dans le dernier champ du formulaire.
 */
export class RemplissageFormulaireStep {
  private readonly page: Page;
  private readonly config: BotConfig;
  private readonly declarationConfig: SoregiesDeclarationConfig;

  constructor(page: Page, config: BotConfig, declarationConfig: SoregiesDeclarationConfig) {
    this.page = page;
    this.config = config;
    this.declarationConfig = declarationConfig;
  }

  async execute(): Promise<FormFillResult> {
    const stepNumber = 4;
    const stepName = 'Remplissage du formulaire';

    try {
      Logger.step(stepNumber, stepName);

      const { kwhProduction, startDate } = this.declarationConfig;
      if (kwhProduction === undefined || kwhProduction === null) {
        throw new Error('kwhProduction est requis pour remplir le formulaire de déclaration de production');
      }

      const detailPage = new IndexDetailPage(this.page, this.config);
      await detailPage.waitForDetails();
      await new HomePage(this.page, this.config).closePopups(500);

      if (!(await detailPage.isFormVisible())) {
        throw new InvoiceNotFoundIssue(
          'Le formulaire de déclaration de production n\'est pas disponible pour cette ligne (production déjà déclarée ou saisie non ouverte)'
        );
      }
      Logger.action('Formulaire "Saisir ma production" détecté');

      // Soregies impose une production d'au moins 1 kWh.
      if (kwhProduction < BUSINESS_RULES.minProductionKwh) {
        throw new ProductionNullLitigation(
          'kwhProduction',
          kwhProduction,
          `La plateforme Soregies n'accepte pas la valeur ${kwhProduction} pour la production ` +
          `(minimum ${BUSINESS_RULES.minProductionKwh} kWh). ` +
          'La déclaration nécessite une déclaration manuelle.'
        );
      }

      const alerts: string[] = [];

      const minDate = await detailPage.dateInput.getAttribute('min');
      const maxDate = await detailPage.dateInput.getAttribute('max');
      const statementDate = resolveStatementDate(firstDayOfNextMonth(startDate), minDate, maxDate);
      if (statementDate.alert) alerts.push(statementDate.alert);

      if (statementDate.date) {
        await detailPage.fillStatementDate(statementDate.date);
        Logger.fieldSuccess(`Date de relevé: ${statementDate.date}`);
      } else {
        Logger.fieldSuccess(`Date de relevé: ${await detailPage.readStatementDate()} (par défaut)`);
      }

      if (await detailPage.isProductionEditable()) {
        await detailPage.fillProduction(kwhProduction);
        Logger.fieldSuccess(`Production: ${kwhProduction} kWh`);
      } else {
        // Production liée à deux dossiers : les champs de production sont en lecture seule et
        // calculés par Soregies à partir de l'unique champ éditable (somme des anciens compteurs + production).
        const previousTotal = await detailPage.readOldIndex();
        if (previousTotal === null) {
          throw new Error(
            'Les champs de production sont en lecture seule (dossiers liés) et la valeur de référence Soregies ' +
            'est illisible : impossible de saisir la production.'
          );
        }
        await detailPage.fillNewIndex(computeNewIndex(previousTotal, kwhProduction));
        Logger.fieldSuccess(`Production: ${kwhProduction} kWh (saisie via le champ de cumul, dossiers liés)`);
      }

      alerts.forEach(alert => Logger.warn(alert));

      const result: FormFillResult = {
        success: true,
        message: 'Formulaire de déclaration de production rempli avec succès',
        data: {
          statementDate: statementDate.date
        }
      };
      if (alerts.length > 0) result.alerts = alerts;

      return result;
    } catch (error) {
      // Issue/litigation errors must propagate directly (not wrapped in StepError)
      if (error instanceof ProductionNullLitigation || error instanceof InvoiceNotFoundIssue) {
        throw error;
      }
      throw new StepError({
        stepName,
        stepNumber,
        errorType: 'Erreur de remplissage du formulaire',
        message: error instanceof Error ? error.message : 'Erreur inconnue lors du remplissage du formulaire',
        originalError: error instanceof Error ? error : new Error(String(error))
      });
    }
  }
}

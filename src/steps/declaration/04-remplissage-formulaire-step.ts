import { Page } from 'playwright';
import { FormFillResult } from '../../types';
import { BotConfig } from '../../config';
import { Logger } from '../../utils/logger';
import { StepError, ProductionNullLitigation, InvoiceNotFoundIssue } from '../../errors';
import { SoregiesDeclarationConfig } from '../../validation';
import { BUSINESS_RULES } from '../../constants';
import { IndexDetailPage } from '../../pages/index-detail-page';
import { HomePage } from '../../pages/home-page';
import { compareStartIndex, computeNewIndex, resolveStatementDate } from '../../utils/index-calc';
import { addMonths } from '../../utils/date-utils';

/**
 * Step Déclaration : remplissage du formulaire « Saisir ma production » de Soregies.
 * La ligne d'index a déjà été ouverte par le routeur (step 3).
 *
 * Renseigne la date de relevé (startDate + 1 mois, si acceptée par le champ) puis la production
 * (kwhProduction) dans le dernier champ du formulaire. Soregies en déduit le nouvel index.
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

      const { kwhProduction, startIndex: airtableStartIndex, startDate } = this.declarationConfig;
      if (kwhProduction === undefined || kwhProduction === null) {
        throw new Error('kwhProduction est requis pour remplir le formulaire de saisie d\'index');
      }

      const detailPage = new IndexDetailPage(this.page, this.config);
      await detailPage.waitForDetails();
      await new HomePage(this.page, this.config).closePopups(500);

      if (!(await detailPage.isFormVisible())) {
        throw new InvoiceNotFoundIssue(
          'Le formulaire de saisie d\'index n\'est pas disponible pour cette ligne (index déjà saisi ou saisie non ouverte)'
        );
      }
      Logger.action('Formulaire "Saisir ma production" détecté');

      // Soregies impose une production >= 1 kWh et un nouvel index strictement supérieur à l'ancien.
      if (kwhProduction < BUSINESS_RULES.minProductionKwh) {
        throw new ProductionNullLitigation(
          'kwhProduction',
          kwhProduction,
          `La plateforme Soregies n'accepte pas la valeur ${kwhProduction} pour la production ` +
          `(minimum ${BUSINESS_RULES.minProductionKwh} kWh, nouvel index strictement supérieur à l'ancien). ` +
          'La déclaration nécessite une déclaration manuelle.'
        );
      }

      const soregiesStartIndex = await detailPage.readOldIndex();
      Logger.fieldSuccess(
        `Ancien index Soregies lu: ${soregiesStartIndex ?? '(illisible)'}` +
        (airtableStartIndex !== undefined ? `, Index Airtable: ${airtableStartIndex}` : '')
      );

      const alerts = compareStartIndex(soregiesStartIndex, airtableStartIndex);

      const minDate = await detailPage.dateInput.getAttribute('min');
      const maxDate = await detailPage.dateInput.getAttribute('max');
      const statementDate = resolveStatementDate(addMonths(startDate, 1), minDate, maxDate);
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
        // Index lié (deux dossiers) : les champs de production sont en lecture seule, calculés
        // à partir du nouvel index (somme des anciens index + production).
        if (soregiesStartIndex === null) {
          throw new Error(
            'Les champs de production sont en lecture seule (index lié) et l\'ancien index Soregies est illisible : ' +
            'impossible de calculer le nouvel index.'
          );
        }
        const computedIndex = computeNewIndex(soregiesStartIndex, kwhProduction);
        await detailPage.fillNewIndex(computedIndex);
        Logger.fieldSuccess(
          `Nouvel index: ${computedIndex} (ancien index ${soregiesStartIndex} + production ${kwhProduction}, production en lecture seule)`
        );
      }
      const newIndex = await detailPage.readNewIndex();
      Logger.fieldSuccess(`Nouvel index Soregies: ${newIndex ?? 'illisible'}`);

      alerts.forEach(alert => Logger.warn(alert));

      const result: FormFillResult = {
        success: true,
        message: 'Formulaire de saisie d\'index rempli avec succès',
        data: {
          methodeDeclaration: 'index',
          startIndexSoregies: soregiesStartIndex,
          newIndex
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

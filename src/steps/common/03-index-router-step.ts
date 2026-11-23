import { Page } from 'playwright';
import { IndexRow, StepResult } from '../../types';
import { BotConfig } from '../../config';
import { Logger } from '../../utils/logger';
import { StepError, InvoiceNotFoundIssue } from '../../errors';
import { SoregiesDeclarationConfig } from '../../validation';
import { IndexListPage } from '../../pages/index-list-page';
import { formatFrenchDate } from '../../utils/date-utils';
import { isOpenStatus, selectIndexRow } from '../../utils/index-matcher';

/**
 * Step 3 : détection de la ligne d'index à déclarer.
 *
 * Retrouve la ligne du contrat dont la « Date début » correspond à `startDate` (même mois et année)
 * et l'ouvre si son état est « Ouverte ». Les autres états (Fermée, Interdite, Contestable, À venir)
 * ou l'absence de la période produisent une InvoiceNotFoundIssue, comme un statut de facture non
 * traitable côté EDF OA.
 */
export class IndexRouterStep {
  private readonly page: Page;
  private readonly config: BotConfig;
  private readonly declarationConfig: SoregiesDeclarationConfig;

  constructor(page: Page, config: BotConfig, declarationConfig: SoregiesDeclarationConfig) {
    this.page = page;
    this.config = config;
    this.declarationConfig = declarationConfig;
  }

  async execute(): Promise<StepResult & { data: { indexStatus: string; fromDate: string | null } }> {
    const stepNumber = 3;
    const stepName = 'Détection de la ligne d\'index';
    const { reference, startDate } = this.declarationConfig;

    try {
      Logger.step(stepNumber, stepName);

      const indexList = new IndexListPage(this.page, this.config);
      await indexList.waitForPage();

      let rows = await indexList.readAllRows();
      let selection = selectIndexRow(rows, reference, startDate);

      if (!selection.chosen) {
        Logger.action('Période absente avec les filtres actuels, activation de tous les états');
        await indexList.enableAllStateFilters();
        rows = await indexList.readAllRows();
        selection = selectIndexRow(rows, reference, startDate);
      }

      const { chosen, periodRows, availablePeriods } = selection;

      if (!chosen) {
        throw new InvoiceNotFoundIssue(
          `Aucun index trouvé pour le contrat "${reference}" sur la période débutant en ${formatFrenchDate(startDate)}` +
          (availablePeriods ? ` (périodes disponibles : ${availablePeriods})` : '')
        );
      }

      this.logSelection(periodRows, chosen);

      if (!isOpenStatus(chosen.status)) {
        throw new InvoiceNotFoundIssue(
          `L'index du contrat "${reference}" pour la période débutant en ${formatFrenchDate(startDate)} ` +
          `est à l'état "${chosen.status}" : la déclaration n'est pas possible`,
          chosen.status
        );
      }

      await indexList.openRow(chosen);

      return {
        success: true,
        message: `Index ouvert pour le contrat ${reference}`,
        data: { indexStatus: chosen.status, fromDate: chosen.fromDate }
      };
    } catch (error) {
      if (error instanceof InvoiceNotFoundIssue) {
        throw error;
      }

      throw new StepError({
        stepName,
        stepNumber,
        errorType: 'Erreur de détection de la ligne d\'index',
        message: error instanceof Error ? error.message : 'Erreur inconnue lors de la détection de la ligne d\'index',
        originalError: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private logSelection(periodRows: IndexRow[], chosen: IndexRow): void {
    if (periodRows.length > 1) {
      Logger.warn(`${periodRows.length} lignes sur la période demandée, ligne retenue : ${chosen.fromDate} (${chosen.status})`);
    }
    Logger.action(`Ligne d'index retenue : début ${chosen.fromDate ?? 'inconnu'}, état "${chosen.status}"`);
  }
}

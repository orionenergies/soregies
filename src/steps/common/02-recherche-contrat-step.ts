import { Page } from 'playwright';
import { StepResult } from '../../types';
import { BotConfig } from '../../config';
import { Logger } from '../../utils/logger';
import { StepError, BtaNotFoundIssue } from '../../errors';
import { SoregiesDeclarationConfig } from '../../validation';
import { HomePage } from '../../pages/home-page';
import { IndexListPage } from '../../pages/index-list-page';
import { rowMatchesReference } from '../../utils/index-matcher';

/**
 * Step 2 : recherche du contrat (dossier / PRM) dans « Mes index ».
 * Utilise BtaNotFoundIssue quand le contrat n'est pas trouvé (permet le retry avec un autre profil).
 *
 * Le tableau n'affiche par défaut que les index « Ouverte » et « Contestable » : si aucune ligne du
 * contrat n'y figure, tous les états sont activés avant de conclure que le contrat est introuvable.
 */
export class RechercheContratStep {
  private readonly page: Page;
  private readonly config: BotConfig;
  private readonly declarationConfig: SoregiesDeclarationConfig;
  private readonly producteurIndex: number;
  private readonly totalMatches: number | undefined;

  constructor(
    page: Page,
    config: BotConfig,
    declarationConfig: SoregiesDeclarationConfig,
    producteurIndex: number = 0,
    totalMatches?: number
  ) {
    this.page = page;
    this.config = config;
    this.declarationConfig = declarationConfig;
    this.producteurIndex = producteurIndex;
    this.totalMatches = totalMatches;
  }

  async execute(): Promise<StepResult> {
    const stepNumber = 2;
    const stepName = 'Recherche du contrat';
    const { reference } = this.declarationConfig;

    try {
      Logger.step(stepNumber, stepName);

      const homePage = new HomePage(this.page, this.config);
      await homePage.navigateToIndexList();

      const indexList = new IndexListPage(this.page, this.config);
      await indexList.waitForPage();
      await homePage.closePopups(500);

      await indexList.search(reference);

      let rows = await indexList.readAllRows();
      let contractRows = rows.filter(row => rowMatchesReference(row, reference));
      let allStatesEnabled = false;

      if (contractRows.length === 0) {
        Logger.action('Aucune ligne pour ce contrat avec les filtres par défaut, activation de tous les états');
        await indexList.enableAllStateFilters();
        allStatesEnabled = true;
        rows = await indexList.readAllRows();
        contractRows = rows.filter(row => rowMatchesReference(row, reference));
      }

      if (contractRows.length === 0) {
        throw new BtaNotFoundIssue(
          reference,
          this.producteurIndex,
          `Contrat "${reference}" non trouvé dans « Mes index » (${rows.length} ligne(s) affichée(s) pour cette recherche)`,
          this.totalMatches
        );
      }

      Logger.action(`${contractRows.length} ligne(s) d'index trouvée(s) pour la référence ${reference}`);

      return {
        success: true,
        message: `Index trouvés pour le contrat ${reference}`,
        data: { allStatesEnabled }
      };
    } catch (error) {
      if (error instanceof BtaNotFoundIssue) {
        throw error;
      }

      throw new StepError({
        stepName,
        stepNumber,
        errorType: 'Erreur de recherche du contrat',
        message: error instanceof Error ? error.message : 'Erreur inconnue lors de la recherche du contrat',
        originalError: error instanceof Error ? error : new Error(String(error))
      });
    }
  }
}

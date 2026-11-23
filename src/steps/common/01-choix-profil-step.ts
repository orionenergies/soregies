import { Page } from 'playwright';
import { StepResult } from '../../types';
import { BotConfig } from '../../config';
import { Logger } from '../../utils/logger';
import { StepError } from '../../errors';
import { SoregiesDeclarationConfig } from '../../validation';
import { SOREGIES_ROUTES } from '../../constants';
import { ProfileSelectionPage } from '../../pages/profile-selection-page';
import { HomePage } from '../../pages/home-page';

/**
 * Step 1 : choix du profil producteur (SPV) sur la page « Mes comptes ».
 * Supporte la sélection d'un profil spécifique parmi plusieurs correspondances (retry multi-profils).
 * Si le compte n'a qu'un seul profil, Soregies le sélectionne automatiquement : le step n'a rien à faire.
 */
export class ChoixProfilStep {
  private readonly page: Page;
  private readonly config: BotConfig;
  private readonly declarationConfig: SoregiesDeclarationConfig;
  private readonly producteurIndex: number;

  constructor(
    page: Page,
    config: BotConfig,
    declarationConfig: SoregiesDeclarationConfig,
    producteurIndex: number = 0
  ) {
    this.page = page;
    this.config = config;
    this.declarationConfig = declarationConfig;
    this.producteurIndex = producteurIndex;
  }

  async execute(): Promise<StepResult> {
    const stepNumber = 1;
    const stepName = 'Choix du profil producteur';

    try {
      const { spv } = this.declarationConfig;

      Logger.step(stepNumber, stepName);

      const homePage = new HomePage(this.page, this.config);
      const onProfilesPage = new URL(this.page.url()).pathname.startsWith(SOREGIES_ROUTES.profiles);

      if (!onProfilesPage) {
        Logger.action(`Profil unique sélectionné automatiquement par Soregies (SPV attendu: "${spv}")`);
        await homePage.closePopups();
        return {
          success: true,
          message: 'Profil unique sélectionné automatiquement',
          data: { totalMatches: 1 }
        };
      }

      const profilePage = new ProfileSelectionPage(this.page, this.config);
      await profilePage.waitForSearchForm();
      await profilePage.searchProfile(spv);

      const rows = await profilePage.getProfileRows(spv);
      const totalMatches = await rows.count();

      if (totalMatches === 0) {
        throw new Error(`Aucun profil producteur trouvé pour "${spv}"`);
      }

      if (this.producteurIndex >= totalMatches) {
        throw new Error(
          `Index de profil ${this.producteurIndex} invalide. ` +
          `Seulement ${totalMatches} correspondance(s) trouvée(s) pour "${spv}"`
        );
      }

      await profilePage.selectProfileRow(rows, this.producteurIndex);

      if (totalMatches > 1) {
        Logger.action(`Sélection du profil "${spv}" (${this.producteurIndex + 1}/${totalMatches})`);
      } else {
        Logger.action(`Sélection du profil "${spv}"`);
      }

      await profilePage.waitForHome();
      await homePage.closePopups();

      return {
        success: true,
        message: `Profil "${spv}" sélectionné avec succès`,
        data: { totalMatches }
      };
    } catch (error) {
      throw new StepError({
        stepName,
        stepNumber,
        errorType: 'Erreur de sélection du profil',
        message: error instanceof Error ? error.message : 'Erreur inconnue lors du choix du profil',
        originalError: error instanceof Error ? error : new Error(String(error))
      });
    }
  }
}

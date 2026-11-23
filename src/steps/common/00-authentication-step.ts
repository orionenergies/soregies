import { Page } from 'playwright';
import { StepResult } from '../../types';
import { BotConfig } from '../../config';
import { Logger } from '../../utils/logger';
import { StepError } from '../../errors';
import { LoginPage, PostLoginDestination } from '../../pages/login-page';

/**
 * Step 0 : Authentification au portail Soregies (Mon Espace Producteur)
 * Se connecte avec email / mot de passe (pas de réutilisation de session : les jetons sont en
 * sessionStorage). À la fin de cette étape, on arrive sur la sélection de profil (/profiles)
 * ou directement sur l'accueil (/home) si le compte n'a qu'un seul profil.
 */
export class AuthenticationStep {
  private readonly page: Page;
  private readonly config: BotConfig;

  constructor(page: Page, config: BotConfig) {
    this.page = page;
    this.config = config;
  }

  async execute(): Promise<StepResult & { data: { destination: PostLoginDestination } }> {
    const stepNumber = 0;
    const stepName = 'Authentification au portail Soregies';

    try {
      Logger.step(stepNumber, stepName);

      const loginPage = new LoginPage(this.page, this.config);
      const destination = await loginPage.performLogin(
        this.config.target.credentials.username,
        this.config.target.credentials.password
      );

      if (destination === 'contact-not-found') {
        throw new Error('Aucun profil producteur n\'est associé à ce compte Soregies');
      }

      Logger.auth(`Connexion réussie (destination: ${destination})`);

      return {
        success: true,
        message: destination === 'profiles'
          ? 'Authentification réussie, page de choix du profil chargée'
          : 'Authentification réussie, profil unique sélectionné automatiquement',
        data: { destination }
      };
    } catch (error) {
      throw new StepError({
        stepName,
        stepNumber,
        errorType: 'Erreur d\'authentification',
        message: error instanceof Error ? error.message : 'Erreur inconnue lors de l\'authentification Soregies',
        originalError: error instanceof Error ? error : new Error(String(error))
      });
    }
  }
}

import { Page, Locator } from 'playwright';
import { BotConfig } from '../config';
import { Logger } from '../utils/logger';
import { SOREGIES_ROUTES } from '../constants';

/** Destination atteinte juste après une connexion réussie. */
export type PostLoginDestination = 'profiles' | 'home' | 'contact-not-found';

/**
 * Page Object de la page de connexion Soregies (Mon Espace Producteur).
 *
 * L'application est une SPA Angular : l'authentification passe par l'API IAM (jetons Cognito stockés
 * en sessionStorage). Après connexion, l'application redirige selon le nombre de profils :
 * - 1 profil  → /home (sélection automatique)
 * - >1 profil → /profiles
 * - 0 profil  → pas de redirection explicite (page « contact introuvable »)
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly submitError: Locator;

  private readonly config: BotConfig;

  constructor(page: Page, config: BotConfig) {
    this.page = page;
    this.config = config;
    this.emailInput = page.locator('input#login');
    this.passwordInput = page.locator('input#password');
    this.submitButton = page.locator('#loginBtn');
    this.submitError = page.locator('.submit-error');
  }

  async open(): Promise<void> {
    const { loginUrl } = this.config.target;
    Logger.auth(`Navigation vers ${loginUrl}`);
    await this.page.goto(loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: this.config.timing.pageLoadTimeout
    });
    await this.emailInput.waitFor({ state: 'visible', timeout: this.config.timing.pageLoadTimeout });
  }

  /**
   * Remplit le formulaire de connexion, le soumet et attend la redirection post-connexion.
   * @throws Error si les identifiants sont refusés, si un changement de mot de passe est exigé
   *   ou si aucune redirection n'est observée.
   */
  async performLogin(username: string, password: string): Promise<PostLoginDestination> {
    if (!username || !password) {
      throw new Error('Identifiants Soregies manquants (SOREGIES_USERNAME / SOREGIES_PASSWORD)');
    }

    await this.open();

    await this.emailInput.fill(username);
    await this.passwordInput.fill(password);
    Logger.auth('Identifiants saisis');

    await this.submitButton.waitFor({ state: 'visible', timeout: this.config.timing.elementWaitTimeout });
    await this.submitButton.click();
    Logger.auth('Formulaire de connexion soumis');

    return this.waitForPostLogin();
  }

  /**
   * Attend le résultat de la tentative de connexion : redirection ou message d'erreur.
   */
  private async waitForPostLogin(): Promise<PostLoginDestination> {
    const deadline = Date.now() + this.config.timing.pageLoadTimeout;

    while (Date.now() < deadline) {
      const path = new URL(this.page.url()).pathname;

      if (path.startsWith(SOREGIES_ROUTES.profiles)) return 'profiles';
      if (path.startsWith(SOREGIES_ROUTES.home)) return 'home';
      if (path.startsWith(SOREGIES_ROUTES.contactNotFound)) return 'contact-not-found';
      if (path.startsWith('/reset_password')) {
        throw new Error('Soregies exige un changement de mot de passe avant de pouvoir se connecter');
      }
      if (path.startsWith('/maintenance')) {
        throw new Error('Le portail Soregies est en maintenance');
      }

      const errorText = await this.readVisibleError();
      if (errorText) {
        throw new Error(`Connexion refusée par Soregies : ${errorText}`);
      }

      await this.page.waitForTimeout(250);
    }

    throw new Error('Aucune redirection après la connexion Soregies (délai dépassé)');
  }

  private async readVisibleError(): Promise<string | null> {
    const count = await this.submitError.count();
    for (let i = 0; i < count; i++) {
      const candidate = this.submitError.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        const text = ((await candidate.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (text) return text;
      }
    }
    return null;
  }
}

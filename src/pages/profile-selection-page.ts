import { Page, Locator } from 'playwright';
import { BotConfig } from '../config';
import { Logger } from '../utils/logger';
import { SOREGIES_ROUTES } from '../constants';

/**
 * Page Object de la page « Mes comptes » (/profiles) : sélection du profil producteur.
 *
 * La liste est paginée côté serveur (10 profils par page) et filtrable par nom ou email
 * (champ de recherche validé par la touche Entrée).
 */
export class ProfileSelectionPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly profiles: Locator;
  readonly loader: Locator;

  private readonly config: BotConfig;

  constructor(page: Page, config: BotConfig) {
    this.page = page;
    this.config = config;
    this.searchInput = page.locator('app-profile-selector input[type="text"]').first();
    this.profiles = page.locator('app-profile-selector .profile');
    this.loader = page.locator('app-profile-selector .loader');
  }

  /**
   * Ouvre directement la page de sélection de profil (utilisé pour le retry multi-profils).
   * Les jetons étant en sessionStorage (conservé par l'onglet), la session reste valide.
   */
  async open(): Promise<void> {
    const { baseUrl } = this.config.target;
    await this.page.goto(`${baseUrl}${SOREGIES_ROUTES.profiles}`, {
      waitUntil: 'domcontentloaded',
      timeout: this.config.timing.pageLoadTimeout
    });
  }

  async waitForSearchForm(): Promise<void> {
    await this.searchInput.waitFor({ state: 'visible', timeout: this.config.timing.pageLoadTimeout });
  }

  async searchProfile(spv: string): Promise<void> {
    await this.searchInput.waitFor({ state: 'visible', timeout: this.config.timing.elementWaitTimeout });
    await this.searchInput.fill(spv);
    Logger.action(`Recherche profil "${spv}"`);
    await this.searchInput.press('Enter');
    Logger.action('Lancement de la recherche');
    await this.waitForListLoaded();
  }

  /** Attend la fin du chargement de la liste de profils (loader disparu). */
  async waitForListLoaded(): Promise<void> {
    await this.page.waitForTimeout(300);
    await this.loader.first().waitFor({
      state: 'hidden',
      timeout: this.config.timing.elementWaitTimeout
    }).catch(() => {});
  }

  /**
   * Retourne les profils dont le nom contient le SPV (insensible à la casse).
   * Équivalent de `getProducerRows` côté EDF OA.
   */
  async getProfileRows(spv: string): Promise<Locator> {
    const pattern = new RegExp(escapeRegExp(spv.trim()).replace(/\s+/g, '\\s+'), 'i');
    const rows = this.profiles.filter({ hasText: pattern });

    await rows.first().waitFor({
      state: 'visible',
      timeout: this.config.timing.elementWaitTimeout
    }).catch(async () => {
      await this.page.waitForTimeout(1000);
    });

    const total = await this.profiles.count();
    const matching = await rows.count();
    Logger.action(`Profils filtrés par nom : ${matching}/${total}`);
    for (let i = 0; i < matching; i++) {
      const name = await rows.nth(i).locator('.fullName').first().innerText().catch(() => '');
      Logger.action(`Profil ${i + 1}/${matching}: "${name.trim()}"`);
    }
    return rows;
  }

  async selectProfileRow(rows: Locator, index: number): Promise<void> {
    const selectedRow = rows.nth(index);
    await selectedRow.waitFor({ state: 'visible', timeout: this.config.timing.elementWaitTimeout });
    await selectedRow.click();
  }

  /** Attend l'arrivée sur l'accueil après sélection du profil. */
  async waitForHome(): Promise<void> {
    await this.page.waitForURL(
      (url) => url.pathname.startsWith(SOREGIES_ROUTES.home),
      { timeout: this.config.timing.pageLoadTimeout }
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

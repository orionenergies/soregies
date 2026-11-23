import { Page, Locator } from 'playwright';
import { BotConfig } from '../config';
import { Logger } from '../utils/logger';
import { SOREGIES_ROUTES } from '../constants';

/** Message de la boîte de confirmation de saisie : elle ne doit jamais être fermée par `closePopups`. */
const CONFIRMATION_MESSAGE_REGEX = /valider votre nouvelle production/i;

/** Libellés des boutons uniques de fenêtres purement informatives (aucune modification de données). */
const INFORMATION_ONLY_BUTTON_REGEX = /prise? connaissance|^fermer$|^ok$/i;

/**
 * Page Object de l'espace connecté (/home) : menu de navigation et fenêtres d'information.
 */
export class HomePage {
  readonly page: Page;
  readonly indexMenuButton: Locator;
  readonly dialogs: Locator;

  private readonly config: BotConfig;

  constructor(page: Page, config: BotConfig) {
    this.page = page;
    this.config = config;
    this.indexMenuButton = page.locator('li#menu-index-button').first();
    this.dialogs = page.locator('app-dialog [role="dialog"]');
  }

  /**
   * Ferme les fenêtres d'information éventuelles (consentement, changement d'email, activation tardive…)
   * en cliquant sur leur bouton d'annulation (« Ignorer » / « Annuler »).
   *
   * Ne clique jamais sur « Accepter » (qui modifierait le consentement du producteur) et ne touche pas
   * à la boîte de confirmation de saisie de production.
   */
  async closePopups(settleMs: number = 1500): Promise<void> {
    await this.page.waitForTimeout(settleMs);

    for (let attempt = 0; attempt < 4; attempt++) {
      const dialog = this.dialogs.first();
      const visible = await dialog.isVisible().catch(() => false);
      if (!visible) return;

      const text = ((await dialog.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (CONFIRMATION_MESSAGE_REGEX.test(text)) return;

      const title = ((await dialog.locator('#dialog-title').first().textContent().catch(() => '')) || '').trim();
      const cancelButton = dialog.locator('.btn-cancel').first();

      if (await cancelButton.isVisible().catch(() => false)) {
        Logger.action(`Fermeture de la fenêtre d'information "${title || text.slice(0, 60)}"`);
        await cancelButton.click();
        await this.page.waitForTimeout(500);
        continue;
      }

      // Fenêtre purement informative (un seul bouton « J'ai pris connaissance » / « Fermer »)
      const confirmButton = dialog.locator('.btn-confirm').first();
      const confirmText = ((await confirmButton.textContent().catch(() => '')) || '').trim();
      if (INFORMATION_ONLY_BUTTON_REGEX.test(confirmText)) {
        Logger.action(`Fermeture de la fenêtre d'information "${title || text.slice(0, 60)}" (${confirmText})`);
        await confirmButton.click();
        await this.page.waitForTimeout(500);
        continue;
      }

      Logger.warn(`Fenêtre non fermable détectée (aucun bouton d'annulation): "${text.slice(0, 80)}"`);
      return;
    }
  }

  /**
   * Ouvre la page « Mes index » via le menu (repli : navigation directe).
   */
  async navigateToIndexList(): Promise<void> {
    const clicked = await this.indexMenuButton
      .click({ timeout: this.config.timing.elementWaitTimeout })
      .then(() => true)
      .catch(() => false);

    if (!clicked) {
      Logger.warn('Menu « Mes index » indisponible, navigation directe');
      await this.page.goto(`${this.config.target.baseUrl}${SOREGIES_ROUTES.index}`, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timing.pageLoadTimeout
      });
    }

    await this.page.waitForURL(
      (url) => url.pathname.startsWith(SOREGIES_ROUTES.index),
      { timeout: this.config.timing.pageLoadTimeout }
    );
  }
}

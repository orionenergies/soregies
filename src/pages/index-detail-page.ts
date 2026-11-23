import { Page, Locator } from 'playwright';
import { BotConfig } from '../config';
import { Logger } from '../utils/logger';

/** Résultat de la soumission du formulaire de déclaration de production. */
export type SubmissionOutcome =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

/**
 * Page Object du détail d'un index (/home/index/:id) et de son formulaire « Saisir ma production ».
 *
 * Le formulaire expose : une date de relevé, le nouvel index (cumul du compteur) et la production
 * (dernier champ). Saisir la production met à jour le nouvel index (ancien index + production). Une boîte de dialogue demande ensuite de confirmer la saisie.
 */
export class IndexDetailPage {
  readonly page: Page;
  readonly oldIndexValue: Locator;
  readonly form: Locator;
  readonly dateInput: Locator;
  readonly newIndexInput: Locator;
  readonly productionField: Locator;
  readonly productionInputs: Locator;
  readonly submitButton: Locator;
  readonly confirmDialog: Locator;
  readonly successAlert: Locator;
  readonly errorAlert: Locator;

  private readonly config: BotConfig;

  constructor(page: Page, config: BotConfig) {
    this.page = page;
    this.config = config;
    this.oldIndexValue = page.locator('app-main-information#oldIndexValue .value').first();
    this.form = page.locator('app-new-index-event form');
    this.dateInput = page.locator('app-new-index-event input.date-picker__input[type="date"]').first();
    this.newIndexInput = page.locator('app-new-index-event input#newIndex');
    this.productionField = page
      .locator('app-new-index-event .form-field')
      .filter({ hasText: /\(kWh\)/ })
      .locator('.field-control input[type="number"]:not([readonly]):not([disabled])')
      .last();
    this.productionInputs = page
      .locator('app-new-index-event .form-field')
      .filter({ hasText: /\(kWh\)/ })
      .locator('input[type="number"]');
    this.submitButton = page.locator('#newIndexEventBtn');
    this.confirmDialog = page
      .locator('app-dialog [role="dialog"]')
      .filter({ hasText: /valider votre nouvelle production/i });
    this.successAlert = page.locator('app-alert .alert-container.alert-success .alert-message');
    this.errorAlert = page.locator('app-alert .alert-container.alert-danger .alert-message');
  }

  /** Attend l'affichage du détail (ancien index chargé). */
  async waitForDetails(): Promise<void> {
    await this.oldIndexValue.waitFor({ state: 'visible', timeout: this.config.timing.pageLoadTimeout });
  }

  /** Indique si le formulaire de saisie est affiché (ligne « Ouverte »). */
  async isFormVisible(timeoutMs: number = this.config.timing.formWaitTimeout): Promise<boolean> {
    return this.form.first().waitFor({ state: 'visible', timeout: timeoutMs }).then(() => true).catch(() => false);
  }

  /**
   * Lit l'ancien index affiché (somme des deux dossiers en cas d'index lié).
   * Retourne null si la valeur n'est pas lisible.
   */
  async readOldIndex(): Promise<number | null> {
    const raw = ((await this.oldIndexValue.textContent().catch(() => '')) || '');
    return parseLocalizedNumber(raw);
  }

  /** Renseigne la date de relevé (format ISO YYYY-MM-DD). */
  async fillStatementDate(isoDate: string): Promise<void> {
    await this.dateInput.waitFor({ state: 'visible', timeout: this.config.timing.elementWaitTimeout });
    await this.dateInput.fill(isoDate);
    await this.dateInput.blur();
  }

  async readStatementDate(): Promise<string> {
    return this.dateInput.inputValue().catch(() => '');
  }

  /**
   * Renseigne la production (kWh) dans le dernier champ `field-control` éditable du formulaire
   * (en cas d'index lié, les champs de production secondaires sont en lecture seule).
   * Soregies en déduit le nouvel index (ancien index + production).
   */
  async fillProduction(value: number): Promise<void> {
    await this.productionField.waitFor({ state: 'visible', timeout: this.config.timing.elementWaitTimeout });
    await this.productionField.fill(value.toString());
    await this.productionField.blur();
    await this.page.waitForTimeout(500);
  }

  /**
   * Indique si la production est saisissable (champ éditable) ; elle est en lecture seule pour des
   * dossiers liés. Attend d'abord l'affichage des champs de production pour ne pas confondre un
   * chargement lent avec un champ en lecture seule.
   */
  async isProductionEditable(): Promise<boolean> {
    await this.productionInputs.first().waitFor({
      state: 'visible',
      timeout: this.config.timing.formWaitTimeout
    });
    await this.page.waitForTimeout(300);
    return (await this.productionField.count()) > 0;
  }

  /** Renseigne le nouvel index (cumul du compteur) ; la production est alors recalculée par Soregies. */
  async fillNewIndex(value: number): Promise<void> {
    await this.newIndexInput.waitFor({ state: 'visible', timeout: this.config.timing.elementWaitTimeout });
    await this.newIndexInput.fill(value.toString());
    await this.newIndexInput.blur();
    await this.page.waitForTimeout(500);
  }

  /** Nouvel index calculé par Soregies après saisie de la production (null si illisible). */
  async readNewIndex(): Promise<number | null> {
    const raw = await this.newIndexInput.inputValue().catch(() => '');
    return parseLocalizedNumber(raw);
  }

  /** Somme des champs « Énergie produite » (kWh), recalculés par l'application. */
  async readProductionTotal(): Promise<number> {
    const count = await this.productionInputs.count();
    let total = 0;
    for (let i = 0; i < count; i++) {
      const raw = await this.productionInputs.nth(i).inputValue().catch(() => '');
      const value = parseLocalizedNumber(raw);
      if (value !== null) total += value;
    }
    return total;
  }

  async isSubmitEnabled(): Promise<boolean> {
    return this.submitButton.isEnabled().catch(() => false);
  }

  /** Messages d'erreur de validation affichés sous les champs du formulaire. */
  async readFieldErrors(): Promise<string[]> {
    const errors = this.page.locator('app-new-index-event app-custom-error');
    const count = await errors.count();
    const messages: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = ((await errors.nth(i).textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (text) messages.push(text);
    }
    return messages;
  }

  /**
   * Clique sur « Valider la production » puis confirme la boîte de dialogue, et attend le résultat :
   * - succès : redirection vers /home/index ou alerte verte « Saisie de production effectuée »
   * - échec  : alerte rouge (message `flash` de l'API ou erreur par défaut)
   */
  async submitAndConfirm(): Promise<SubmissionOutcome> {
    await this.submitButton.click();
    Logger.action('Clic sur "Valider la production"');

    await this.confirmDialog.first().waitFor({ state: 'visible', timeout: this.config.timing.elementWaitTimeout });
    const confirmButton = this.confirmDialog.first().locator('.btn-confirm');
    await confirmButton.click();
    Logger.action('Confirmation de la saisie ("Valider la production")');

    return this.waitForOutcome();
  }

  private async waitForOutcome(): Promise<SubmissionOutcome> {
    const deadline = Date.now() + this.config.timing.pageLoadTimeout;

    while (Date.now() < deadline) {
      const errorText = await this.firstVisibleText(this.errorAlert);
      if (errorText) return { kind: 'error', message: errorText };

      const successText = await this.firstVisibleText(this.successAlert);
      if (successText) return { kind: 'success', message: successText };

      // L'application navigue vers la liste après une saisie réussie ; l'alerte peut être éphémère.
      if (/\/home\/index\/?$/.test(new URL(this.page.url()).pathname)) {
        return { kind: 'success', message: 'Déclaration de production effectuée' };
      }

      await this.page.waitForTimeout(250);
    }

    throw new Error('Aucune réponse de Soregies après la confirmation de la saisie (délai dépassé)');
  }

  private async firstVisibleText(locator: Locator): Promise<string | null> {
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const candidate = locator.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        const text = ((await candidate.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (text) return text;
      }
    }
    return null;
  }
}

/**
 * Convertit un nombre au format français ("12 345,5 kWh") en number.
 * Retourne null si aucune valeur numérique n'est présente.
 */
export function parseLocalizedNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/[\u00a0\u202f\s]/g, '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const value = Number(cleaned);
  return Number.isNaN(value) ? null : value;
}

import { Page, Locator } from 'playwright';
import { BotConfig } from '../config';
import { Logger } from '../utils/logger';
import { IndexRow } from '../types';

/**
 * Page Object de la page « Mes index » (/home/index).
 *
 * Le tableau `#index-table` liste les relevés d'index à saisir. Il est paginé côté serveur (10 lignes
 * par page), filtrable par état de saisie (Ouverte, Fermée, Interdite, Contestable) et par recherche
 * texte (Dossier, Contrat, Titulaire).
 */
export class IndexListPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly table: Locator;
  readonly rows: Locator;
  readonly filterButton: Locator;
  readonly nextPageButton: Locator;

  private readonly config: BotConfig;

  constructor(page: Page, config: BotConfig) {
    this.page = page;
    this.config = config;
    this.searchInput = page.locator('app-index .search-field input[type="text"]').first();
    this.table = page.locator('table#index-table');
    this.rows = page.locator('table#index-table tbody tr').filter({ has: page.locator('td#contractLineId') });
    this.filterButton = page.locator('app-index app-filter button.stroked-button').first();
    this.nextPageButton = page.locator('app-paginator ul.paginator > li:last-child > button.select-page-btn').first();
  }

  async waitForPage(): Promise<void> {
    await this.searchInput.waitFor({ state: 'visible', timeout: this.config.timing.pageLoadTimeout });
    await this.table.waitFor({ state: 'attached', timeout: this.config.timing.pageLoadTimeout });
    await this.waitForTableLoaded();
  }

  /** Attend la fin du chargement du tableau (classe `loading` retirée). */
  async waitForTableLoaded(): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const table = document.querySelector('table#index-table');
        return !!table && !table.classList.contains('loading');
      },
      undefined,
      { timeout: this.config.timing.pageLoadTimeout }
    );
    await this.page.waitForTimeout(200);
  }

  /** Lance une recherche texte (Dossier, Contrat, Titulaire) et attend le rechargement. */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    Logger.action(`Recherche index "${term}"`);
    await this.searchInput.press('Enter');
    // Laisse l'application démarrer la requête avant de surveiller la fin du chargement
    await this.page.waitForTimeout(400);
    await this.waitForTableLoaded();
  }

  /**
   * Active tous les filtres d'état (Ouverte, Fermée, Interdite, Contestable) afin de voir toutes les
   * lignes d'un contrat — utile pour diagnostiquer l'état d'une période non saisissable.
   */
  async enableAllStateFilters(): Promise<void> {
    await this.filterButton.click();

    const items = this.page.locator('.filter-item');
    await items.first().waitFor({ state: 'visible', timeout: this.config.timing.elementWaitTimeout });

    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const checkbox = item.locator('input[type="checkbox"]').first();
      const isChecked = await checkbox.isChecked().catch(() => true);
      if (!isChecked) {
        const label = ((await item.textContent().catch(() => '')) || '').trim();
        Logger.action(`Activation du filtre "${label}"`);
        await item.click();
        await this.page.waitForTimeout(300);
      }
    }

    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.mouse.click(5, 5).catch(() => {});
    await this.page.waitForTimeout(400);
    await this.waitForTableLoaded();
  }

  /** Lit les lignes actuellement affichées. */
  async readRows(pageIndex: number = 0): Promise<IndexRow[]> {
    await this.waitForTableLoaded();

    const rows = await this.rows.evaluateAll((trs) => {
      const cellText = (tr: Element, id: string): string => {
        const td = tr.querySelector(`td#${id}`);
        if (!td) return '';
        const value = td.querySelector('.responsive-cell-value') ?? td;
        return (value.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      };

      const toIsoDate = (raw: string): string | null => {
        const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
      };

      return trs.map((tr, position) => ({
        contractLineId: cellText(tr, 'contractLineId'),
        mptCode: cellText(tr, 'mptCode'),
        fromDate: toIsoDate(cellText(tr, 'fromDate')),
        status: cellText(tr, 'saisie'),
        position
      }));
    });

    return rows.map(row => ({ ...row, pageIndex }));
  }

  /**
   * Lit les lignes de toutes les pages du tableau (10 lignes par page, bornées à `maxPages`)
   * puis revient sur la première page.
   */
  async readAllRows(maxPages: number = 10): Promise<IndexRow[]> {
    const all: IndexRow[] = [];
    let pageIndex = 0;

    all.push(...await this.readRows(pageIndex));
    while (pageIndex + 1 < maxPages && await this.goToNextPage()) {
      pageIndex++;
      all.push(...await this.readRows(pageIndex));
    }

    if (pageIndex > 0) await this.goToFirstPage();
    return all;
  }

  /** Passe à la page suivante du tableau. Retourne false s'il n'y en a pas. */
  async goToNextPage(): Promise<boolean> {
    const exists = (await this.nextPageButton.count()) > 0;
    if (!exists) return false;
    if (await this.nextPageButton.isDisabled().catch(() => true)) return false;

    await this.nextPageButton.click();
    await this.page.waitForTimeout(400);
    await this.waitForTableLoaded();
    return true;
  }

  /** Retourne à la première page du tableau (bouton « page 1 » du paginateur). */
  async goToFirstPage(): Promise<void> {
    const firstPageButton = this.page.locator('app-paginator ul.paginator > li > button.select-page-btn', { hasText: /^\s*1\s*$/ }).first();
    if ((await firstPageButton.count()) === 0) return;
    await firstPageButton.click().catch(() => {});
    await this.page.waitForTimeout(400);
    await this.waitForTableLoaded();
  }

  /** Ouvre le détail d'une ligne (clic sur la cellule « Date début »). */
  async openRow(target: Pick<IndexRow, 'position' | 'pageIndex'>): Promise<void> {
    for (let i = 0; i < target.pageIndex; i++) {
      const moved = await this.goToNextPage();
      if (!moved) throw new Error(`Page ${target.pageIndex + 1} du tableau « Mes index » introuvable`);
    }

    const row = this.rows.nth(target.position);
    await row.waitFor({ state: 'visible', timeout: this.config.timing.elementWaitTimeout });
    await row.locator('td#fromDate').click();
    await this.page.waitForURL(
      (url) => /\/home\/index\/[^/]+/.test(url.pathname),
      { timeout: this.config.timing.pageLoadTimeout }
    );
  }
}

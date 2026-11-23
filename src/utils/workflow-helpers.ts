/**
 * Helpers pour le workflow du bot Soregies
 * Contient les fonctions de logique métier complexe extraites de l'orchestrateur
 */

import { Page } from 'playwright';
import { BotConfig } from '../config';
import { SoregiesDeclarationConfig } from '../validation';
import { BtaNotFoundIssue } from '../errors';
import { Logger } from './logger';
import { BrowserManager } from './browser-manager';
import { trackAction } from './action-tracker';
import { ChoixProfilStep, RechercheContratStep } from '../steps/common';
import { ProfileSelectionPage } from '../pages/profile-selection-page';

/**
 * Décide si un échec de recherche de contrat doit déclencher un essai sur le profil suivant.
 * Exporté pour tests unitaires.
 */
export function resolveProducerRetry(
  error: unknown,
  producteurIndex: number,
  totalMatches: number
): { shouldRetry: boolean; totalMatches: number } {
  if (!(error instanceof BtaNotFoundIssue)) {
    return { shouldRetry: false, totalMatches };
  }

  const matches =
    typeof error.totalMatches === 'number' && error.totalMatches > 0
      ? error.totalMatches
      : totalMatches;

  return {
    shouldRetry: producteurIndex + 1 < matches,
    totalMatches: matches
  };
}

/**
 * Sélection du profil producteur et recherche du contrat avec retry
 * Si plusieurs profils correspondent au SPV, essaie chaque profil jusqu'à trouver le contrat.
 *
 * @param page Page Playwright
 * @param browserManager Gestionnaire du navigateur
 * @param config Configuration du bot
 * @param declarationConfig Configuration de la déclaration Soregies
 */
export async function selectProfileAndFindContract(
  page: Page,
  browserManager: BrowserManager,
  config: BotConfig,
  declarationConfig: SoregiesDeclarationConfig
): Promise<void> {
  let producteurIndex = 0;
  let totalMatches = 1;
  let contractFound = false;

  while (!contractFound && producteurIndex < totalMatches) {
    try {
      const step1Result = await trackAction(
        browserManager,
        `Sélection du profil ${producteurIndex + 1}`,
        async () => {
          const choixProfilStep = new ChoixProfilStep(
            page,
            config,
            declarationConfig,
            producteurIndex
          );
          return await choixProfilStep.execute();
        }
      );

      totalMatches = (step1Result.data?.['totalMatches'] as number) || 1;

      await trackAction(
        browserManager,
        `Recherche du contrat pour le profil ${producteurIndex + 1}`,
        async () => {
          const rechercheContratStep = new RechercheContratStep(
            page,
            config,
            declarationConfig,
            producteurIndex,
            totalMatches
          );
          await rechercheContratStep.execute();
        }
      );

      contractFound = true;
    } catch (error) {
      const retry = resolveProducerRetry(error, producteurIndex, totalMatches);
      totalMatches = retry.totalMatches;

      if (retry.shouldRetry) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.warn(
          `Contrat "${declarationConfig.reference}" non trouvé pour le profil ${producteurIndex + 1}/${totalMatches}` +
          (message ? ` (${message})` : '') +
          `, essai du profil suivant...`
        );

        await new ProfileSelectionPage(page, config).open();
        producteurIndex++;
        continue;
      }

      throw error;
    }
  }
}

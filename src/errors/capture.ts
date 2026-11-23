/**
 * Capture des éléments de debugging en cas d'erreur
 *
 * Ce fichier contient la fonction de capture du screenshot lors d'une erreur,
 * pour faciliter le debugging.
 */

import { Page } from 'playwright';
import { BotConfig } from '../config';
import { Logger } from '../utils/logger';

/**
 * Capture une capture d'écran en cas d'erreur
 * En mode local : sauvegarde dans un fichier (mais ne retourne pas le chemin)
 * En mode production : retourne le screenshot en base64
 * @param page Page Playwright (peut être null)
 * @param config Configuration du bot
 * @param isLocalMode true si en mode local, false si en production
 * @param timestamp Timestamp utilisé pour nommer le fichier en mode local
 * @returns Objet avec base64 (mode production uniquement)
 */
export async function captureErrorScreenshot(
  page: Page | null,
  config: BotConfig,
  isLocalMode: boolean,
  timestamp: number
): Promise<{ base64?: string }> {
  if (!config.automation.screenshotOnError || !page) {
    return {};
  }

  try {
    // Vérifier que la page n'est pas fermée ou en navigation
    if (page.isClosed()) {
      Logger.warn('⚠️ Page fermée, impossible de capturer le screenshot');
      return {};
    }

    // Attendre que la page soit chargée avant de capturer (important pour PlatformError)
    // Utiliser un timeout court pour ne pas bloquer trop longtemps
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 });
    } catch {
      // Si le timeout est atteint, continuer quand même (la page peut être déjà chargée)
    }

    // Attendre un peu pour que la page soit stable (éviter les captures pendant les animations)
    try {
      await page.waitForTimeout(500);
    } catch {
      // Ignorer si la page est fermée entre temps
    }

    // Vérifier à nouveau que la page n'est pas fermée avant de capturer
    if (page.isClosed()) {
      Logger.warn('⚠️ Page fermée pendant l\'attente, impossible de capturer le screenshot');
      return {};
    }

    // Options de screenshot avec timeout explicite plus long (60 secondes)
    const screenshotOptions = {
      fullPage: true,
      timeout: 60000 // 60 secondes au lieu du défaut de 30
    };

    if (isLocalMode) {
      // Mode local : sauvegarder dans un fichier (mais ne pas retourner le chemin)
      const path = await import('path');
      const fs = await import('fs/promises');

      // S'assurer que le dossier existe
      await fs.mkdir(config.paths.screenshots, { recursive: true });

      const screenshotPath = path.join(
        config.paths.screenshots,
        `error-${timestamp}.png`
      );
      await page.screenshot({ ...screenshotOptions, path: screenshotPath });
      return {};
    } else {
      // Mode production : retourner en base64
      const screenshotBuffer = await page.screenshot(screenshotOptions);
      const screenshotBase64 = screenshotBuffer.toString('base64');
      return { base64: screenshotBase64 };
    }
  } catch (error) {
    // Logger l'erreur mais ne pas faire échouer le processus d'erreur
    Logger.warn(`⚠️ Erreur lors de la capture du screenshot: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

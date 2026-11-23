/**
 * Configuration centralisée du bot Soregies
 * Gère les types, defaults, chargement et validation de la configuration
 */
import dotenv from 'dotenv';
import { TARGET_CONFIG, BROWSER_CONFIG, TIMING_CONFIG, SERVER_CONFIG as SERVER_CONSTANTS, PATHS_CONFIG, AUTOMATION_CONFIG } from './constants';
import { BotConfig } from './types/config';

dotenv.config();

// Re-export type pour compatibilité
export type { BotConfig } from './types/config';

/** Configuration serveur (depuis env, avec fallback sur constants) */
export const SERVER_CONFIG = {
  port: parseInt(process.env['PORT'] || SERVER_CONSTANTS.defaultPort.toString(), 10),
  nodeEnv: (process.env['NODE_ENV'] || 'development') as 'development' | 'production',
  apiKey: process.env['API_KEY'] || ''
} as const;

// ============================================================================
// CHARGEMENT DE LA CONFIGURATION CIBLE
// ============================================================================

function loadTargetConfig() {
  return {
    baseUrl: process.env['TARGET_BASE_URL'] || TARGET_CONFIG.baseUrl,
    loginUrl: process.env['TARGET_LOGIN_URL'] || TARGET_CONFIG.loginUrl,
    credentials: {
      username: process.env['SOREGIES_USERNAME'] || '',
      password: process.env['SOREGIES_PASSWORD'] || ''
    }
  };
}

// ============================================================================
// CONSTRUCTION DE LA CONFIGURATION
// ============================================================================

/** Détecte si on est en mode production */
const isProduction = () => process.env['NODE_ENV'] === 'production';

/**
 * Construit la configuration du bot en fonction de l'environnement
 * - Production : headless=true, slowMo=0, keepBrowserOpen=false
 * - Local/Test : headless=false, slowMo=200, keepBrowserOpen=true
 */
export function buildConfig(debugMode: boolean, submit: boolean): BotConfig {
  const prod = isProduction();

  return {
    browser: {
      headless: prod,
      slowMo: prod ? TIMING_CONFIG.slowMoProduction : TIMING_CONFIG.slowMoLocal,
      timeout: TIMING_CONFIG.browserTimeout,
      viewport: prod ? BROWSER_CONFIG.viewportProduction : BROWSER_CONFIG.viewportLocal,
      userAgent: BROWSER_CONFIG.userAgent
    },
    target: loadTargetConfig(),
    automation: {
      debugMode,
      finalSubmission: submit,
      keepBrowserOpen: !prod,
      screenshotOnError: AUTOMATION_CONFIG.screenshotOnError
    },
    paths: {
      screenshots: PATHS_CONFIG.screenshots,
      logs: PATHS_CONFIG.logs
    },
    timing: {
      pageLoadTimeout: TIMING_CONFIG.pageLoadTimeout,
      elementWaitTimeout: TIMING_CONFIG.elementWaitTimeout,
      betweenActionsDelay: TIMING_CONFIG.betweenActionsDelay
    }
  };
}

// ============================================================================
// VALIDATION DE LA CONFIGURATION
// ============================================================================

/**
 * Valide la configuration et affiche les avertissements
 */
export function validateConfig(config: BotConfig): void {
  const warnings: string[] = [];

  if (!config.target.credentials.username) warnings.push('SOREGIES_USERNAME is not set');
  if (!config.target.credentials.password) warnings.push('SOREGIES_PASSWORD is not set');
  if (!SERVER_CONFIG.apiKey) warnings.push('API_KEY is not set - API will be unprotected!');

  if (warnings.length > 0) {
    console.warn('⚠️  Configuration warnings:');
    warnings.forEach(w => console.warn(`   - ${w}`));
  }

  if (config.automation.debugMode) {
    console.log('🔧 Configuration:');
    console.log(`   - Headless: ${config.browser.headless}`);
    console.log(`   - Debug Mode: ${config.automation.debugMode}`);
    console.log(`   - Submit: ${config.automation.finalSubmission}`);
  }
}

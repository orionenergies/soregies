/**
 * Types de configuration pour le bot Soregies
 * Définit la structure de configuration du bot
 *
 * L'implémentation de la configuration se trouve dans src/config.ts
 */

export interface BotConfig {
  browser: {
    headless: boolean;
    slowMo: number;
    timeout: number;
    viewport: { width: number; height: number };
    userAgent: string;
  };
  target: {
    baseUrl: string;
    loginUrl: string;
    credentials: { username: string; password: string };
  };
  automation: {
    debugMode: boolean;
    finalSubmission: boolean;
    keepBrowserOpen: boolean;
    screenshotOnError: boolean;
  };
  paths: {
    screenshots: string;
    logs: string;
  };
  timing: {
    pageLoadTimeout: number;
    elementWaitTimeout: number;
    betweenActionsDelay: number;
  };
}

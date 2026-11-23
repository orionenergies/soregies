import { defineConfig, devices } from '@playwright/test';
import { TARGET_CONFIG } from './src/constants';

// Load base URL from constants or environment variable
const baseUrl = process.env['TARGET_BASE_URL'] || TARGET_CONFIG.baseUrl;

/**
 * Configuration Playwright optimisée pour bot d'automatisation
 * 
 * Différences avec config standard de tests:
 * - fullyParallel: false (bot séquentiel)
 * - workers: 1 (éviter conflits)
 * - retries: important pour robustesse
 * - timeouts plus longs pour latence réseau
 */
export default defineConfig({
  testDir: './tests',
  
  // Bot séquentiel, pas de parallélisation
  fullyParallel: false,
  
  // Fail build on CI if test.only is present
  forbidOnly: !!process.env.CI,
  
  // Retry important pour robustesse du bot
  retries: process.env.CI ? 2 : 1,
  
  // Un seul worker pour éviter conflits
  workers: 1,
  
  // Reporter adapté pour bot
  reporter: [
    ['html'],
    ['json', { outputFile: 'bot-results.json' }],
    ['line']
  ],
  
  // Timeout plus long pour bot (gestion latence réseau)
  timeout: 60000,
  
  // Timeout pour assertions
  expect: {
    timeout: 10000,
  },
  
  use: {
    // Base URL du site cible (depuis project.config.json ou variable d'environnement)
    baseURL: baseUrl,
    
    // Headless configurable via variable d'environnement
    headless: process.env.HEADLESS !== 'false',
    
    // Viewport standard desktop
    viewport: { width: 1920, height: 1080 },
    
    // Tracing et debugging
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Localisation française
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    
    // Timeouts spécifiques pour bot
    actionTimeout: 60000,
    navigationTimeout: 60000,
  },
  
  projects: [
    {
      name: 'bot-chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Configuration spécifique pour bot
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
          ]
        }
      },
    },
    // Optionnel: projet pour bot mobile
    {
      name: 'bot-mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        launchOptions: {
          args: ['--no-sandbox', '--disable-dev-shm-usage']
        }
      },
    },
  ],
});


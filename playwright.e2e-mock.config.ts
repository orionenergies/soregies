import { defineConfig } from '@playwright/test';

/**
 * Configuration des tests de bout en bout avec API Soregies simulée.
 * L'application Angular réelle est chargée depuis le site ; seules les requêtes d'API sont interceptées.
 */
export default defineConfig({
  testDir: './tests/e2e-mock',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240000,
  reporter: [['line']],
});

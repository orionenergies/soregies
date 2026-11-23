/**
 * Constantes centralisées du bot Soregies - Déclaration de production (déclaration de production)
 * Rassemble toutes les valeurs constantes du projet (timing, URLs, configuration GCP, etc.)
 */

// ============================================================================
// CONFIGURATION DU PROJET
// ============================================================================

export const PROJECT_CONFIG = {
  name: 'orion-bot-soregies',
  description: 'Orion automation bot for Soregies (Mon Espace Producteur) using Playwright and Express'
} as const;

/** Identifiants utilisés pour la génération du runId. */
export const RUN_ID_CONFIG = {
  source: 'bot',
  shortId: 'soregies',
} as const;

// ============================================================================
// CONFIGURATION GCP (Google Cloud Platform)
// ============================================================================

export const GCP_CONFIG = {
  projectId: 'orion-bots',
  region: 'europe-west1',
  repository: 'orion-bot-images',
  serviceName: 'orion-bot-soregies'
} as const;

// ============================================================================
// CONFIGURATION TARGET (URLs du site Soregies)
// ============================================================================

export const TARGET_CONFIG = {
  baseUrl: 'https://mon-espace-producteur.soregies.fr',
  loginUrl: 'https://mon-espace-producteur.soregies.fr/'
} as const;

// ============================================================================
// TIMING & TIMEOUTS
// ============================================================================

export const TIMING_CONFIG = {
  /** Timeout pour le lancement du navigateur (ms) */
  browserTimeout: 45000,
  /** Timeout pour le chargement des pages (ms) */
  pageLoadTimeout: 45000,
  /** Timeout pour l'attente d'éléments (ms) */
  elementWaitTimeout: 20000,
  /** Timeout pour l'affichage du formulaire de déclaration et de ses champs de production (ms) */
  formWaitTimeout: 10000,
  /** Délai entre les actions (ms) */
  betweenActionsDelay: 1000,
  /** Slow motion pour le mode local (ms) */
  slowMoLocal: 800,
  /** Slow motion pour le mode production (ms) */
  slowMoProduction: 100,
  /** Timeout global pour l'exécution complète du bot (ms) - 290 secondes */
  botExecutionTimeout: 290000
} as const;

// ============================================================================
// NAVIGATEUR
// ============================================================================

export const BROWSER_CONFIG = {
  /** User Agent utilisé par le navigateur */
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  /** Viewport en production (width x height) */
  viewportProduction: { width: 1366, height: 768 },
  /** Viewport en local (0x0 = taille par défaut) */
  viewportLocal: { width: 0, height: 0 }
} as const;

// ============================================================================
// CHEMINS (PATHS)
// ============================================================================

import path from 'path';

export const PATHS_CONFIG = {
  /** Dossier pour les screenshots d'erreur */
  screenshots: path.resolve(process.cwd(), 'screenshots'),
  /** Dossier pour les PDFs téléchargés */
  downloads: path.resolve(process.cwd(), 'downloads'),
  /** Dossier pour les logs (production) */
  logs: '/tmp'
} as const;

// ============================================================================
// SERVEUR
// ============================================================================

export const SERVER_CONFIG = {
  /** Port par défaut du serveur */
  defaultPort: 3000,
  /** Host par défaut */
  defaultHost: '0.0.0.0'
} as const;

// ============================================================================
// AUTOMATION
// ============================================================================

export const AUTOMATION_CONFIG = {
  /** Activer les screenshots en cas d'erreur */
  screenshotOnError: true
} as const;

// ============================================================================
// RÈGLES MÉTIER
// ============================================================================

export const BUSINESS_RULES = {
  /** Tolérance absolue acceptée pour la vérification de quantité au récapitulatif (en kWh) */
  recapQuantityToleranceKwh: 10, // ±10 kWh de tolérance par défaut
  /** Production minimale acceptée par Soregies pour une déclaration de production (kWh) */
  minProductionKwh: 1
} as const;

// ============================================================================
// SOREGIES - Routes de l'application Angular (Mon Espace Producteur)
// ============================================================================

export const SOREGIES_ROUTES = {
  profiles: '/profiles',
  home: '/home',
  index: '/home/index',
  contactNotFound: '/contact-not-found-page'
} as const;


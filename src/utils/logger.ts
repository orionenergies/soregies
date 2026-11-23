import { StepError } from '../errors';
import { LogEntry } from '../types/utils';

// Re-export type pour compatibilité
export type { LogEntry } from '../types/utils';

/**
 * Système de logging centralisé avec deux niveaux d'affichage console
 * - High-level (debugMode=false) : logs minimaux en console, seulement les steps et les erreurs
 * - Détaillé (debugMode=true) : logs complets en console avec sous-étapes et succès de champs
 *
 * IMPORTANT :
 * - Tous les logs sont TOUJOURS enregistrés dans le tableau interne (pour le PDF en cas d'erreur)
 * - L'affichage console dépend de debugMode pour certains logs (action, fieldSuccess, subStep, info)
 * - Les logs critiques (start, auth, step, error, warn, infoAlways, end) sont TOUJOURS affichés en console
 *
 * Cela permet d'avoir tous les logs dans le PDF même si certains ne sont pas affichés en console
 */

export class Logger {
  private static debugMode: boolean = false;
  private static logs: LogEntry[] = [];

  /**
   * Initialise le logger avec le mode debug
   */
  static init(debugMode: boolean): void {
    Logger.debugMode = debugMode;
    Logger.logs = []; // Réinitialiser les logs à chaque nouvelle exécution
  }

  /**
   * Récupère tous les logs collectés depuis le début de l'exécution
   * @returns Tableau de tous les logs
   */
  static getLogs(): LogEntry[] {
    return [...Logger.logs]; // Retourner une copie pour éviter les modifications externes
  }

  /**
   * Méthode centrale pour logger un message
   * TOUJOURS enregistre dans le tableau (pour le PDF en cas d'erreur)
   * Affiche en console selon les règles (debugMode ou toujours pour certains niveaux)
   * 
   * @param level Niveau du log
   * @param message Message à logger
   * @param alwaysShow Si true, affiche toujours en console (ignore debugMode)
   */
  private static log(level: LogEntry['level'], message: string, alwaysShow: boolean = false): void {
    // TOUJOURS enregistrer dans le tableau pour le PDF
    Logger.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message
    });

    // Afficher en console selon les règles
    if (alwaysShow || Logger.debugMode) {
      switch (level) {
        case 'error':
          console.error(message);
          break;
        case 'warn':
          console.warn(message);
          break;
        default:
          console.log(message);
      }
    }
  }

  /**
   * Log le début de l'exécution
   */
  static start(): void {
    Logger.log('start', '🚀 Démarrage du bot', true);
  }

  /**
   * Log une action d'authentification (pas une étape numérotée)
   * Toujours loggé car important pour le suivi de la session
   */
  static auth(message: string): void {
    Logger.log('auth', `🔐 ${message}`, true);
  }

  /**
   * Log le début d'un step
   * Toujours loggé car essentiel pour le suivi
   */
  static step(stepNumber: number, stepName: string): void {
    const emoji = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'][stepNumber] || `${stepNumber}️⃣`;
    const message = `${emoji} ==== STEP ${stepNumber} - ${stepName.toUpperCase()} ====`;
    // Ajouter une ligne vide avant le step (uniquement en console)
    console.log('');
    Logger.log('step', message, true);
  }

  /**
   * Log une sous-étape (seulement en mode détaillé en console, mais toujours enregistré)
   */
  static subStep(stepNumber: number, letter: string, description: string): void {
    Logger.log('subStep', `  ${stepNumber}.${letter} - ${description}`, false);
  }

  /**
   * Log le succès d'un champ rempli (seulement en mode détaillé en console, mais toujours enregistré)
   */
  static fieldSuccess(fieldName: string): void {
    Logger.log('fieldSuccess', `  ✅ ${fieldName} rempli`, false);
  }

  /**
   * Log une action réussie (navigation, clic, etc.) - seulement en mode détaillé en console, mais toujours enregistré
   * À utiliser pour les actions qui ne sont pas des remplissages de champs
   */
  static action(description: string): void {
    Logger.log('action', ` ✅ ${description}`, false);
  }

  /**
   * Log la fin d'un step (seulement en mode détaillé en console, mais toujours enregistré)
   */
  static stepSuccess(stepNumber: number): void {
    Logger.log('stepSuccess', `✅ Step ${stepNumber} terminé`, false);
  }

  /**
   * Log une erreur avec toutes les informations contextuelles
   * TOUJOURS loggé, même si debugMode=false
   */
  static error(error: StepError | Error): void {
    let message: string;
    if (error instanceof StepError) {
      message = error.toLogString();
    } else {
      message = `❌ Erreur : ${error.message}`;
    }
    Logger.log('error', message, true);
  }

  /**
   * Log un avertissement (erreur non-fatale mais importante)
   * TOUJOURS loggé, même si debugMode=false
   * Les warnings sont des erreurs non-fatales mais importantes pour le debugging
   */
  static warn(message: string): void {
    Logger.log('warn', `⚠️ ${message}`, true);
  }

  /**
   * Log une information (seulement en mode détaillé en console, mais toujours enregistré)
   * Pour les infos importantes qui doivent toujours être loggées, utiliser Logger.auth() ou Logger.infoAlways()
   */
  static info(message: string): void {
    Logger.log('info', `ℹ️ ${message}`, false);
  }

  /**
   * Log une information importante qui doit toujours être visible
   * Utilisé pour les infos critiques (session, navigation, etc.)
   */
  static infoAlways(message: string): void {
    Logger.log('infoAlways', `ℹ️ ${message}`, true);
  }

  /**
   * Log la fin réussie de l'exécution
   */
  static end(): void {
    Logger.log('end', '✅ Exécution terminée avec succès', true);
  }
}


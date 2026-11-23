/**
 * Types utilitaires pour les helpers et fonctions du bot Soregies
 * Définit les structures pour les utilitaires (logger, business rules, etc.)
 */

/**
 * Entrée de log pour le système de logging
 */
export interface LogEntry {
  timestamp: string;
  level: 'start' | 'auth' | 'step' | 'subStep' | 'fieldSuccess' | 'action' | 'stepSuccess' | 'error' | 'warn' | 'info' | 'infoAlways' | 'end';
  message: string;
}

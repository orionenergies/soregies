/**
 * Types pour la validation des inputs du bot Soregies
 * Définit les structures pour la validation et la configuration métier
 *
 * L'implémentation de la validation se trouve dans src/validation.ts
 */

export interface ValidationErrorItem {
  field: string;
  message: string;
}

/**
 * Configuration métier pour le workflow Soregies (déclaration de production uniquement).
 * Même structure d'entrée (`configuration.invoice`) que le bot EDF OA.
 *
 * - reference : numéro de dossier / contrat ou code PRM (colonnes « Dossier » / « Contrat » de « Mes index »)
 * - spv : nom du profil producteur (page « Choix du profil »)
 * - startDate : début de période — sert à identifier la ligne d'index (colonne « Date début », mois + année)
 * - endDate : accepté pour compatibilité, ignoré (date de relevé = startDate + 1 mois)
 * - kwhProduction : production à déclarer (saisie dans le dernier champ du formulaire)
 * - startIndex : index de début Airtable (comparé à l'ancien index Soregies, simple alerte)
 * - prodAnniversaire : accepté pour compatibilité, ignoré (pas de notion de veille anniversaire sur Soregies)
 */
export interface SoregiesDeclarationConfig {
  reference: string;
  spv: string;
  startDate: string;
  endDate?: string;
  kwhProduction?: number;   // Requis pour la déclaration (vérifié dans bot.ts)
  startIndex?: number;
  prodAnniversaire?: number;
  baseRecordUrl?: string;   // Optionnel — URL Airtable du record déclencheur, simple écho vers la réponse (non utilisé par le bot)
}

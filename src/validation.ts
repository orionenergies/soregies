/**
 * Validation centralisée du bot Soregies
 * Valide les inputs (BotFormData) et extrait la configuration métier (SoregiesDeclarationConfig)
 */
import { BotFormData } from './types';
import { BotConfig, validateConfig } from './config';
import { ValidationIssue } from './errors';
import { ValidationErrorItem, SoregiesDeclarationConfig } from './types/validation';

// Re-export types pour compatibilité
export type { ValidationErrorItem, SoregiesDeclarationConfig } from './types/validation';

// ============================================================================
// VALIDATION DES INPUTS
// ============================================================================

/**
 * Valide les champs obligatoires de BotFormData
 */
export function validateInput(formData: BotFormData): void {
  const errors: ValidationErrorItem[] = [];

  if (typeof formData.submit !== 'boolean') {
    errors.push({ field: 'submit', message: 'Doit être un booléen' });
  }
  if (typeof formData.debugMode !== 'boolean') {
    errors.push({ field: 'debugMode', message: 'Doit être un booléen' });
  }
  if (!formData.configuration) {
    errors.push({ field: 'configuration', message: 'Obligatoire' });
  } else {
    errors.push(...validateInvoiceConfig(formData.configuration).errors);
  }

  if (errors.length > 0) {
    const messages = errors.map(e => `- ${e.field}: ${e.message}`).join('\n');
    throw new ValidationIssue(`Validation échouée:\n${messages}`);
  }
}

// ============================================================================
// VALIDATION DE LA CONFIGURATION SOREGIES
// ============================================================================

interface InvoiceData {
  reference?: string;
  spv?: string;
  startDate?: string;
  endDate?: string;
  kwhProduction?: number;
  startIndex?: number | string | null; // Peut être nombre, chaîne (à convertir) ou null
  prodAnniversaire?: number | string | null; // Accepté pour compatibilité avec le JSON EDF OA, ignoré par Soregies
  baseRecordUrl?: string; // URL Airtable du record déclencheur — simple écho vers la réponse
}

/**
 * Valide la structure configuration.invoice
 */
function validateInvoiceConfig(configuration: unknown): {
  config?: SoregiesDeclarationConfig;
  errors: ValidationErrorItem[];
} {
  const errors: ValidationErrorItem[] = [];

  if (!configuration || typeof configuration !== 'object') {
    errors.push({ field: 'configuration', message: 'Doit être un objet' });
    return { errors };
  }

  const root = configuration as { invoice?: unknown };
  if (!root.invoice || typeof root.invoice !== 'object') {
    errors.push({ field: 'configuration.invoice', message: 'Bloc obligatoire' });
    return { errors };
  }

  const inv = root.invoice as InvoiceData;

  // Champs obligatoires
  if (typeof inv.reference !== 'string' || !inv.reference.trim()) {
    errors.push({ field: 'invoice.reference', message: 'Chaîne non vide requise' });
  }
  if (typeof inv.spv !== 'string' || !inv.spv.trim()) {
    errors.push({ field: 'invoice.spv', message: 'Chaîne non vide requise' });
  }
  
  // Validation et normalisation de startDate
  let normalizedStartDate: string | null = null;
  if (typeof inv.startDate !== 'string' || !inv.startDate.trim()) {
    errors.push({ field: 'invoice.startDate', message: 'Chaîne non vide requise (format YYYY-MM-DD ou DD/MM/YYYY)' });
  } else {
    normalizedStartDate = normalizeDate(inv.startDate.trim());
    if (!normalizedStartDate) {
      errors.push({ field: 'invoice.startDate', message: 'Format invalide (attendu: YYYY-MM-DD ou DD/MM/YYYY)' });
    }
  }

  // Validation et normalisation de endDate (optionnel)
  let normalizedEndDate: string | undefined = undefined;
  if (inv.endDate !== undefined && inv.endDate !== null && inv.endDate !== '') {
    const normalized = normalizeDate(inv.endDate.trim());
    if (!normalized) {
      errors.push({ field: 'invoice.endDate', message: 'Format invalide (attendu: YYYY-MM-DD ou DD/MM/YYYY)' });
    } else {
      normalizedEndDate = normalized;
    }
  }

  // kwhProduction est optionnel à ce stade (requis pour la déclaration, vérifié dans bot.ts)
  let kwhProduction: number | undefined = undefined;
  if (inv.kwhProduction !== undefined && inv.kwhProduction !== null) {
    if (typeof inv.kwhProduction !== 'number' || inv.kwhProduction < 0) {
      errors.push({ field: 'invoice.kwhProduction', message: 'Nombre >= 0 requis' });
    } else {
      kwhProduction = inv.kwhProduction;
    }
  }
  
  // Champs optionnels avec validation de type
  // Les valeurs vides (null, chaîne vide, undefined) sont considérées comme non existantes
  let startIndex: number | undefined = undefined;
  if (inv.startIndex !== undefined && inv.startIndex !== null) {
    // Si c'est une chaîne, essayer de la convertir en nombre
    if (typeof inv.startIndex === 'string') {
      const trimmed = inv.startIndex.trim();
      if (trimmed === '') {
        // Chaîne vide = non existant
        startIndex = undefined;
      } else {
        const parsed = Number(trimmed);
        if (isNaN(parsed) || parsed < 0) {
          errors.push({ field: 'invoice.startIndex', message: 'Nombre >= 0 requis' });
        } else {
          startIndex = parsed;
        }
      }
    } else if (typeof inv.startIndex === 'number') {
      if (inv.startIndex < 0) {
    errors.push({ field: 'invoice.startIndex', message: 'Nombre >= 0 requis' });
      } else {
        startIndex = inv.startIndex;
      }
    } else {
      errors.push({ field: 'invoice.startIndex', message: 'Doit être un nombre' });
    }
  }

  let prodAnniversaire: number | undefined = undefined;
  if (inv.prodAnniversaire !== undefined && inv.prodAnniversaire !== null) {
    // Si c'est une chaîne, essayer de la convertir en nombre
    if (typeof inv.prodAnniversaire === 'string') {
      const trimmed = inv.prodAnniversaire.trim();
      if (trimmed === '') {
        // Chaîne vide = non existant
        prodAnniversaire = undefined;
      } else {
        const parsed = Number(trimmed);
        if (isNaN(parsed) || parsed < 0) {
          errors.push({ field: 'invoice.prodAnniversaire', message: 'Nombre >= 0 requis' });
        } else {
          prodAnniversaire = parsed;
        }
      }
    } else if (typeof inv.prodAnniversaire === 'number') {
      if (inv.prodAnniversaire < 0) {
    errors.push({ field: 'invoice.prodAnniversaire', message: 'Nombre >= 0 requis' });
      } else {
        prodAnniversaire = inv.prodAnniversaire;
      }
    } else {
      errors.push({ field: 'invoice.prodAnniversaire', message: 'Doit être un nombre' });
    }
  }

  // baseRecordUrl — simple écho (propagation pure), aucune validation bloquante
  let baseRecordUrl: string | undefined = undefined;
  if (typeof inv.baseRecordUrl === 'string' && inv.baseRecordUrl.trim()) {
    baseRecordUrl = inv.baseRecordUrl.trim();
  }

  if (errors.length > 0) return { errors };

  if (!normalizedStartDate) {
    // Ce cas ne devrait pas arriver car on a déjà vérifié, mais TypeScript nécessite cette vérification
    errors.push({ field: 'invoice.startDate', message: 'Date non normalisée' });
    return { errors };
  }

  return {
    config: {
      reference: inv.reference!.trim(),
      spv: inv.spv!.trim(),
      startDate: normalizedStartDate, // Date normalisée en YYYY-MM-DD
      ...(normalizedEndDate !== undefined && { endDate: normalizedEndDate }),
      ...(kwhProduction !== undefined && { kwhProduction }),
      ...(startIndex !== undefined && { startIndex }),
      ...(prodAnniversaire !== undefined && { prodAnniversaire }),
      ...(baseRecordUrl !== undefined && { baseRecordUrl })
    },
    errors: []
  };
}

/**
 * Normalise une date depuis différents formats vers YYYY-MM-DD
 * Accepte :
 * - YYYY-MM-DD (ex: "2025-08-01")
 * - DD/MM/YYYY (ex: "01/08/2025")
 * 
 * @param dateString La date à normaliser
 * @returns La date normalisée en YYYY-MM-DD ou null si le format est invalide
 */
function normalizeDate(dateString: string): string | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();
  
  // Format YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch && isoMatch[1] && isoMatch[2] && isoMatch[3]) {
    const year = isoMatch[1];
    const month = isoMatch[2];
    const day = isoMatch[3];
    // Vérifier que la date est valide
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    if (date.getFullYear() === parseInt(year, 10) && 
        date.getMonth() === parseInt(month, 10) - 1 && 
        date.getDate() === parseInt(day, 10)) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  // Format DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch && dmyMatch[1] && dmyMatch[2] && dmyMatch[3]) {
    const day = dmyMatch[1];
    const month = dmyMatch[2];
    const year = dmyMatch[3];
    // Vérifier que la date est valide
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    if (date.getFullYear() === parseInt(year, 10) && 
        date.getMonth() === parseInt(month, 10) - 1 && 
        date.getDate() === parseInt(day, 10)) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  // Format non reconnu
  return null;
}

/**
 * Extrait la configuration Soregies validée depuis les données du formulaire
 * À appeler après validateInput()
 */
export function getSoregiesDeclarationConfig(formData: BotFormData): SoregiesDeclarationConfig {
  const { config, errors } = validateInvoiceConfig(formData.configuration);

  if (!config || errors.length > 0) {
    const messages = errors.map(e => `- ${e.field}: ${e.message}`).join('\n');
    throw new ValidationIssue(`Validation Soregies échouée:\n${messages}`);
  }

  return config;
}

// ============================================================================
// VALIDATION COMPLÈTE (config + inputs)
// ============================================================================

/**
 * Valide la configuration du bot et les inputs, puis extrait la configuration Soregies
 * Point d'entrée unique pour toute la validation avant démarrage du bot
 */
export function validateAndExtractConfig(formData: BotFormData, config: BotConfig): SoregiesDeclarationConfig {
  validateConfig(config);
  validateInput(formData);
  return getSoregiesDeclarationConfig(formData);
}

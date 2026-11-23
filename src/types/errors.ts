/**
 * Types et classes d'erreur personnalisées
 *
 * Ce fichier contient toutes les classes d'erreur utilisées dans le bot.
 * Chaque classe d'erreur représente un type spécifique d'erreur avec ses propriétés.
 */

/**
 * Classe d'erreur personnalisée pour les erreurs de step
 * Contient toutes les informations contextuelles nécessaires pour un logging détaillé
 * Par défaut, toutes les erreurs StepError sont fatal_error (code HTTP 500)
 */
export class StepError extends Error {
  public readonly stepName: string;
  public readonly stepNumber: number;
  public readonly subStep?: string | undefined;
  public readonly fieldName?: string | undefined;
  public readonly selector?: string | undefined;
  public readonly errorType: string;
  public readonly originalError?: Error | undefined;

  constructor(params: {
    stepName: string;
    stepNumber: number;
    subStep?: string;
    fieldName?: string;
    selector?: string;
    errorType: string;
    message: string;
    originalError?: Error;
  }) {
    super(params.message);
    this.name = 'StepError';
    this.stepName = params.stepName;
    this.stepNumber = params.stepNumber;
    this.subStep = params.subStep ?? undefined;
    this.fieldName = params.fieldName ?? undefined;
    this.selector = params.selector ?? undefined;
    this.errorType = params.errorType;
    this.originalError = params.originalError ?? undefined;

    // Préserver la stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StepError);
    }
  }

  /**
   * Formate l'erreur en français pour l'affichage dans les logs
   */
  toLogString(): string {
    const parts: string[] = [];

    parts.push(`❌ Erreur dans Step ${this.stepNumber} - ${this.stepName}`);

    if (this.subStep) {
      parts.push(`   Sous-étape : ${this.stepNumber}.${this.subStep}`);
    }

    if (this.fieldName) {
      parts.push(`   Champ : ${this.fieldName}`);
    }

    if (this.selector) {
      parts.push(`   Sélecteur : ${this.selector}`);
    }

    parts.push(`   Nature : ${this.errorType}`);
    parts.push(`   Message : ${this.message}`);

    if (this.originalError && this.originalError.message !== this.message) {
      parts.push(`   Erreur originale : ${this.originalError.message}`);
    }

    return parts.join('\n');
  }
}

/**
 * Issue métier indiquant que le contrat (dossier / PRM) n'a pas été trouvé pour un profil producteur
 * Permet le retry avec un autre profil du même nom
 * Issue métier (status: 'issue') : spécifique à la déclaration (code HTTP 200)
 *
 * `totalMatches` est renseigné quand l'échec survient après la sélection du profil,
 * pour que le retry sache combien de profils restent à essayer.
 */
export class BtaNotFoundIssue extends Error {
  public readonly reference: string;
  public readonly producteurIndex: number;
  public readonly totalMatches?: number;

  constructor(
    reference: string,
    producteurIndex: number,
    message?: string,
    totalMatches?: number
  ) {
    super(message || `Contrat "${reference}" non trouvé pour le profil à l'index ${producteurIndex}`);
    this.name = 'BtaNotFoundIssue';
    this.reference = reference;
    this.producteurIndex = producteurIndex;
    if (totalMatches !== undefined) {
      this.totalMatches = totalMatches;
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BtaNotFoundIssue);
    }
  }
}

/**
 * Issue métier de validation des inputs
 * Issue métier (status: 'issue') : problème avec les données d'entrée (code HTTP 200)
 */
export class ValidationIssue extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationIssue';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationIssue);
    }
  }
}

/**
 * Issue métier indiquant qu'aucune ligne d'index traitable n'a été trouvée
 * (période absente, état « Fermée » / « Interdite » / « À venir » / « Contestable »)
 * Issue métier (status: 'issue') : spécifique à la déclaration (code HTTP 200)
 * Peut contenir l'état de la ligne détecté sur la plateforme pour enrichir la réponse
 */
export class InvoiceNotFoundIssue extends Error {
  /**
   * État de la ligne d'index détecté sur la plateforme (ex: "Fermée", "Interdite", "À venir")
   */
  public readonly invoiceStatus?: string | undefined;

  constructor(message: string, invoiceStatus?: string) {
    super(message);
    this.name = 'InvoiceNotFoundIssue';
    this.invoiceStatus = invoiceStatus;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvoiceNotFoundIssue);
    }
  }
}

/**
 * Erreur indiquant qu'une erreur de la plateforme a été détectée
 * (indisponibilité, réponse HTTP 5xx de l'API, refus inattendu de la validation…)
 * Erreur technique : retourne un code HTTP 500 avec `error.source: 'platform'`
 */
export class PlatformError extends Error {
  public readonly errorCode: string;
  public readonly action: string;
  /** Détail renvoyé par la plateforme (ex: champ `flash` de l'API), repris dans le message final */
  public readonly detail?: string | undefined;

  constructor(errorCode: string, action: string, message?: string, detail?: string) {
    super(message || `Erreur de la plateforme détectée après "${action}" (erreur: ${errorCode})`);
    this.name = 'PlatformError';
    this.errorCode = errorCode;
    this.action = action;
    this.detail = detail;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PlatformError);
    }
  }
}

/**
 * Litigation : déclaration en doublon
 * Litigation (status: 'litigation') : l'index de cette période a déjà été saisi (HTTP 409 ou message « déjà »)
 */
export class DuplicateInvoiceLitigation extends Error {
  public readonly errorCode: string;
  public readonly action: string;

  constructor(errorCode: string, action: string, message?: string) {
    super(
      message ||
        `Erreur de la plateforme détectée après "${action}" (erreur: ${errorCode}). La déclaration est en doublon et nécessite une vérification manuelle.`
    );
    this.name = 'DuplicateInvoiceLitigation';
    this.errorCode = errorCode;
    this.action = action;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DuplicateInvoiceLitigation);
    }
  }
}

/**
 * Litigation : production nulle
 * Litigation (status: 'litigation') : la plateforme Soregies exige une production >= 1 kWh
 * et un nouvel index strictement supérieur à l'ancien : une production à 0 n'est pas déclarable.
 */
export class ProductionNullLitigation extends Error {
  public readonly fieldName: string; // 'kwhProduction'
  public readonly invalidValue: number; // 0

  constructor(fieldName: string, invalidValue: number, message?: string) {
    super(
      message ||
        `La plateforme Soregies n'accepte pas la valeur ${invalidValue} pour le champ "${fieldName}". ` +
        `La déclaration nécessite une vérification manuelle.`
    );
    this.name = 'ProductionNullLitigation';
    this.fieldName = fieldName;
    this.invalidValue = invalidValue;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProductionNullLitigation);
    }
  }
}

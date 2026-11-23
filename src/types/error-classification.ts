/**
 * Classification des erreurs
 *
 * Détermine le statut interne d'une erreur (ErrorStatus) à partir de sa classe / son message :
 * - error      : échec technique → réponse `result: 'error'` (HTTP 500), `error.code` = nom de la classe
 * - issue      : problème métier → réponse `result: 'issue'` (HTTP 200), `issue.code` (IssueCode)
 * - litigation : litige à traiter manuellement → réponse `result: 'issue'` (HTTP 200), `issue.source: 'business'`
 *
 * Le mapping ErrorStatus → réponse (`result`, `error.code`/`issue.code`) est fait par la couche réponse (bot.ts).
 */

/**
 * Type d'erreur technique interne : uniquement 'fatal_error'.
 * Les issues/litigations ne portent pas de ErrorType ; côté réponse elles deviennent `issue.code`.
 */
export type ErrorType = 'fatal_error';

/**
 * Nouveau type de status : error (HTTP 500), issue (HTTP 200) ou litigation (HTTP 200)
 */
export type ErrorStatus = 'error' | 'issue' | 'litigation';

/**
 * Détermine le nouveau status (error, issue ou litigation) à partir d'une erreur
 * @param error L'erreur à classifier
 * @returns 'error' pour HTTP 500, 'issue' ou 'litigation' pour HTTP 200
 */
export function getErrorStatus(error: unknown): ErrorStatus {
  // Vérifier par le nom de la classe d'erreur (évite les dépendances circulaires)
  if (error instanceof Error) {
    const errorName = error.name;

    // LITIGATION : Problèmes nécessitant intervention manuelle (HTTP 200)
    const litigationNames = [
      'DuplicateInvoiceLitigation',
      'ProductionNullLitigation'
    ];

    if (litigationNames.includes(errorName)) {
      return 'litigation';
    }

    // ISSUE : Problèmes métier (HTTP 200)
    const issueNames = [
      'InvoiceNotFoundIssue',
      'BtaNotFoundIssue',
      'ValidationIssue'
    ];

    if (issueNames.includes(errorName)) {
      return 'issue';
    }

    // ERROR : Erreurs techniques (HTTP 500)
    const errorNames = [
      'StepError',
      'TimeoutError',
      'ElementNotFoundError',
      'NavigationError',
      'AuthenticationError',
      'ServerError',
      'PlatformError' // Toujours une erreur technique
    ];

    if (errorNames.includes(errorName)) {
      return 'error';
    }

    // Vérifier par le message ou le nom (insensible à la casse)
    const errorNameLower = errorName.toLowerCase();
    const errorMessage = error.message.toLowerCase();

    // Détecter les erreurs techniques par leur nom ou message
    const errorPatterns = [
      'timeout',
      'elementnotfound',
      'element not found',
      'navigationerror',
      'navigation error',
      'authenticationerror',
      'authentication error',
      'servererror',
      'server error',
      'networkerror',
      'network error',
      'platformerror',
      'platform error'
    ];

    const isError = errorPatterns.some(pattern =>
      errorNameLower.includes(pattern) || errorMessage.includes(pattern)
    );

    if (isError) {
      return 'error';
    }

    // Détecter les litigations par leur message
    const litigationPatterns = [
      'déclaration en doublon',
      'facture_en_doublon'
    ];

    const isLitigation = litigationPatterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(errorMessage);
    });

    if (isLitigation) {
      return 'litigation';
    }

    // Détecter les issues métier par leur message
    const issuePatterns = [
      'validation échouée',
      'validation soregies échouée',
      'contrat.*non trouvé',
      'aucun index'
    ];

    const isIssue = issuePatterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(errorMessage);
    });

    if (isIssue) {
      return 'issue';
    }
  }

  // Par défaut, considérer comme error (erreur inconnue = technique)
  return 'error';
}

/**
 * Détermine le type d'erreur (uniquement fatal_error pour les erreurs techniques)
 * @param error L'erreur à classifier
 * @returns 'fatal_error' uniquement pour les erreurs techniques (status === 'error')
 */
export function getErrorType(error: unknown): ErrorType {
  const status = getErrorStatus(error);

  // Seules les erreurs techniques ont un errorType
  if (status === 'error') {
    return 'fatal_error';
  }

  // Pour les issues et litigations, pas de ErrorType technique
  // (côté réponse, elles sont décrites par issue.code).
  // Valeur par défaut 'fatal_error' pour compatibilité de type.
  return 'fatal_error';
}

/**
 * Détermine si une erreur est une issue métier (retourne HTTP 200)
 * @param error L'erreur à vérifier
 * @returns true si c'est une issue métier (HTTP 200), false sinon
 */
export function isIssue(error: unknown): boolean {
  return getErrorStatus(error) === 'issue';
}

/**
 * Détermine si une erreur est une erreur technique (retourne HTTP 500)
 * @param error L'erreur à vérifier
 * @returns true si c'est une erreur technique (HTTP 500), false sinon
 */
export function isError(error: unknown): boolean {
  return getErrorStatus(error) === 'error';
}

/**
 * Détermine si une erreur est une litigation (retourne HTTP 200)
 * @param error L'erreur à vérifier
 * @returns true si c'est une litigation (HTTP 200), false sinon
 */
export function isLitigation(error: unknown): boolean {
  return getErrorStatus(error) === 'litigation';
}

// ============================================================================
// CLASSIFICATION UNIFIÉE — source unique de vérité
// ============================================================================

/**
 * Qui est responsable d'une erreur technique (status === 'error' uniquement).
 * Même taxonomie que IssueSource (caller / platform) pour faciliter le routage côté Make.
 * - caller      : échec imputable à l'appelant / au bot (timeout, sélecteur introuvable, crash Playwright)
 * - platform    : la plateforme cible a mal répondu (indisponible, page inattendue)
 * - input_error : les données envoyées par l'appelant sont invalides (non émis actuellement)
 */
export type ErrorSource = 'caller' | 'platform' | 'input_error';

/**
 * Résultat combiné de la classification pour les erreurs techniques (result === 'error').
 * errorSource indique qui est responsable du crash.
 */
export interface ErrorClassification {
  httpResult: 'error' | 'issue';
  errorSource?: ErrorSource;
}

/**
 * Classifie une erreur technique : result HTTP + source de l'erreur.
 * Issues et litigations → 'issue'. Crashes techniques → 'error' + errorSource.
 *
 * Convention de nommage pour les nouveaux bots :
 *   - classe se terminant par 'Issue' ou 'Litigation' → issue (HTTP 200)
 *   - classe se terminant par 'PlatformError'         → error (HTTP 500), source: platform
 *   - tout le reste                                   → error (HTTP 500), source: caller
 */
export function classifyError(error: unknown): ErrorClassification {
  const rawStatus = getErrorStatus(error);

  // Issues et litigations → result 'issue' (HTTP 200), pas de errorSource
  if (rawStatus !== 'error') {
    return { httpResult: 'issue' };
  }

  // Erreur technique (HTTP 500) : déterminer la source
  let errorSource: ErrorSource = 'caller';

  if (error instanceof Error) {
    const name = error.name;
    if (name === 'PlatformError' || name.endsWith('PlatformError') || name.endsWith('PortalError')) {
      errorSource = 'platform';
    }
  }

  return { httpResult: 'error', errorSource };
}

// ============================================================================
// ISSUE CLASSIFICATION — codes métier machine-readable
// ============================================================================

/**
 * Code identifiant précisément le problème (HTTP 200 avec result === 'issue').
 * Stable à travers les versions — les appelants peuvent brancher dessus.
 */
export type IssueCode =
  | 'BTA_NOT_FOUND'        // Contrat (dossier / PRM) introuvable pour ce profil producteur
  | 'INVOICE_NOT_FOUND'    // Ligne d'index absente ou état non traitable (Fermée, Interdite, À venir…)
  | 'INVALID_INPUT'        // Données de l'appelant invalides
  | 'DUPLICATE_INVOICE'    // Déclaration en doublon → vérification manuelle
  | 'PRODUCTION_NULL'      // Production nulle non acceptée → vérification manuelle

/**
 * Qui a causé l'issue (HTTP 200 avec result === 'issue').
 * - caller   : données invalides envoyées par l'appelant
 * - platform : la plateforme Soregies a renvoyé un état inattendu
 * - business : règle métier non satisfaite, nécessite intervention manuelle
 */
export type IssueSource = 'caller' | 'platform' | 'business';

export interface IssueClassification {
  issueCode: IssueCode;
  issueSource: IssueSource;
}

/**
 * Mappe une erreur/litigation à son issueCode + issueSource.
 * Appelé uniquement quand classifyError() retourne httpResult === 'issue'.
 */
export function classifyIssue(error: unknown): IssueClassification {
  if (error instanceof Error) {
    switch (error.name) {
      case 'BtaNotFoundIssue':
        return { issueCode: 'BTA_NOT_FOUND', issueSource: 'platform' };
      case 'InvoiceNotFoundIssue':
        return { issueCode: 'INVOICE_NOT_FOUND', issueSource: 'platform' };
      case 'ValidationIssue':
        return { issueCode: 'INVALID_INPUT', issueSource: 'caller' };
      case 'DuplicateInvoiceLitigation':
        return { issueCode: 'DUPLICATE_INVOICE', issueSource: 'business' };
      case 'ProductionNullLitigation':
        return { issueCode: 'PRODUCTION_NULL', issueSource: 'business' };
    }
  }
  return { issueCode: 'INVOICE_NOT_FOUND', issueSource: 'platform' };
}

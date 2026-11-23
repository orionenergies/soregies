import { BrowserManager } from './browser-manager';

/**
 * Wrapper pour exécuter une action avec tracking et détection automatique des erreurs
 * 
 * Après chaque action, vérifie automatiquement si une erreur de plateforme ou de litige
 * a été détectée par le listener du BrowserManager et la throw si c'est le cas.
 * 
 * @param browserManager Le gestionnaire de navigateur avec le listener configuré
 * @param action Description de l'action en cours (pour le message d'erreur)
 * @param fn La fonction à exécuter
 * @returns Le résultat de la fonction
 * @throws PlatformError si une erreur de plateforme est détectée
 * @throws DuplicateInvoiceLitigation si une erreur de litige est détectée
 */
export async function trackAction<T>(
  browserManager: BrowserManager,
  action: string,
  fn: () => Promise<T>
): Promise<T> {
  browserManager.setCurrentAction(action);
  try {
    const result = await fn();
    
    // Vérifier les erreurs détectées par le listener après l'action
    checkForDetectedErrors(browserManager);
    
    browserManager.clearCurrentAction();
    return result;
  } catch (error) {
    browserManager.clearCurrentAction();
    throw error;
  }
}

/**
 * Vérifie si des erreurs ont été détectées par le listener et les throw
 * Priorité : DuplicateInvoiceLitigation > PlatformError
 */
function checkForDetectedErrors(browserManager: BrowserManager): void {
  // Priorité aux erreurs de litige
  const litigeError = browserManager.getDetectedLitigeError();
  if (litigeError) {
    browserManager.clearDetectedLitigeError();
    throw litigeError;
  }
  
  // Ensuite les erreurs de plateforme
  const platformError = browserManager.getDetectedPlatformError();
  if (platformError) {
    browserManager.clearDetectedPlatformError();
    throw platformError;
  }
}

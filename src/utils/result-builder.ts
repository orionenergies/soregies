import { StepResult, SoregiesBusinessDetails } from '../types';
import { Logger } from './logger';

/**
 * Construit les objets SoregiesBusinessDetails et messages pour les déclarations réussies.
 */
export class ResultBuilder {
  /**
   * Construit les champs top-level communs à toutes les réponses (succès comme erreur) :
   * - `logs` : logs d'exécution en texte brut (une ligne par message), vide si aucun log.
   *
   * Aucun appel réseau, aucun env var créé.
   */
  static buildExecutionMetadata(): { logs: string } {
    return {
      logs: Logger.getLogs().map(entry => entry.message ?? '').join('\n'),
    };
  }

  static buildDeclarationBusinessDetails(options: {
    startIndexSoregies?: number | undefined;
    statusFacture?: string | undefined;
  }): SoregiesBusinessDetails {
    const details: SoregiesBusinessDetails = {
      useCase: 'declaration',
      methodeDeclaration: 'index',
    };
    if (options.startIndexSoregies !== undefined) details.startIndexSoregies = options.startIndexSoregies;
    if (options.statusFacture) details.statusFacture = options.statusFacture;
    return details;
  }

  static buildDeclarationMessage(options: {
    wasSubmitted: boolean;
    submissionResult?: (StepResult & { statusFacture?: string }) | null;
    step4Alerts?: string[];
  }): string {
    let message: string;
    if (options.submissionResult?.statusFacture) {
      message = options.submissionResult.message;
    } else if (options.wasSubmitted) {
      message = 'Navigation Soregies terminée et formulaire soumis avec succès';
    } else {
      message = 'Navigation Soregies terminée, formulaire prêt (non soumis)';
    }
    if (options.step4Alerts && options.step4Alerts.length > 0) {
      message += '\n' + options.step4Alerts.join('\n');
    }
    return message;
  }
}

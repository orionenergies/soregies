/**
 * Tous les messages utilisateur retournés dans les réponses API.
 * Modifier ici pour changer le texte sans toucher à la logique.
 */

/** Messages personnalisés pour les codes d'erreur détectés sur la plateforme Soregies. */
export const PLATFORM_ERROR_MESSAGES: Record<string, string> = {
  indisponible:
    'Le portail Soregies est temporairement indisponible. Votre requête n\'a pu aboutir. Si le problème persiste, merci de contacter le support Soregies.',
  declaration_en_doublon:
    'Une déclaration existe déjà pour cette période sur Soregies. Cette déclaration a peut-être déjà été saisie ou est en doublon.',
};

/** Message générique quand le code de plateforme est inconnu. */
export const PLATFORM_ERROR_GENERIC = (errorCode: string, action: string, detail?: string): string =>
  `Erreur de la plateforme Soregies détectée lors de l'action "${action}" (code: ${errorCode})` +
  (detail ? ` : ${detail}` : '') +
  `. Veuillez vérifier votre déclaration ou contacter le support Soregies si le problème persiste.`;

/** Message générique pour les erreurs techniques. */
export const TECHNICAL_ERROR_GENERIC =
  'Une erreur technique est survenue lors du traitement de votre demande.';

/** Message générique pour les erreurs inconnues (non-Error). */
export const UNKNOWN_ERROR_GENERIC =
  'Une erreur inconnue est survenue. Veuillez réessayer ou contacter le support.';

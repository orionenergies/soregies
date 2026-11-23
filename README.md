# orion-bot-soregies

Bot RPA (TypeScript + Playwright + Express) qui **déclare une production électrique** sur
[mon-espace-producteur.soregies.fr](https://mon-espace-producteur.soregies.fr/).

Il reprend le contrat d'entrée/sortie du bot `orion-bot-edfoa` (cas d'usage « déclaration » uniquement) :
mêmes champs JSON d'entrée, même réponse à trois états (`success` / `issue` / `error`), mêmes codes
d'`issue`, mêmes règles de contrôle. Tout ce qui ne concerne pas l'instruction de déclaration (validation de
facture, IBAN, documents, etc.) n'est pas porté.

## Fonctionnement

| Étape | Rôle |
|-------|------|
| 0 | Authentification (`SOREGIES_USERNAME` / `SOREGIES_PASSWORD`) |
| 1 | Choix du profil dont le `.fullName` contient `spv` (insensible à la casse) sur `/profiles` |
| 2 | Recherche du contrat dans « Mes index » (`reference` = n° de dossier, dossier lié `A/B` ou code PRM) |
| 3 | Sélection de la ligne d'index de la période (`startDate`, même mois/année que « Date début », ligne « Ouverte » prioritaire) |
| 4 | Remplissage du formulaire « Saisir ma production » : date de relevé = 1er jour du mois suivant `startDate`, puis `kwhProduction` dans le dernier champ de production |
| 5 | Contrôle de la production affichée (± 10 kWh) puis, si `submit: true`, « Valider la production » + confirmation |

Particularités de Soregies (SPA Angular, API Cognito) :

- les jetons sont en `sessionStorage` : **aucune réutilisation de session**, le bot se reconnecte à chaque run ;
- l'URL `/home/index` est atteinte par navigation directe, avec repli sur le menu de l'application ;
- la déclaration se fait uniquement par production : il n'existe ni déclaration par index ni production anniversaire (les champs `startIndex` et `prodAnniversaire` du JSON EDF OA sont ignorés) ;
- pour des dossiers liés (deux dossiers), les champs de production sont en lecture seule : le bot passe alors par le champ de cumul de Soregies pour obtenir la production demandée ;
- les appels API `/billing-system/contacts` et `/billing-system/index-events` sont surveillés pour détecter
  les erreurs plateforme (HTTP ≥ 500, 4xx sur `/validate`).

## Entrée (`POST /run`)

Même JSON que le bot EDF OA :

```json
{
  "submit": false,
  "debugMode": true,
  "configuration": {
    "invoice": {
      "spv": "SPV Exemple",
      "reference": "D100200",
      "startDate": "2026-10-01",
      "kwhProduction": 250,
      "baseRecordUrl": "https://airtable.com/appXXX/tblYYY/recZZZ"
    }
  }
}
```

| Champ | Usage sur Soregies |
|-------|--------------------|
| `submit` | `false` : le formulaire est rempli mais non soumis |
| `debugMode` | active les captures d'écran en cas d'erreur (`debug.screenshotBase64`) |
| `spv` | nom du profil producteur à sélectionner |
| `reference` | n° de dossier (`contractLineId`, y compris dossier lié `A/B`) ou code PRM |
| `startDate` | identifie la période (mois + année de « Date début ») |
| `endDate` | accepté pour compatibilité, ignoré (la date de relevé est le 1er jour du mois suivant `startDate` ; si elle est hors des bornes du champ, la date du jour est conservée avec une alerte) |
| `kwhProduction` | production à déclarer (< 1 → `PRODUCTION_NULL`) |
| `baseRecordUrl` | simple écho dans la réponse |

## Sortie

HTTP 200 pour `success` et `issue`, HTTP 500 pour `error`. Champs : `runId`, `result`, `message`, `timestamp`,
`executionTimeMs`, `logs`, `spv`, `baseRecordUrl`, `businessDetails`, plus `issue` (`code`, `source`, `detail`)
ou `error` (`source`, `code`) et `debug` (`stepName`, `action`, `screenshotBase64`).

`businessDetails` : `{ "useCase": "declaration", "statusFacture": "valide" }` (`statusFacture` n'est renseigné qu'après une soumission réussie).

| Résultat | Code | Cas |
|----------|------|-----|
| `issue` | `BTA_NOT_FOUND` | contrat introuvable sur tous les profils correspondant au `spv` |
| `issue` | `INVOICE_NOT_FOUND` | période absente ou ligne non « Ouverte » (`statusFacture` = état Soregies : Fermée, Interdite, À venir…) |
| `issue` | `INVALID_INPUT` | JSON d'entrée invalide |
| `issue` | `DUPLICATE_INVOICE` | déclaration déjà saisie (HTTP 409 ou message « déjà saisi/déclaré ») |
| `issue` | `PRODUCTION_NULL` | `kwhProduction` < 1 |
| `error` | `StepError` / `PlatformError` | échec technique (identifiants refusés, sélecteur introuvable, incohérence de formulaire, API en erreur) |

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `SOREGIES_USERNAME` / `SOREGIES_PASSWORD` | identifiants du compte producteur (obligatoires) |
| `API_KEY` | clé attendue dans le header `x-api-key` (exigée en production) |
| `PORT` | port HTTP (défaut : 3000) |
| `NODE_ENV` | `production` → navigateur headless |
| `TARGET_BASE_URL` | surcharge de l'URL du site cible (tests) |

## Développement

```bash
npm install
npm run dev            # serveur avec rechargement
npm run build          # compilation TypeScript
npm test               # tests unitaires (tests/unit)
npm run test:e2e-mock  # tests bout en bout contre l'application réelle avec une API Soregies simulée
```

Les tests `e2e-mock` chargent le vrai front Soregies et interceptent son API (`tests/e2e-mock/mock-soregies-api.ts`) :
14 scénarios (succès, multi-profils, PRM, dossiers liés, alerte de date, `submit=false`, chaque `issue` et `error`).
Le flux complet a aussi été vérifié sur le site réel avec `submit: false` (login, profil, recherche, ligne ouverte,
formulaire rempli, cas `BTA_NOT_FOUND` et `INVOICE_NOT_FOUND`). La soumission réelle (`submit: true`) n'a pas été
exécutée pour ne pas créer de saisie en production ; elle n'est couverte que par l'API simulée.

Exemple d'appel local :

```bash
SOREGIES_USERNAME=... SOREGIES_PASSWORD=... npm run dev
curl -X POST localhost:3000/run -H 'Content-Type: application/json' -d @test-data.json
```

## Déploiement (Cloud Run)

`scripts/build-and-deploy.sh` construit l'image Docker (`mcr.microsoft.com/playwright:v1.57.0-noble`) et déploie
le service `orion-bot-soregies`. Secrets Secret Manager : `soregies-username`, `soregies-password`, `api-key`.

## Limites connues

- pagination de la liste des profils limitée à la première page ;
- la production affichée est contrôlée sur le formulaire (Soregies n'a pas de page récapitulative) ;
- pas de réutilisation de session.

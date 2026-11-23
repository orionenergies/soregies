#!/bin/bash

# Script de build local et déploiement sur Cloud Run
# Ce script vous donne le contrôle total du build avant de déployer

set -e

# Déterminer le répertoire racine du projet
# Le script peut être lancé depuis n'importe quel répertoire
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Changer vers le répertoire racine du projet
# C'est nécessaire pour que Docker trouve le Dockerfile
cd "$PROJECT_ROOT" || exit 1

# Fonction pour charger la configuration depuis project.config.json
load_project_config() {
  local config_file="$PROJECT_ROOT/project.config.json"
  
  if [ ! -f "$config_file" ]; then
    echo -e "${YELLOW}⚠️  project.config.json not found, using defaults${NC}"
    return 1
  fi
  
  # Utiliser jq si disponible, sinon utiliser une approche basique
  if command -v jq &> /dev/null; then
    PROJECT_ID=$(jq -r '.gcp.projectId' "$config_file")
    REGION=$(jq -r '.gcp.region' "$config_file")
    REPOSITORY=$(jq -r '.gcp.repository' "$config_file")
    SERVICE_NAME_DEFAULT=$(jq -r '.gcp.serviceName' "$config_file")
  else
    # Fallback: extraction basique avec grep/sed (moins robuste mais fonctionne)
    PROJECT_ID=$(grep -o '"projectId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | sed 's/.*"projectId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    REGION=$(grep -o '"region"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | sed 's/.*"region"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    REPOSITORY=$(grep -o '"repository"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | sed 's/.*"repository"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    SERVICE_NAME_DEFAULT=$(grep -o '"serviceName"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | sed 's/.*"serviceName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
  fi
  
  # Vérifier que les valeurs ont été chargées
  if [ -z "$PROJECT_ID" ] || [ -z "$REGION" ] || [ -z "$REPOSITORY" ] || [ -z "$SERVICE_NAME_DEFAULT" ]; then
    echo -e "${YELLOW}⚠️  Could not parse project.config.json, using defaults${NC}"
    return 1
  fi
  
  return 0
}

# Charger la configuration du projet
# NOTE: project.config.json est déprécié, les valeurs par défaut viennent maintenant de src/constants.ts
if ! load_project_config; then
  # Valeurs par défaut depuis src/constants.ts (GCP_CONFIG)
PROJECT_ID="orion-bots"
REGION="europe-west1"
REPOSITORY="orion-bot-images"
  SERVICE_NAME_DEFAULT="orion-bot-soregies"
fi

# Configuration (peut être surchargée via variable d'environnement)
SERVICE_NAME="${SERVICE_NAME:-$SERVICE_NAME_DEFAULT}"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"

# Couleurs pour le terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🚀 BUILD LOCAL ET DÉPLOIEMENT CLOUD RUN${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Vérifier que le daemon Docker tourne ; sinon, démarrer le runtime adapté
# (Colima si installé, sinon Docker Desktop sur macOS) et attendre qu'il soit prêt.
if ! docker info > /dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1; then
    echo -e "${YELLOW}🐳 Docker daemon indisponible, démarrage de Colima...${NC}"
    colima start || {
      echo -e "${RED}❌ Échec du démarrage de Colima${NC}"
      echo "   Vérifiez 'colima status' et réessayez"
      exit 1
    }
  elif [ -d "/Applications/Docker.app" ]; then
    echo -e "${YELLOW}🐳 Docker Desktop n'est pas démarré, lancement...${NC}"
    open -a Docker || {
      echo -e "${RED}❌ Impossible de lancer Docker Desktop${NC}"
      exit 1
    }
  else
    echo -e "${RED}❌ Aucun runtime Docker détecté (ni Colima, ni Docker Desktop dans /Applications)${NC}"
    echo "   Installez Colima (brew install colima) ou Docker Desktop et réessayez"
    exit 1
  fi

  # Attendre que le daemon Docker soit prêt (max 90s)
  DOCKER_TIMEOUT=90
  DOCKER_ELAPSED=0
  while ! docker info > /dev/null 2>&1; do
    if [ $DOCKER_ELAPSED -ge $DOCKER_TIMEOUT ]; then
      echo -e "${RED}❌ Docker n'a pas démarré dans les ${DOCKER_TIMEOUT}s${NC}"
      exit 1
    fi
    sleep 2
    DOCKER_ELAPSED=$((DOCKER_ELAPSED + 2))
    echo -e "${YELLOW}   ⏳ Attente du démarrage de Docker... (${DOCKER_ELAPSED}s)${NC}"
  done
  echo -e "${GREEN}✅ Docker démarré${NC}"
fi

# Vérifier l'authentification
echo -e "${YELLOW}📋 Vérification de l'authentification...${NC}"
gcloud config set project $PROJECT_ID

# Configurer Docker pour Artifact Registry
echo -e "${YELLOW}🔐 Configuration de Docker pour Artifact Registry...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Charger les variables d'environnement depuis .env
echo -e "${YELLOW}📝 Chargement des secrets depuis .env...${NC}"
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo -e "${RED}❌ Fichier .env introuvable${NC}"
  echo "   Créez un fichier .env à partir de env.example et remplissez-le"
  exit 1
fi

# Source .env en mode sécurisé (ignorer les commentaires et lignes vides)
# Gère les valeurs avec ou sans guillemets
set -a
while IFS='=' read -r key value || [ -n "$key" ]; do
  # Ignorer les commentaires et lignes vides
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue
  
  # Nettoyer la clé (supprimer les espaces)
  key=$(echo "$key" | xargs)
  
  # Nettoyer la valeur (supprimer les guillemets et espaces)
  value=$(echo "$value" | sed -e 's/^["'\'']//' -e 's/["'\'']$//' | xargs)
  
  # Exporter la variable
  export "$key=$value"
done < <(grep -v '^#' "$PROJECT_ROOT/.env" | grep -v '^$' | grep '=')
set +a

# Vérifier que les secrets requis sont présents dans .env ou dans Secret Manager
MISSING_SECRETS=()
MISSING_IN_ENV=()

# Fonction pour vérifier si un secret existe dans Secret Manager
secret_exists() {
  local SECRET_NAME=$1
  gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1
}

if [ -z "${SOREGIES_USERNAME:-}" ]; then
  if ! secret_exists "soregies-username"; then
    MISSING_SECRETS+=("SOREGIES_USERNAME")
  else
    MISSING_IN_ENV+=("SOREGIES_USERNAME (existe dans Secret Manager)")
  fi
fi

if [ -z "${SOREGIES_PASSWORD:-}" ]; then
  if ! secret_exists "soregies-password"; then
    MISSING_SECRETS+=("SOREGIES_PASSWORD")
  else
    MISSING_IN_ENV+=("SOREGIES_PASSWORD (existe dans Secret Manager)")
  fi
fi

if [ -z "${API_KEY:-}" ]; then
  if ! secret_exists "api-key"; then
    MISSING_SECRETS+=("API_KEY")
  else
    MISSING_IN_ENV+=("API_KEY (existe dans Secret Manager)")
  fi
fi

# Afficher les avertissements pour les secrets manquants dans .env mais présents dans Secret Manager
if [ ${#MISSING_IN_ENV[@]} -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Secrets manquants dans .env mais présents dans Secret Manager:${NC}"
  for secret in "${MISSING_IN_ENV[@]}"; do
    echo "   - $secret"
  done
  echo -e "${YELLOW}   ℹ️  Les secrets existants seront utilisés, pas de mise à jour${NC}"
fi

# Erreur seulement si les secrets n'existent ni dans .env ni dans Secret Manager
if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
  echo -e "${RED}❌ Secrets manquants (ni dans .env ni dans Secret Manager):${NC}"
  for secret in "${MISSING_SECRETS[@]}"; do
    echo "   - $secret"
  done
  echo -e "${RED}   Veuillez les ajouter dans .env ou les créer dans Secret Manager${NC}"
  exit 1
fi

# Fonction pour créer un secret (appelée uniquement si le secret n'existe pas)
create_secret() {
  local SECRET_NAME=$1
  local SECRET_VALUE=$2
  local RESULT=0
  
  echo -e "${YELLOW}   ➕ Création du secret: ${SECRET_NAME}${NC}"
  echo -n "$SECRET_VALUE" | gcloud secrets create "$SECRET_NAME" --data-file=- --project="$PROJECT_ID" 2>&1
  RESULT=$?
  
  if [ $RESULT -ne 0 ]; then
    echo -e "${RED}   ❌ Erreur lors de la création du secret: ${SECRET_NAME}${NC}"
    return 1
  else
    echo -e "${GREEN}   ✅ Secret ${SECRET_NAME} créé${NC}"
    return 0
  fi
}

# Gérer les secrets dans Secret Manager (seulement si présents dans .env)
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}🔐 Configuration des secrets dans Secret Manager...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

SECRET_ERRORS=0
SECRETS_UPDATED=0

# Ne créer que les secrets qui n'existent pas
# Si un secret existe déjà, on ne le modifie pas (même si une valeur est présente dans .env)
if secret_exists "soregies-username"; then
  echo -e "${YELLOW}   ⏭️  soregies-username: existe déjà dans Secret Manager, pas de modification${NC}"
elif [ -n "${SOREGIES_USERNAME:-}" ]; then
  # Créer seulement si le secret n'existe pas et qu'une valeur est fournie
  create_secret "soregies-username" "$SOREGIES_USERNAME" && SECRETS_UPDATED=$((SECRETS_UPDATED + 1)) || SECRET_ERRORS=$((SECRET_ERRORS + 1))
else
  echo -e "${YELLOW}   ⏭️  soregies-username: sera créé lors du premier déploiement ou existe déjà${NC}"
fi

if secret_exists "soregies-password"; then
  echo -e "${YELLOW}   ⏭️  soregies-password: existe déjà dans Secret Manager, pas de modification${NC}"
elif [ -n "${SOREGIES_PASSWORD:-}" ]; then
  # Créer seulement si le secret n'existe pas et qu'une valeur est fournie
  create_secret "soregies-password" "$SOREGIES_PASSWORD" && SECRETS_UPDATED=$((SECRETS_UPDATED + 1)) || SECRET_ERRORS=$((SECRET_ERRORS + 1))
else
  echo -e "${YELLOW}   ⏭️  soregies-password: sera créé lors du premier déploiement ou existe déjà${NC}"
fi

# api-key est partagée entre tous les bots du projet
# On ne la met jamais à jour si elle existe déjà
if secret_exists "api-key"; then
  echo -e "${YELLOW}   ⏭️  api-key: existe déjà dans Secret Manager (partagée entre tous les bots), pas de modification${NC}"
elif [ -n "${API_KEY:-}" ]; then
  # Créer seulement si elle n'existe pas et qu'une valeur est fournie
  create_secret "api-key" "$API_KEY" && SECRETS_UPDATED=$((SECRETS_UPDATED + 1)) || SECRET_ERRORS=$((SECRET_ERRORS + 1))
else
  echo -e "${YELLOW}   ⏭️  api-key: sera créée lors du premier déploiement ou existe déjà${NC}"
fi

if [ $SECRET_ERRORS -gt 0 ]; then
  echo ""
  echo -e "${RED}❌ Erreurs lors de la configuration des secrets${NC}"
  echo "   Vérifiez vos permissions GCP (Secret Manager Admin) et réessayez"
  exit 1
fi

if [ $SECRETS_UPDATED -gt 0 ]; then
  echo ""
  echo -e "${GREEN}✅ ${SECRETS_UPDATED} secret(s) créé(s) dans Secret Manager${NC}"
else
  echo ""
  echo -e "${GREEN}✅ Tous les secrets existent déjà dans Secret Manager (aucune modification)${NC}"
fi

# Générer un tag basé sur le timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
TAG="${TIMESTAMP}-${GIT_SHA}"

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  Projet: ${PROJECT_ID}"
echo "  Service: ${SERVICE_NAME}"
echo "  Région: ${REGION}"
echo "  Image: ${IMAGE_NAME}"
echo "  Tag: ${TAG}"
echo ""

# Build de l'image Docker
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}🔨 Build de l'image Docker...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

docker build \
  --platform linux/amd64 \
  -t ${IMAGE_NAME}:${TAG} \
  -t ${IMAGE_NAME}:latest \
  .

if [ $? -ne 0 ]; then
  echo ""
  echo -e "${RED}❌ Erreur lors du build Docker${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Build réussi !${NC}"

# Optionnel : Tester l'image en local
# Vérifier si le script est exécuté en mode non-interactif (variable d'environnement)
if [ "${SKIP_LOCAL_TEST:-}" = "true" ]; then
  echo -e "${YELLOW}⏭️  Test local ignoré (SKIP_LOCAL_TEST=true)${NC}"
  TEST_LOCAL=false
else
read -p "Voulez-vous tester l'image en local avant de déployer ? (o/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Oo]$ ]]; then
    TEST_LOCAL=true
  else
    TEST_LOCAL=false
  fi
fi

if [ "$TEST_LOCAL" = "true" ]; then
  echo ""
  echo -e "${YELLOW}🧪 Test de l'image en local...${NC}"
  echo "   Port: 8080"
  echo "   Health check: http://localhost:8080/health"
  echo "   Ctrl+C pour arrêter"
  echo ""
  
  # Lancer le conteneur en arrière-plan avec les vraies valeurs depuis .env
  CONTAINER_ID=$(docker run -d -p 8080:8080 \
    -e PORT=8080 \
    -e SOREGIES_USERNAME="${SOREGIES_USERNAME}" \
    -e SOREGIES_PASSWORD="${SOREGIES_PASSWORD}" \
    -e API_KEY="${API_KEY}" \
    -e NODE_ENV="production" \
    ${IMAGE_NAME}:${TAG})
  
  echo "   Conteneur démarré: ${CONTAINER_ID:0:12}"
  echo ""
  
  # Attendre que le serveur démarre
  echo -e "${YELLOW}⏳ Attente du démarrage du serveur...${NC}"
  sleep 3
  
  # Tester le health check
  if curl -s http://localhost:8080/health > /dev/null; then
    echo -e "${GREEN}✅ Serveur accessible sur http://localhost:8080/health${NC}"
    echo ""
    echo "   Réponse du health check:"
    curl -s http://localhost:8080/health | jq . 2>/dev/null || curl -s http://localhost:8080/health
    echo ""
  else
    echo -e "${YELLOW}⚠️  Le serveur ne répond pas encore, mais le conteneur tourne${NC}"
    echo "   Vérifiez les logs avec: docker logs ${CONTAINER_ID:0:12}"
    echo ""
  fi
  
  echo -e "${YELLOW}📋 Le conteneur continue de tourner en arrière-plan${NC}"
  echo "   Pour voir les logs: docker logs -f ${CONTAINER_ID:0:12}"
  echo "   Pour arrêter: docker stop ${CONTAINER_ID:0:12}"
  echo ""
  
  read -p "Test terminé. Arrêter le conteneur et continuer le déploiement ? (o/N) " -n 1 -r
  echo ""
  
  # Arrêter le conteneur
  docker stop ${CONTAINER_ID} > /dev/null 2>&1
  echo -e "${GREEN}✅ Conteneur arrêté${NC}"
  echo ""
  
  # Demander confirmation pour continuer le déploiement
  if [ "${SKIP_LOCAL_TEST:-}" != "true" ]; then
    read -p "Continuer le déploiement ? (o/N) " -n 1 -r
    echo ""
  if [[ ! $REPLY =~ ^[Oo]$ ]]; then
    echo -e "${YELLOW}⏸️  Déploiement annulé${NC}"
    exit 0
    fi
  fi
fi

# Push vers Artifact Registry
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📤 Push vers Artifact Registry...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

docker push ${IMAGE_NAME}:${TAG}
docker push ${IMAGE_NAME}:latest

if [ $? -ne 0 ]; then
  echo ""
  echo -e "${RED}❌ Erreur lors du push vers Artifact Registry${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Images poussées avec succès !${NC}"

# Vérifier que les secrets existent dans Secret Manager avant le déploiement
echo ""
echo -e "${YELLOW}🔍 Vérification des secrets dans Secret Manager...${NC}"
MISSING_SECRETS_IN_GCP=()
for secret_name in "soregies-username" "soregies-password" "api-key"; do
  if ! gcloud secrets describe "$secret_name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    MISSING_SECRETS_IN_GCP+=("$secret_name")
  fi
done

if [ ${#MISSING_SECRETS_IN_GCP[@]} -gt 0 ]; then
  echo -e "${RED}❌ Secrets manquants dans Secret Manager:${NC}"
  for secret in "${MISSING_SECRETS_IN_GCP[@]}"; do
    echo "   - $secret"
  done
  echo ""
  echo "   Le script a tenté de les créer, mais il y a eu une erreur."
  echo "   Vérifiez vos permissions GCP et réessayez."
  exit 1
fi

echo -e "${GREEN}✅ Tous les secrets sont présents dans Secret Manager${NC}"

# Déploiement sur Cloud Run
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}🚀 Déploiement sur Cloud Run...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Configuration Cloud Run — NE PAS remettre --min-instances à 1 sans raison.
# Le trafic est en rafales (batchs à heures connues), et le cold-start mesuré
# est de ~5s (boot conteneur ~1s + lancement Chromium ~3s), sur un budget de 300s.
# Garder min=0 = scale-to-zero ⇒ ~2 €/mois au lieu de ~95 €/mois pour une instance
# allumée 24/7. Seule la 1ère requête d'un batch paie les ~5s ; les suivantes
# réutilisent l'instance chaude. Les flags --no-cpu-throttling / --cpu-boost / gen2
# et l'image Playwright pinnée (Dockerfile) sont les vrais correctifs de stabilité Chromium.
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:${TAG} \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --min-instances 0 \
  --concurrency 1 \
  --no-cpu-throttling \
  --cpu-boost \
  --execution-environment=gen2 \
  --set-env-vars NODE_ENV=production \
  --update-secrets SOREGIES_USERNAME=soregies-username:latest,SOREGIES_PASSWORD=soregies-password:latest,API_KEY=api-key:latest \
  --project ${PROJECT_ID}

if [ $? -ne 0 ]; then
  echo ""
  echo -e "${RED}❌ Erreur lors du déploiement${NC}"
  exit 1
fi

# Récupérer l'URL du service
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.url)")

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ DÉPLOIEMENT RÉUSSI !${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}🌐 URL du service:${NC}"
echo "   ${SERVICE_URL}"
echo ""
echo -e "${GREEN}🧪 Tester l'API:${NC}"
echo "   curl ${SERVICE_URL}/health"
echo ""
echo -e "${GREEN}📊 Voir les logs:${NC}"
echo "   gcloud run services logs read ${SERVICE_NAME} --region=${REGION} --project=${PROJECT_ID}"
echo ""
echo -e "${GREEN}📈 Console Cloud Run:${NC}"
echo "   https://console.cloud.google.com/run?project=${PROJECT_ID}"
echo ""


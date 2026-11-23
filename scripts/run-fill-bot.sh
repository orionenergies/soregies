#!/bin/bash

# Script de lancement du bot de test
# Ce script compile le projet, démarre le serveur et lance une requête de test

echo "🚀 === BOT DE TEST ==="
echo ""

# Déterminer le répertoire racine du projet
# Le script peut être lancé depuis n'importe quel répertoire
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DATA_FILE="$PROJECT_ROOT/test-data.json"

# Vérifier que le fichier test-data.json existe
# Ce fichier contient les données de test pour le bot
if [ ! -f "$TEST_DATA_FILE" ]; then
    echo "❌ Erreur: fichier test-data.json introuvable dans $PROJECT_ROOT"
    exit 1
fi

# Fonction pour nettoyer les processus existants
# Nettoie les processus tsx/node qui pourraient bloquer les ports
cleanup_processes() {
    echo "🧹 Nettoyage des processus existants..."
    pkill -9 -f "tsx watch" || true
    pkill -9 -f "node dist/server.js" || true
    # Compatible macOS (BSD xargs n'a pas -r, utiliser une alternative)
    PIDS_3000=$(lsof -ti :3000 2>/dev/null)
    if [ -n "$PIDS_3000" ]; then
        echo "$PIDS_3000" | xargs kill -9 2>/dev/null || true
    fi
    sleep 2
    echo "✅ Nettoyage terminé"
}

# Nettoyer d'abord pour éviter les conflits de ports
cleanup_processes

# Compiler le projet TypeScript
echo "📦 Compilation du bot principal..."
cd "$PROJECT_ROOT" || exit 1
npm run build

# Démarrer le serveur Express
echo ""
echo "🌐 Démarrage du serveur principal (port 3000)..."
echo "📄 Les logs s'affichent maintenant dans ce terminal"
echo ""

# Démarrer le serveur en arrière-plan pour voir les logs en temps réel
npm run dev &
SERVER_PID=$!

# Attendre que le serveur démarre avec retry
# Le serveur doit répondre au health check avant de continuer
echo "⏳ Attente du démarrage du serveur..."
MAX_RETRIES=10
RETRY_COUNT=0
SERVER_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        SERVER_READY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Tentative $RETRY_COUNT/$MAX_RETRIES..."
    sleep 1
done

if [ "$SERVER_READY" = false ]; then
    echo "❌ Serveur non accessible après $MAX_RETRIES tentatives"
    echo "❌ Vérifiez les logs ci-dessus pour plus de détails"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Serveur démarré (PID: $SERVER_PID)"
echo "✅ Serveur accessible sur http://localhost:3000"
echo ""

# Lancer le bot avec les données de test
echo ""
echo "🤖 Lancement du bot..."
echo "📡 Envoi de la requête POST à http://localhost:3000/run"
echo ""

# Charger la clé API depuis .env si disponible
# L'API Key est optionnelle en développement mais requise en production
ENV_FILE="$PROJECT_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
    # Extraire API_KEY depuis .env (gérer les guillemets)
    API_KEY=$(grep "^API_KEY=" "$ENV_FILE" | cut -d '=' -f2 | sed 's/^"//;s/"$//' | tr -d '"')
else
    API_KEY=""
fi

# Préparer le header API Key si disponible
if [ -z "$API_KEY" ]; then
    echo "⚠️  Avertissement: API_KEY non trouvée dans .env - l'authentification sera ignorée si l'API est configurée"
fi

# Envoyer la requête POST avec les données de test
echo "📤 Envoi de la requête..."
if [ -n "$API_KEY" ]; then
    RESPONSE=$(curl -X POST http://localhost:3000/run \
      -H "Content-Type: application/json" \
      -H "x-api-key: ${API_KEY}" \
      -d @"$TEST_DATA_FILE" \
      -w "\n%{http_code}" \
      --silent --show-error)
else
RESPONSE=$(curl -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d @"$TEST_DATA_FILE" \
  -w "\n%{http_code}" \
  --silent --show-error)
fi

# Extraire le code HTTP et le corps de la réponse
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Afficher le résultat
echo ""
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    # Afficher la réponse JSON
    if command -v jq &> /dev/null; then
        echo "$BODY" | jq '.'
    else
        echo "$BODY"
    fi
    echo ""
    echo "✨ Bot lancé avec succès !"
else
    echo "❌ Erreur HTTP $HTTP_CODE"
    
    # Afficher la réponse JSON
    if command -v jq &> /dev/null; then
        echo "$BODY" | jq '.'
    else
        echo "$BODY"
    fi
    echo ""
    echo "⚠️  Le serveur continue de tourner pour inspection"
fi

# Instructions pour l'utilisateur
echo ""
echo "💡 Le serveur continue de tourner dans ce terminal"
echo "💡 Vous pouvez voir tous les logs en temps réel"
echo "💡 Pour arrêter: Ctrl+C ou ./scripts/kill_servers"
echo ""
echo "🔄 Attente de nouvelles requêtes..."
wait


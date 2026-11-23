# Image Playwright pinned à la version exacte de package.json (playwright + @playwright/test)
# sur Ubuntu noble (24.04). Le tag `focal` est EOL depuis Playwright ~1.50 et entraîne
# des crashes Chromium sporadiques (SIGSEGV, zygote fork failures) car les libs système
# d'Ubuntu 20.04 sont trop vieilles pour Chromium 132+.
# IMPORTANT : ce tag DOIT correspondre à la version exacte de playwright/@playwright/test
# dans package.json — sinon le binaire Chromium attendu par npm n'est pas dans l'image.
FROM mcr.microsoft.com/playwright:v1.57.0-noble

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de configuration des dépendances
COPY package*.json ./
COPY tsconfig.json ./

# Installer toutes les dépendances (y compris devDependencies pour le build)
# npm ci installera la version exacte de @playwright/test du package-lock.json
RUN npm ci

# L'image de base contient déjà les navigateurs Playwright qui correspondent
# à la version v1.57.0 — pas besoin de réinstaller (économie de build + cohérence).

# Copier le code source
COPY src/ ./src/

# Compiler TypeScript
RUN npm run build

# Supprimer les devDependencies après le build pour réduire la taille de l'image
RUN npm prune --production

# Exposer le port (Cloud Run définit PORT via variable d'environnement)
EXPOSE 8080

# Démarrer le serveur
CMD ["npm", "start"]


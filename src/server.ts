/**
 * Serveur Express pour l'API du bot Soregies
 * Expose les endpoints /health et /run avec authentification API Key
 */
import express, { Request, Response } from 'express';
import { runBot, BotFormData } from './bot';
import { SERVER_CONFIG } from './config';
import { SERVER_CONFIG as SERVER_CONSTANTS, TIMING_CONFIG } from './constants';

const app = express();

// Middleware
app.use(express.json({ limit: '1mb' }));

// API Key Authentication Middleware
const authenticateApiKey = (req: Request, res: Response, next: express.NextFunction): void => {
  // En mode développement local, l'authentification est optionnelle
  // En production (Cloud Run), l'authentification est requise si une API Key est configurée
  const isProduction = SERVER_CONFIG.nodeEnv === 'production';
  
  // Si aucune API Key n'est configurée, on laisse passer (mode développement)
  if (!SERVER_CONFIG.apiKey) {
    if (!isProduction) {
      console.warn('⚠️  No API Key configured - authentication disabled (development mode)');
    }
    next();
    return;
  }
  
  // En mode développement, l'authentification est optionnelle même si une API Key est configurée
  if (!isProduction) {
    console.warn('⚠️  Development mode: API Key authentication is optional');
    next();
    return;
  }
  
  // En production, l'authentification est requise
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    res.status(401).json({
      status: 'error',
      message: 'Authentification requise : header x-api-key manquant',
      error: 'Missing x-api-key header',
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  if (apiKey !== SERVER_CONFIG.apiKey) {
    res.status(403).json({
      status: 'error',
      message: 'Authentification échouée : API Key invalide',
      error: 'The provided API Key is not valid',
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  // API Key valide, continuer
  next();
};

// Health check endpoint (sans authentification)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'success', 
    message: 'Orion Bot is running',
    timestamp: new Date().toISOString()
  });
});

// Bot automation endpoint (protégé par authentification)
// Timeout global pour correspondre aux limites Cloud Run
app.post('/run', authenticateApiKey, async (req: Request, res: Response): Promise<void> => {
  // Timeout global depuis les constantes
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      const timeoutSeconds = Math.floor(TIMING_CONFIG.botExecutionTimeout / 1000);
      res.status(500).json({
        status: 'error',
        message: `Timeout : la requête a dépassé ${timeoutSeconds} secondes`,
        error: `Request timeout after ${timeoutSeconds} seconds`,
        timestamp: new Date().toISOString()
      });
    }
  }, TIMING_CONFIG.botExecutionTimeout);

  try {
    const formData: BotFormData = req.body;

    console.log('🚀 Starting bot automation...');
    const result = await runBot(formData);

    const httpStatus = result.result === 'error' ? 500 : 200;
    res.status(httpStatus).json(result);
    clearTimeout(timeout);
    
  } catch (error) {
    console.error('Unexpected error in /run endpoint:', error);

    // Erreur inattendue dans le serveur (ex: exception non gérée)
    // Toujours renvoyer 500 pour les erreurs serveur
    if (!res.headersSent) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Une erreur serveur est survenue lors du traitement de votre demande.';

    res.status(500).json({
      status: 'error',
        message: errorMessage,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    }
    
    clearTimeout(timeout);
  }
});

// 404 handler
app.use('*', (_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    availableEndpoints: ['GET /health', 'POST /run']
  });
});

// Error handling middleware
app.use((error: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: error.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
// Cloud Run requires listening on 0.0.0.0, not just localhost
const HOST = process.env['HOST'] || SERVER_CONSTANTS.defaultHost;
app.listen(SERVER_CONFIG.port, HOST, () => {
  console.log(`🚀 Orion Bot server running on ${HOST}:${SERVER_CONFIG.port}`);
  console.log(`📊 Health check: http://${HOST}:${SERVER_CONFIG.port}/health`);
  console.log(`🤖 Bot automation: POST http://${HOST}:${SERVER_CONFIG.port}/run`);
  console.log(`🌍 Environment: ${SERVER_CONFIG.nodeEnv}`);
});

export default app;


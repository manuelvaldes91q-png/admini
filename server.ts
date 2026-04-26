import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { initDB } from './src/lib/db.js';
import apiRouter from './src/api/router.js';
import { initBot } from './src/lib/bot.js';
import { reconcileClientsWithMikrotik } from './src/lib/mikrotik.js';

dotenv.config();

async function startServer() {
  const app = express();
  // Fixed priority: process.env.PORT || 3000
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

  console.log(`----------------------------------------`);
  console.log(`ISP Manager Starting...`);
  console.log(`Mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`Port: ${PORT}`);
  console.log(`Environment: ${typeof (globalThis as any).Bun !== 'undefined' ? 'Bun' : 'Node.js'}`);
  console.log(`----------------------------------------`);

  // Initialize Database
  try {
    console.log('Initializing Database...');
    initDB();
    console.log('Database initialized successfully.');
  } catch (dbErr) {
    console.error('FAILED to initialize database:', dbErr);
  }

  // Initialize Telegram Bot
  await initBot();

  // Background Sync: Reconcile local DB with Mikrotik every 30 seconds
  setInterval(async () => {
    try {
      await reconcileClientsWithMikrotik();
    } catch (e) {
      // Ignore background errors
    }
  }, 30000);

  app.use(cors());
  app.use(cookieParser());
  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', mode: isProduction ? 'production' : 'development' });
  });

  app.use('/api', apiRouter);

  // Vite middleware or static serving
  let vite: any = null;
  if (!isProduction) {
    try {
      console.log('Loading Vite middleware...');
      const { createServer } = await import('vite');
      vite = await createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error('Failed to load Vite middleware:', e);
    }
  } else {
    // In production, we serve static files from /dist
    const publicPath = path.join(process.cwd(), 'dist');
    console.log(`Serving static files from: ${publicPath}`);
    app.use(express.static(publicPath));
  }

  // Final catch-all for SPA (must be AFTER api routes and vite/static middlewares)
  app.get('*', async (req, res) => {
    // Ignore API requests that weren't handled
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    
    // In production, serve the built index.html
    if (isProduction) {
      const indexPath = path.join(process.cwd(), 'dist', 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        console.error(`ERROR: Production index.html NOT FOUND at ${indexPath}`);
        res.status(500).send('Error de producción: La carpeta "dist" no contiene index.html. Por favor ejecuta "npm run build".');
      }
    } else {
      // In dev, if Vite middleware somehow missed it, try regular static serve if it exists
      res.status(404).send('Vite cargando... Si el error persiste, refresca la página. (Error 404)');
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server successfully running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL: Failed to start server:', err);
  process.exit(1);
});

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { initDB } from './src/lib/db.js';
import apiRouter from './src/api/router.js';
import { initBot } from './src/lib/bot.js';

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

  app.use(cors());
  app.use(cookieParser());
  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', mode: isProduction ? 'production' : 'development' });
  });

  app.use('/api', apiRouter);

  // Vite middleware or static serving
  if (!isProduction) {
    try {
      console.log('Loading Vite middleware...');
      // Dynamic import to avoid loading Vite in production bundle
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error('Failed to load Vite. If this is production, please use NODE_ENV=production or --production flag.');
      throw e;
    }
  } else {
    // In production, we serve static files from /dist
    const publicPath = path.join(process.cwd(), 'dist');
    console.log(`Serving static files from: ${publicPath}`);
    app.use(express.static(publicPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server successfully running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL: Failed to start server:', err);
  process.exit(1);
});

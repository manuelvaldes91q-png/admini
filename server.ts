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
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

  // Initialize Database
  initDB();

  // Initialize Telegram Bot
  await initBot();

  app.use(cors());
  app.use(cookieParser());
  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', apiRouter);

  // Vite middleware or static serving
  if (process.env.NODE_ENV !== 'production') {
    // Dynamic import to avoid loading Vite in production bundle
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, we serve static files from /dist
    // Note: __dirname is available in CJS
    const publicPath = path.join(process.cwd(), 'dist');
    app.use(express.static(publicPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL: Failed to start server:', err);
  process.exit(1);
});

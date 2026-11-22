
import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import dotenv from 'dotenv';

import { BotDatabase } from './backend/database/db.js';
import { SmartBotWorker } from './backend/bot/botWorker.js';
import { createApiRouter } from './backend/routes/api.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignored
}

dotenv.config();

async function startServer() {
  const app = express();

  // Use deployment platform's assigned port
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // Initialize Database & Worker
  const db = new BotDatabase();
  const worker = new SmartBotWorker(db);

  // API Routes FIRST
  const apiRouter = createApiRouter(worker);
  app.use('/api', apiRouter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      exchange: 'Delta Exchange',
      timestamp: new Date().toISOString(),
      botStatus: worker.getStatus().botStatus,
    });
  });

  // API Catch-All
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.originalUrl || req.url}`,
    });
  });

  // Development vs Production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    app.use(express.static(distPath));

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start server
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[Delta Smart Trading Bot] Running on port ${PORT}`
    );

    // Start worker after server is listening
    worker.start();
  });

  server.on('error', (err) => {
    console.error('[Delta Smart Trading Bot] Server error:', err);
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error('[Delta Smart Trading Bot] Fatal server startup error:', err);
  process.exit(1);
});

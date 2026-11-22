
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

  // Changed server port
  const PORT = 4000;
  const HOST = '0.0.0.0';

  console.log('[Startup Diagnostics]', {
    PORT,
    HOST,
    NODE_ENV: process.env.NODE_ENV,
    PID: process.pid,
  });

  app.use(cors());
  app.use(express.json());

  // Initialize Database & Worker
  const db = new BotDatabase();
  const worker = new SmartBotWorker(db);

  // API Routes
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

  // Development / Production frontend
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

  // Start Express server
  const server = app.listen(PORT, HOST, () => {
    console.log(
      `[Delta Smart Trading Bot] Running on http://${HOST}:${PORT}`
    );

    worker.start().catch((err) => {
      console.error('[SmartBotWorker] Startup error:', err);
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[Delta Smart Trading Bot] Server error:', err);
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error(
    '[Delta Smart Trading Bot] Fatal startup error:',
    err
  );
  process.exit(1);
});

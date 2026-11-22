
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

  // Use hosting provider's assigned port
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = '0.0.0.0';

  app.use(cors());
  app.use(express.json());

  // Initialize database and worker
  const db = new BotDatabase();
  const worker = new SmartBotWorker(db);

  // API routes
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

  // API fallback
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Development / production frontend
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

  // Start server only once
  const server = app.listen(PORT, HOST, async () => {
    console.log(
      `[Delta Smart Trading Bot] Running on ${HOST}:${PORT}`
    );

    try {
      await worker.start();
      console.log('[Delta Smart Trading Bot] Worker started');
    } catch (error) {
      console.error('[Delta Smart Trading Bot] Worker startup failed:', error);
    }
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error('[Delta Smart Trading Bot] Server error:', error);

    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    }

    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[Delta Smart Trading Bot] Shutting down...');

    server.close(() => {
      console.log('[Delta Smart Trading Bot] HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(1);
    }, 10000).unref();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error(
    '[Delta Smart Trading Bot] Fatal server startup error:',
    err
  );
  process.exit(1);
});

// server/index.js
// Agios Pipeline Compiler — Express server entry point

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { registerAllStages } from './pipeline/StageRegistry.js';
import { initStore } from './data/PersistentSessionStore.js';
import compileRoutes from './routes/compile.js';
import sessionRoutes from './routes/sessions.js';

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
    ];

// Middleware
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'Agios Pipeline Compiler',
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/compile', compileRoutes);
app.use('/api/sessions', sessionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Initialize storage, register pipeline stages, and start server
initStore().then(() => {
  registerAllStages();
  startServer(Number(PORT));
}).catch(err => {
  console.error('Failed to initialize session store:', err);
  process.exit(1);
});

function startServer(port, retries = 3) {
  const server = app.listen(port);
  
  server.on('listening', () => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║   🚀  Agios Pipeline Compiler v1.0.0    ║`);
    console.log(`  ║   📡  http://localhost:${port}              ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      console.warn(`[Server] Port ${port} in use, trying ${port + 1}...`);
      server.close();
      startServer(port + 1, retries - 1);
    } else {
      console.error('[Server] Fatal error:', err.message);
      process.exit(1);
    }
  });
}

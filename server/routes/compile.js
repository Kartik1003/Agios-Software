// server/routes/compile.js
// Compile routes — POST to run pipeline, GET for SSE progress

import { Router } from 'express';
import { runPipeline, createPipelineEmitter } from '../pipeline/PipelineRunner.js';
import {
  createSession,
  updateStageStart,
  updateStageComplete,
  completeSession,
  failSession,
  getSession,
  updateEnforcementLog,
  addRepairRecord,
} from '../data/PersistentSessionStore.js';
import { CompilerAuditTrail } from '../pipeline/CompilerAuditService.js';

const router = Router();

// Active SSE connections per session
const sseConnections = new Map();

/**
 * POST /api/compile
 * Start a new compilation run
 */
router.post('/', async (req, res) => {
  const { raw_input } = req.body;

  if (!raw_input || typeof raw_input !== 'string' || raw_input.trim().length === 0) {
    return res.status(400).json({
      error: 'Missing or empty raw_input field',
      suggestion: 'Provide a natural language description of the application you want to build.',
    });
  }

  // Create session (await for persistence)
  const session = await createSession(raw_input.trim());

  // Create audit trail
  const audit = new CompilerAuditTrail(session.id, raw_input.trim());

  // Create event emitter for progress tracking
  const emitter = createPipelineEmitter();

  // Wire up SSE broadcasting and persistence
  emitter.on('stage:start', async (data) => {
    await updateStageStart(session.id, data.stage);
    audit.recordStageInput(data.stage, data.name, data.input || data.stageOutputs);
    broadcastSSE(session.id, 'stage:start', data);
  });

  emitter.on('stage:complete', async (data) => {
    await updateStageComplete(session.id, data.stage, data.data, data.elapsed);
    broadcastSSE(session.id, 'stage:complete', data);
  });
  
  emitter.on('stage:repair_record', async (data) => {
    audit.recordRepair(data.stage, data.record);
    await addRepairRecord(session.id, data.record);
    broadcastSSE(session.id, 'stage:repair_record', data);
  });
  
  emitter.on('stage:enforced', async (data) => {
    await updateEnforcementLog(session.id, data.stage, data.enforcement);
    audit.recordStageOutput(data.stage, data.name, data.data, data.enforcement, data.elapsed);
  });

  emitter.on('stage:error', (data) => {
    broadcastSSE(session.id, 'stage:error', data);
  });

  // Return session ID immediately, run pipeline async
  res.status(202).json({
    session_id: session.id,
    status: 'running',
    stream_url: `/api/compile/${session.id}/stream`,
    message: 'Pipeline compilation started. Connect to the stream URL for real-time progress.',
  });

  // Run pipeline in background
  try {
    const result = await runPipeline(session.id, raw_input.trim(), emitter);

    if (result.success) {
      await completeSession(session.id, result.finalOutput, result.timings, result.reliabilityScore, 'PASSED');
      audit.recordCompilationResult('PASSED');
      if (result.reliabilityScore) audit.recordReliabilityScore(result.reliabilityScore);
      await audit.saveAuditFile();
      
      broadcastSSE(session.id, 'pipeline:complete', {
        session_id: session.id,
        timings: result.timings,
        finalOutput: result.finalOutput,
        reliabilityScore: result.reliabilityScore,
        contractResult: result.contractResult
      });
    } else {
      await failSession(session.id, result.error, result.failedStage);
      audit.recordCompilationResult('FAILED');
      await audit.saveAuditFile();

      broadcastSSE(session.id, 'pipeline:error', {
        session_id: session.id,
        failedStage: result.failedStage,
        error: result.error,
      });
    }
  } catch (err) {
    await failSession(session.id, { message: err.message }, null);
    audit.recordCompilationResult('FAILED');
    await audit.saveAuditFile();

    broadcastSSE(session.id, 'pipeline:error', {
      session_id: session.id,
      error: { message: err.message },
    });
  }

  // Clean up SSE connections after pipeline finishes
  setTimeout(() => {
    cleanupSSE(session.id);
  }, 5000);
});

/**
 * GET /api/compile/:id/stream
 * SSE endpoint for real-time pipeline progress
 */
router.get('/:id/stream', (req, res) => {
  const { id } = req.params;
  const session = getSession(id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial status
  res.write(`data: ${JSON.stringify({ event: 'connected', session_id: id, status: session.status })}\n\n`);

  // If already completed, send the final data immediately
  if (session.status === 'completed') {
    // Send each stage
    for (const [stageNum, output] of Object.entries(session.stages)) {
      res.write(`data: ${JSON.stringify({
        event: 'stage:complete',
        stage: parseInt(stageNum),
        data: output,
        elapsed: session.timings[stageNum] || 0,
      })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({
      event: 'pipeline:complete',
      session_id: id,
      finalOutput: session.finalSpec,
    })}\n\n`);
    res.end();
    return;
  }

  if (session.status === 'failed') {
    res.write(`data: ${JSON.stringify({
      event: 'pipeline:error',
      session_id: id,
      error: session.error,
    })}\n\n`);
    res.end();
    return;
  }

  // Register SSE connection for live updates
  if (!sseConnections.has(id)) {
    sseConnections.set(id, []);
  }
  sseConnections.get(id).push(res);

  // Cleanup on disconnect
  req.on('close', () => {
    const connections = sseConnections.get(id);
    if (connections) {
      const idx = connections.indexOf(res);
      if (idx !== -1) connections.splice(idx, 1);
      if (connections.length === 0) sseConnections.delete(id);
    }
  });
});

/**
 * GET /api/compile/:id
 * Get the result of a completed compilation
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const session = getSession(id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

// Helper: broadcast SSE event to all connected clients
function broadcastSSE(sessionId, event, data) {
  const connections = sseConnections.get(sessionId);
  if (!connections) return;

  const message = `data: ${JSON.stringify({ event, ...data })}\n\n`;
  for (const res of connections) {
    try {
      res.write(message);
    } catch { /* client disconnected */ }
  }
}

// Helper: cleanup SSE connections
function cleanupSSE(sessionId) {
  const connections = sseConnections.get(sessionId);
  if (!connections) return;

  for (const res of connections) {
    try { res.end(); } catch { /* ignore */ }
  }
  sseConnections.delete(sessionId);
}

export default router;

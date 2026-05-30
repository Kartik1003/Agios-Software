// server/routes/sessions.js
// Session/history routes

import { Router } from 'express';
import { listSessions, getSession, getHistory } from '../data/PersistentSessionStore.js';

const router = Router();

/**
 * GET /api/sessions
 * List all pipeline sessions (run history)
 */
router.get('/', (req, res) => {
  const history = getHistory();
  res.json({
    total: history.length,
    sessions: history,
  });
});

/**
 * GET /api/sessions/:id
 * Get full session details with all stage outputs
 */
router.get('/:id', (req, res) => {
  const session = getSession(req.params.id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

export default router;

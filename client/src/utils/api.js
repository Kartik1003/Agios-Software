// client/src/utils/api.js
// API client for communicating with the Agios backend

const API_BASE = 'import.meta.env.VITE_API_URL';

/**
 * Start a new compilation
 * @param {string} rawInput - NL description
 * @returns {Promise<{ session_id: string, stream_url: string }>}
 */
export async function compile(rawInput) {
  const res = await fetch(`${API_BASE}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_input: rawInput }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Get a session by ID
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getSession(id) {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  if (!res.ok) throw new Error('Session not found');
  return res.json();
}

/**
 * List all sessions (history)
 * @returns {Promise<{ total: number, sessions: object[] }>}
 */
export async function getSessions() {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

/**
 * Connect to SSE stream for real-time pipeline progress
 * @param {string} sessionId
 * @param {object} handlers - { onStageStart, onStageComplete, onStageError, onPipelineComplete, onPipelineError }
 * @returns {EventSource}
 */
export function streamProgress(sessionId, handlers) {
  const es = new EventSource(`${API_BASE}/compile/${sessionId}/stream`);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const eventType = data.event;

      switch (eventType) {
        case 'connected':
          handlers.onConnected?.(data);
          break;
        case 'stage:start':
          handlers.onStageStart?.(data);
          break;
        case 'stage:complete':
          handlers.onStageComplete?.(data);
          break;
        case 'stage:error':
          handlers.onStageError?.(data);
          break;
        case 'pipeline:complete':
          handlers.onPipelineComplete?.(data);
          es.close();
          break;
        case 'pipeline:error':
          handlers.onPipelineError?.(data);
          es.close();
          break;
      }
    } catch (err) {
      console.error('[SSE] Parse error:', err);
    }
  };

  es.onerror = () => {
    handlers.onError?.();
    es.close();
  };

  return es;
}

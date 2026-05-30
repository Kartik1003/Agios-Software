// server/data/PersistentSessionStore.js
// JSON file-based persistent session store.
// Drop-in replacement for the in-memory SessionStore.
// Each session is stored as a separate JSON file under server/data/sessions/.

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const GENERATED_DIR = path.join(__dirname, '..', 'generated-apps');

// In-memory cache backed by disk
let sessionsCache = new Map();
let initialized = false;

/**
 * Ensure storage directories exist and load existing sessions into cache
 */
export async function initStore() {
  if (initialized) return;
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });

  // Load existing sessions from disk into cache
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
        const session = JSON.parse(raw);
        sessionsCache.set(session.id, session);
      } catch { /* skip corrupt files */ }
    }
    console.log(`[SessionStore] Loaded ${sessionsCache.size} sessions from disk`);
  } catch { /* directory might be empty */ }

  initialized = true;
}

/**
 * Persist a single session to disk
 */
async function persist(session) {
  const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

// ─────────────────────────────────────────────
// Core API (same surface as original SessionStore)
// ─────────────────────────────────────────────

/**
 * Create a new pipeline session
 * @param {string} rawInput
 * @returns {Promise<object>} PipelineSession
 */
export async function createSession(rawInput) {
  await initStore();
  const session = {
    id: uuidv4(),
    rawInput,
    status: 'pending',
    currentStage: null,
    stages: {},
    timings: {},
    enforcementLogs: {},
    repairHistory: [],
    reliabilityScore: null,
    compilationStatus: null,
    finalSpec: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  sessionsCache.set(session.id, session);
  await persist(session);
  return session;
}

/**
 * Get a session by ID
 * @param {string} id
 * @returns {object|null}
 */
export function getSession(id) {
  return sessionsCache.get(id) || null;
}

/**
 * Update a session's current stage status
 */
export async function updateStageStart(id, stageNumber) {
  const session = sessionsCache.get(id);
  if (session) {
    session.status = 'running';
    session.currentStage = stageNumber;
    await persist(session);
  }
}

/**
 * Update a session with completed stage output
 */
export async function updateStageComplete(id, stageNumber, output, elapsed) {
  const session = sessionsCache.get(id);
  if (session) {
    session.stages[stageNumber] = output;
    session.timings[stageNumber] = elapsed;
    await persist(session);
  }
}

/**
 * Store enforcement log for a stage
 */
export async function updateEnforcementLog(id, stageNumber, log) {
  const session = sessionsCache.get(id);
  if (session) {
    session.enforcementLogs[stageNumber] = log;
    await persist(session);
  }
}

/**
 * Append a repair record
 */
export async function addRepairRecord(id, record) {
  const session = sessionsCache.get(id);
  if (session) {
    session.repairHistory.push(record);
    await persist(session);
  }
}

/**
 * Mark a session as completed
 */
export async function completeSession(id, finalSpec, allTimings, reliabilityScore, compilationStatus) {
  const session = sessionsCache.get(id);
  if (session) {
    session.status = 'completed';
    session.finalSpec = finalSpec;
    session.timings = { ...session.timings, ...allTimings };
    session.reliabilityScore = reliabilityScore || null;
    session.compilationStatus = compilationStatus || null;
    session.completedAt = new Date().toISOString();
    session.currentStage = null;
    await persist(session);
  }
}

/**
 * Mark a session as failed
 */
export async function failSession(id, error, failedStage) {
  const session = sessionsCache.get(id);
  if (session) {
    session.status = 'failed';
    session.error = error;
    session.currentStage = failedStage;
    session.completedAt = new Date().toISOString();
    await persist(session);
  }
}

/**
 * List all sessions, sorted by creation time descending
 */
export function listSessions() {
  return [...sessionsCache.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Get run history summary
 */
export function getHistory() {
  return listSessions().map(s => ({
    id: s.id,
    rawInput: s.rawInput.substring(0, 120) + (s.rawInput.length > 120 ? '...' : ''),
    status: s.status,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    overallStatus: s.finalSpec?.validation_report?.overall_status || null,
    confidenceScore: s.finalSpec?.validation_report?.confidence_score || null,
    projectName: s.finalSpec?.final_spec?.project_name || null,
    reliabilityScore: s.reliabilityScore || null,
    compilationStatus: s.compilationStatus || null,
  }));
}

// ─────────────────────────────────────────────
// Extended API (new methods per spec)
// ─────────────────────────────────────────────

/**
 * Save a full pipeline run (alias for persistence — session is always persisted)
 */
export async function saveRun(id) {
  const session = sessionsCache.get(id);
  if (session) await persist(session);
}

/**
 * Load a pipeline run from disk by ID
 */
export async function loadRun(id) {
  await initStore();
  const cached = sessionsCache.get(id);
  if (cached) return cached;

  try {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    const raw = await fs.readFile(filePath, 'utf-8');
    const session = JSON.parse(raw);
    sessionsCache.set(id, session);
    return session;
  } catch {
    return null;
  }
}

/**
 * Save an artifact file for a session
 * @param {string} sessionId
 * @param {string} relativePath - e.g. 'frontend/pages/Home.jsx'
 * @param {string} content
 */
export async function saveArtifact(sessionId, relativePath, content) {
  const artifactDir = path.join(GENERATED_DIR, sessionId);
  const fullPath = path.join(artifactDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

/**
 * Load an artifact file
 */
export async function loadArtifact(sessionId, relativePath) {
  const fullPath = path.join(GENERATED_DIR, sessionId, relativePath);
  try {
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * List all pipeline runs (session IDs + metadata)
 */
export async function listRuns() {
  await initStore();
  return getHistory();
}

/**
 * Get the generated-apps directory for a session
 */
export function getGeneratedDir(sessionId) {
  return path.join(GENERATED_DIR, sessionId);
}

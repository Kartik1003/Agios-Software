// server/data/SessionStore.js
// In-memory session store for pipeline runs

import { v4 as uuidv4 } from 'uuid';

/**
 * @typedef {Object} PipelineSession
 * @property {string} id
 * @property {string} rawInput
 * @property {string} status - pending | running | completed | failed
 * @property {number|null} currentStage
 * @property {Object} stages - { 1: output, 2: output, ... }
 * @property {Object} timings - { 1: ms, 2: ms, ... }
 * @property {Object|null} finalSpec
 * @property {Object|null} error
 * @property {string} createdAt
 * @property {string|null} completedAt
 */

const sessions = new Map();

/**
 * Create a new pipeline session
 * @param {string} rawInput
 * @returns {PipelineSession}
 */
export function createSession(rawInput) {
  const session = {
    id: uuidv4(),
    rawInput,
    status: 'pending',
    currentStage: null,
    stages: {},
    timings: {},
    finalSpec: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  sessions.set(session.id, session);
  return session;
}

/**
 * Get a session by ID
 * @param {string} id
 * @returns {PipelineSession|null}
 */
export function getSession(id) {
  return sessions.get(id) || null;
}

/**
 * Update a session's current stage status
 */
export function updateStageStart(id, stageNumber) {
  const session = sessions.get(id);
  if (session) {
    session.status = 'running';
    session.currentStage = stageNumber;
  }
}

/**
 * Update a session with completed stage output
 */
export function updateStageComplete(id, stageNumber, output, elapsed) {
  const session = sessions.get(id);
  if (session) {
    session.stages[stageNumber] = output;
    session.timings[stageNumber] = elapsed;
  }
}

/**
 * Mark a session as completed
 */
export function completeSession(id, finalSpec, allTimings) {
  const session = sessions.get(id);
  if (session) {
    session.status = 'completed';
    session.finalSpec = finalSpec;
    session.timings = { ...session.timings, ...allTimings };
    session.completedAt = new Date().toISOString();
    session.currentStage = null;
  }
}

/**
 * Mark a session as failed
 */
export function failSession(id, error, failedStage) {
  const session = sessions.get(id);
  if (session) {
    session.status = 'failed';
    session.error = error;
    session.currentStage = failedStage;
    session.completedAt = new Date().toISOString();
  }
}

/**
 * List all sessions (run history), sorted by creation time descending
 * @returns {PipelineSession[]}
 */
export function listSessions() {
  return [...sessions.values()]
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
  }));
}

// client/src/main.js
// Agios — Main application entry point
// Wires together all components, manages state, handles SSE

import './style.css';

import { initInputPanel, setCompileLoading, resetInputPanel } from './components/InputPanel.js';
import {
  renderPipelineProgress,
  setStageActive,
  setStageComplete,
  setStageFailed,
  resetPipelineProgress,
} from './components/PipelineProgress.js';
import { setStageData, renderStageViewer, clearStageData } from './components/StageViewer.js';
import { renderFinalSpecCard } from './components/FinalSpecCard.js';
import { initHistoryPanel } from './components/HistoryPanel.js';
import { compile, streamProgress } from './utils/api.js';

// ── Section visibility helpers ──
function show(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function hide(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function resetUI() {
  hide('pipeline-section');
  hide('viewer-section');
  hide('spec-section');
  hide('error-section');
  clearStageData();
  resetPipelineProgress();
}

// ── Load a completed session from history ──
function loadSession(session) {
  resetUI();

  // Show pipeline progress
  show('pipeline-section');
  renderPipelineProgress();

  // Set stage states
  const stageNumbers = Object.keys(session.stages).map(Number).sort();
  for (const num of stageNumbers) {
    setStageComplete(num, session.timings?.[num] || 0);
    setStageData(num, session.stages[num]);
  }

  // If failed, mark the failed stage
  if (session.status === 'failed' && session.currentStage) {
    setStageFailed(session.currentStage);
  }

  // Show stage viewer
  show('viewer-section');
  renderStageViewer(stageNumbers);

  // Show final spec card if completed
  if (session.status === 'completed' && session.finalSpec) {
    show('spec-section');
    renderFinalSpecCard(session.finalSpec);
  }

  // Show error if failed
  if (session.status === 'failed' && session.error) {
    showError(session.error);
  }

  resetInputPanel();
}

// ── Show error ──
function showError(error) {
  show('error-section');
  const panel = document.getElementById('error-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="error-panel__header">
      <div class="error-panel__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div>
        <h3 class="error-panel__title">Pipeline Error — Stage ${error.stage || '?'}</h3>
        <span class="error-panel__stage">${escHTML(error.stage_name || error.error_type || 'Unknown')}</span>
      </div>
    </div>
    <div class="error-panel__body">
      <div><strong>Type:</strong> ${escHTML(error.error_type || 'unknown')}</div>
      <div><strong>Message:</strong> ${escHTML(error.message)}</div>
      ${error.field ? `<div><strong>Field:</strong> ${escHTML(error.field)}</div>` : ''}
      ${error.unresolved?.length ? `<div><strong>Unresolved:</strong> ${error.unresolved.map(u => escHTML(u)).join(', ')}</div>` : ''}
      ${error.suggestion ? `<div style="margin-top: 1rem; color: var(--color-text-accent);"><strong>Suggestion:</strong> ${escHTML(error.suggestion)}</div>` : ''}
    </div>
    <div class="error-panel__actions">
      <button class="btn btn--primary" id="btn-retry" style="font-size: 0.875rem; padding: 0.625rem 1.25rem;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Try Again
      </button>
    </div>
  `;

  document.getElementById('btn-retry')?.addEventListener('click', () => {
    hide('error-section');
    resetInputPanel();
  });
}

// ── Main compile flow ──
async function handleCompile(rawInput) {
  resetUI();
  setCompileLoading(true);

  // Show pipeline progress
  show('pipeline-section');
  renderPipelineProgress();

  const completedStages = [];

  try {
    // Start compilation
    const { session_id } = await compile(rawInput);

    // Connect to SSE stream
    streamProgress(session_id, {
      onConnected: (data) => {
        console.log('[SSE] Connected to session:', data.session_id);
      },

      onStageStart: (data) => {
        setStageActive(data.stage);
      },

      onStageComplete: (data) => {
        setStageComplete(data.stage, data.elapsed);
        completedStages.push(data.stage);

        // Store stage data and update viewer
        setStageData(data.stage, data.data);
        show('viewer-section');
        renderStageViewer(completedStages);
      },

      onStageError: (data) => {
        setStageFailed(data.stage);
      },

      onPipelineComplete: (data) => {
        setCompileLoading(false);
        resetInputPanel();

        // Show final spec card
        if (data.finalOutput) {
          show('spec-section');
          renderFinalSpecCard(data.finalOutput);

          // Also add Stage 4 to viewer
          setStageData(4, data.finalOutput);
          renderStageViewer([...completedStages, 4]);
        }
      },

      onPipelineError: (data) => {
        setCompileLoading(false);
        resetInputPanel();
        showError(data.error);
      },

      onError: () => {
        setCompileLoading(false);
        resetInputPanel();
        showError({
          stage: '?',
          error_type: 'connection_error',
          message: 'Lost connection to the server. The pipeline may still be running.',
          suggestion: 'Check that the backend server is running (see PORT in server/.env).',
        });
      },
    });
  } catch (err) {
    setCompileLoading(false);
    resetInputPanel();
    showError({
      stage: 0,
      stage_name: 'Connection',
      error_type: 'connection_error',
      message: err.message,
      suggestion: 'Make sure the backend server is running: cd server && npm run dev',
    });
  }
}

function escHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Initialize ──
document.addEventListener('DOMContentLoaded', () => {
  initInputPanel(handleCompile);
  renderPipelineProgress();
  initHistoryPanel(loadSession);
});

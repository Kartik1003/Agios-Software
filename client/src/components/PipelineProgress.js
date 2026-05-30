// client/src/components/PipelineProgress.js
// 4-stage pipeline progress indicator with animations

const STAGES = [
  { number: 1, name: 'Intent Extraction', short: 'Intent' },
  { number: 2, name: 'System Design', short: 'Design' },
  { number: 3, name: 'Schema Generation', short: 'Schema' },
  { number: 4, name: 'Refinement Layer', short: 'Refine' },
];

/**
 * Render the pipeline progress indicator
 */
export function renderPipelineProgress() {
  const container = document.getElementById('pipeline-progress');
  let html = '';

  STAGES.forEach((stage, i) => {
    html += `
      <div class="pipeline-stage" id="pipeline-stage-${stage.number}" data-stage="${stage.number}">
        <div class="pipeline-stage__node">
          <span class="pipeline-stage__number" id="stage-node-${stage.number}">${stage.number}</span>
        </div>
        <span class="pipeline-stage__label">${stage.name}</span>
        <span class="pipeline-stage__time" id="stage-time-${stage.number}"></span>
      </div>
    `;

    if (i < STAGES.length - 1) {
      html += `
        <div class="pipeline-connector" id="connector-${stage.number}">
          <div class="pipeline-connector__fill" id="connector-fill-${stage.number}"></div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

/**
 * Set a stage to active (pulsing)
 */
export function setStageActive(stageNumber) {
  const el = document.getElementById(`pipeline-stage-${stageNumber}`);
  if (el) {
    el.classList.add('pipeline-stage--active');
    el.classList.remove('pipeline-stage--complete', 'pipeline-stage--failed');
  }
}

/**
 * Set a stage to complete
 * @param {number} stageNumber
 * @param {number} elapsed - Time in ms
 */
export function setStageComplete(stageNumber, elapsed) {
  const el = document.getElementById(`pipeline-stage-${stageNumber}`);
  const nodeEl = document.getElementById(`stage-node-${stageNumber}`);
  const timeEl = document.getElementById(`stage-time-${stageNumber}`);

  if (el) {
    el.classList.remove('pipeline-stage--active');
    el.classList.add('pipeline-stage--complete');
  }

  if (nodeEl) {
    nodeEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
  }

  if (timeEl && elapsed) {
    timeEl.textContent = formatTime(elapsed);
  }

  // Fill connector
  const connector = document.getElementById(`connector-${stageNumber}`);
  if (connector) {
    connector.classList.add('pipeline-connector--complete');
  }
}

/**
 * Set a stage to failed
 */
export function setStageFailed(stageNumber) {
  const el = document.getElementById(`pipeline-stage-${stageNumber}`);
  const nodeEl = document.getElementById(`stage-node-${stageNumber}`);

  if (el) {
    el.classList.remove('pipeline-stage--active');
    el.classList.add('pipeline-stage--failed');
  }

  if (nodeEl) {
    nodeEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  }
}

/**
 * Reset all stages to initial state
 */
export function resetPipelineProgress() {
  STAGES.forEach(stage => {
    const el = document.getElementById(`pipeline-stage-${stage.number}`);
    const nodeEl = document.getElementById(`stage-node-${stage.number}`);
    const timeEl = document.getElementById(`stage-time-${stage.number}`);
    const connector = document.getElementById(`connector-${stage.number}`);

    if (el) {
      el.classList.remove('pipeline-stage--active', 'pipeline-stage--complete', 'pipeline-stage--failed');
    }
    if (nodeEl) nodeEl.textContent = stage.number;
    if (timeEl) timeEl.textContent = '';
    if (connector) connector.classList.remove('pipeline-connector--complete');
  });
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

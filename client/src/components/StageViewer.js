// client/src/components/StageViewer.js
// Tabbed JSON viewer for each stage's output

import { highlightJSON, attachToggleListeners, copyJSON } from '../utils/jsonHighlighter.js';

const STAGE_LABELS = {
  1: 'Stage 1 — Intent IR',
  2: 'Stage 2 — Architecture',
  3: 'Stage 3 — Schemas',
  4: 'Stage 4 — Refinement',
};

let stageData = {};
let activeTab = 1;

/**
 * Set data for a stage
 */
export function setStageData(stageNumber, data) {
  stageData[stageNumber] = data;
}

/**
 * Render the stage viewer with tabs
 * @param {number[]} availableStages - Which stages have data
 */
export function renderStageViewer(availableStages = []) {
  const container = document.getElementById('stage-viewer');
  if (!container) return;

  const stages = availableStages.length > 0
    ? availableStages
    : Object.keys(stageData).map(Number).sort();

  if (stages.length === 0) {
    container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--color-text-muted);">No stage data available yet.</div>';
    return;
  }

  // Ensure activeTab is valid
  if (!stages.includes(activeTab)) {
    activeTab = stages[stages.length - 1];
  }

  // Tabs
  let tabsHTML = '<div class="stage-tabs">';
  for (const num of [1, 2, 3, 4]) {
    const hasData = stages.includes(num);
    const isActive = num === activeTab;
    const classes = [
      'stage-tab',
      isActive ? 'stage-tab--active' : '',
      hasData ? 'stage-tab--complete' : '',
    ].filter(Boolean).join(' ');

    tabsHTML += `
      <button class="${classes}" data-tab="${num}" ${!hasData ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>
        <span class="stage-tab__badge"></span>
        ${STAGE_LABELS[num]}
      </button>
    `;
  }
  tabsHTML += '</div>';

  // Content
  const data = stageData[activeTab];
  let contentHTML = `
    <div class="stage-content">
      <div class="stage-content__header">
        <h3 class="stage-content__title">${STAGE_LABELS[activeTab]}</h3>
        <div class="stage-content__actions">
          <button class="btn btn--ghost btn--icon" id="btn-copy-stage" title="Copy JSON">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      </div>
      <pre class="json-viewer">${data ? highlightJSON(data) : '<span class="json-null">Loading...</span>'}</pre>
    </div>
  `;

  container.innerHTML = tabsHTML + contentHTML;

  // Attach event listeners
  container.querySelectorAll('.stage-tab:not([disabled])').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = parseInt(tab.dataset.tab);
      renderStageViewer(stages);
    });
  });

  // Toggle listeners for collapsible JSON
  const jsonViewer = container.querySelector('.json-viewer');
  if (jsonViewer) {
    attachToggleListeners(jsonViewer);
  }

  // Copy button
  const copyBtn = document.getElementById('btn-copy-stage');
  if (copyBtn && data) {
    copyBtn.addEventListener('click', async () => {
      const success = await copyJSON(data);
      if (success) {
        showToast('Copied to clipboard!', 'success');
      }
    });
  }
}

/**
 * Clear all stage data
 */
export function clearStageData() {
  stageData = {};
  activeTab = 1;
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}

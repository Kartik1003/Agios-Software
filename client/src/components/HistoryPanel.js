// client/src/components/HistoryPanel.js
// Sidebar drawer showing past compilations

import { getSessions, getSession } from '../utils/api.js';

/**
 * Initialize the history panel
 * @param {Function} onLoadSession - Called with full session object when user clicks a history item
 */
export function initHistoryPanel(onLoadSession) {
  const drawer = document.getElementById('history-drawer');
  const overlay = document.getElementById('history-overlay');
  const closeBtn = document.getElementById('btn-close-history');
  const openBtn = document.getElementById('btn-history');

  openBtn?.addEventListener('click', () => {
    drawer.classList.add('history-drawer--open');
    loadHistory(onLoadSession);
  });

  closeBtn?.addEventListener('click', () => {
    drawer.classList.remove('history-drawer--open');
  });

  overlay?.addEventListener('click', () => {
    drawer.classList.remove('history-drawer--open');
  });
}

/**
 * Load and render history list
 */
async function loadHistory(onLoadSession) {
  const listEl = document.getElementById('history-list');
  if (!listEl) return;

  try {
    const { sessions } = await getSessions();

    if (!sessions || sessions.length === 0) {
      listEl.innerHTML = `
        <div class="history-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4l3 3"/>
          </svg>
          <p class="history-empty__text">No compilations yet.<br>Run your first compilation to see history here.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = sessions.map(session => {
      const statusClass = session.overallStatus
        ? session.overallStatus.toLowerCase()
        : session.status === 'failed' ? 'fail' : session.status === 'running' ? 'running' : 'pass';

      return `
        <div class="history-item" data-session-id="${session.id}">
          <div class="history-item__header">
            <span class="history-item__name">${escHTML(session.projectName || 'Untitled')}</span>
            <span class="status-badge status-badge--${statusClass}">${session.overallStatus || session.status}</span>
          </div>
          <p class="history-item__desc">${escHTML(session.rawInput)}</p>
          <div class="history-item__footer">
            <span class="history-item__time">${formatDate(session.createdAt)}</span>
            ${session.confidenceScore != null ? `<span style="font-size: 0.75rem; color: var(--color-text-accent); font-family: var(--font-mono);">${session.confidenceScore}%</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Click handler
    listEl.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', async () => {
        const sessionId = item.dataset.sessionId;
        try {
          const fullSession = await getSession(sessionId);
          onLoadSession(fullSession);
          document.getElementById('history-drawer').classList.remove('history-drawer--open');
        } catch (err) {
          console.error('Failed to load session:', err);
        }
      });
    });

  } catch (err) {
    listEl.innerHTML = `
      <div class="history-empty">
        <p class="history-empty__text">Failed to load history.<br>Is the backend running?</p>
      </div>
    `;
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// client/src/components/FinalSpecCard.js
// Final specification summary card with confidence ring, tech chips, and next steps

import { copyJSON } from '../utils/jsonHighlighter.js';

/**
 * Render the final spec card
 * @param {object} stage4Output - The Stage 4 refinement output
 */
export function renderFinalSpecCard(stage4Output) {
  const container = document.getElementById('final-spec-card');
  if (!container || !stage4Output) return;

  const { validation_report, final_spec, cross_layer_checks, applied_refinements } = stage4Output;
  const status = validation_report.overall_status;
  const score = validation_report.confidence_score;

  const statusClass = status === 'PASS' ? 'pass' : status === 'WARN' ? 'warn' : 'fail';
  const circumference = 2 * Math.PI * 40; // radius=40

  container.innerHTML = `
    <div class="spec-card">
      <!-- Hero section -->
      <div class="spec-card__hero">
        <div class="spec-card__hero-left">
          <h2 class="spec-card__project-name">${escHTML(final_spec.project_name)}</h2>
          <span class="status-badge status-badge--${statusClass}">${status}</span>
          <span class="complexity-badge complexity-badge--${final_spec.complexity}">${final_spec.complexity}</span>
          <p class="spec-card__summary">${escHTML(final_spec.summary)}</p>
        </div>
        <div class="spec-card__hero-right">
          <div class="confidence-ring">
            <svg class="confidence-ring__svg" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="confidence-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#818CF8"/>
                  <stop offset="100%" stop-color="#06B6D4"/>
                </linearGradient>
              </defs>
              <circle class="confidence-ring__bg" cx="50" cy="50" r="40"/>
              <circle class="confidence-ring__fill" cx="50" cy="50" r="40"
                      style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${circumference};"
                      id="confidence-fill"/>
            </svg>
            <div class="confidence-ring__value" id="confidence-value">0</div>
          </div>
          <span class="confidence-label">Confidence</span>
        </div>
      </div>

      <!-- Details grid -->
      <div class="spec-card__details">
        <div class="spec-detail">
          <span class="spec-detail__label">Estimated Dev Time</span>
          <span class="spec-detail__value">${escHTML(final_spec.estimated_dev_time)}</span>
        </div>
        <div class="spec-detail">
          <span class="spec-detail__label">Team Recommendation</span>
          <span class="spec-detail__value">${escHTML(final_spec.team_size_recommendation)}</span>
        </div>
        <div class="spec-detail">
          <span class="spec-detail__label">Deployment Target</span>
          <span class="spec-detail__value">${escHTML(final_spec.deployment_target)}</span>
        </div>
        <div class="spec-detail">
          <span class="spec-detail__label">Deployment Ready</span>
          <span class="spec-detail__value">${final_spec.deployment_ready ? '✅ Yes' : '❌ No'}</span>
        </div>
        <div class="spec-detail">
          <span class="spec-detail__label">Docker Base</span>
          <span class="spec-detail__value" style="font-family: var(--font-mono); font-size: var(--text-sm);">${escHTML(final_spec.executable_config?.docker_base || 'N/A')}</span>
        </div>
        <div class="spec-detail">
          <span class="spec-detail__label">Required Env Vars</span>
          <div class="tech-chips">
            ${(final_spec.executable_config?.required_env_vars || []).map(v => `<span class="tech-chip">${escHTML(v)}</span>`).join('')}
          </div>
        </div>
      </div>

      <!-- Cross-layer checks -->
      <div class="spec-card__steps">
        <h3 class="spec-card__steps-title">Cross-Layer Validation (${cross_layer_checks?.filter(c => c.status === 'PASS').length || 0}/${cross_layer_checks?.length || 0} passed)</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0.5rem;">
          ${(cross_layer_checks || []).map(check => `
            <div class="next-step">
              <span style="flex-shrink:0; font-size: 0.875rem;">${check.status === 'PASS' ? '✅' : '❌'}</span>
              <div>
                <div style="font-size: 0.8125rem; color: var(--color-text-primary); font-weight: 500;">${escHTML(check.check)}</div>
                <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 2px;">${escHTML(check.detail)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Applied refinements -->
      ${(applied_refinements && applied_refinements.length > 0) ? `
        <div class="spec-card__steps">
          <h3 class="spec-card__steps-title">Applied Refinements (${applied_refinements.length})</h3>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${applied_refinements.map(ref => `
              <div class="next-step">
                <span style="flex-shrink:0; font-size: 0.75rem; padding: 2px 8px; border-radius: 9999px; background: var(--color-info-bg); color: var(--color-info); font-weight: 600;">${escHTML(ref.type)}</span>
                <span class="next-step__text">${escHTML(ref.description)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Validation Issues -->
      ${(validation_report.issues && validation_report.issues.length > 0) ? `
        <div class="spec-card__steps">
          <h3 class="spec-card__steps-title">Issues (${validation_report.issues.length})</h3>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${validation_report.issues.map(issue => `
              <div class="next-step">
                <span style="flex-shrink:0; font-size: 0.75rem; padding: 2px 8px; border-radius: 9999px; background: ${issue.severity === 'ERROR' ? 'var(--color-error-bg)' : issue.severity === 'WARN' ? 'var(--color-warning-bg)' : 'var(--color-info-bg)'}; color: ${issue.severity === 'ERROR' ? 'var(--color-error)' : issue.severity === 'WARN' ? 'var(--color-warning)' : 'var(--color-info)'}; font-weight: 600;">${issue.severity}</span>
                <div>
                  <div class="next-step__text">${escHTML(issue.description)}</div>
                  ${issue.auto_resolved ? `<div style="font-size: 0.75rem; color: var(--color-success); margin-top: 2px;">✓ Auto-resolved: ${escHTML(issue.resolution || '')}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Next Steps -->
      <div class="spec-card__steps">
        <h3 class="spec-card__steps-title">Next Steps</h3>
        <ol class="next-steps-list">
          ${(final_spec.next_steps || []).map((step, i) => `
            <li class="next-step">
              <span class="next-step__number">${i + 1}</span>
              <span class="next-step__text">${escHTML(step)}</span>
            </li>
          `).join('')}
        </ol>
      </div>

      <!-- Actions -->
      <div class="spec-card__actions">
        <button class="btn btn--secondary" id="btn-download-spec">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Full Spec (JSON)
        </button>
        <button class="btn btn--secondary" id="btn-copy-spec">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
      </div>
    </div>
  `;

  // Animate confidence ring
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill = document.getElementById('confidence-fill');
      const value = document.getElementById('confidence-value');
      if (fill) {
        const offset = circumference - (score / 100) * circumference;
        fill.style.strokeDashoffset = offset;
      }
      if (value) {
        animateNumber(value, 0, score, 1200);
      }
    }, 300);
  });

  // Download button
  document.getElementById('btn-download-spec')?.addEventListener('click', () => {
    downloadJSON(stage4Output, `${final_spec.project_name || 'agios-spec'}.json`);
  });

  // Copy button
  document.getElementById('btn-copy-spec')?.addEventListener('click', async () => {
    const success = await copyJSON(stage4Output);
    showToast(success ? 'Full spec copied!' : 'Failed to copy', success ? 'success' : 'error');
  });
}

function animateNumber(element, from, to, duration) {
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.round(from + (to - from) * eased);
    element.textContent = current;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

function escHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

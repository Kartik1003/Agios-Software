// client/src/utils/jsonHighlighter.js
// Lightweight JSON syntax highlighter with collapsible objects

/**
 * Render a JSON object as syntax-highlighted HTML
 * @param {*} data - The JSON data to highlight
 * @param {number} [maxDepth=10] - Max nesting depth
 * @returns {string} HTML string
 */
export function highlightJSON(data, maxDepth = 10) {
  return renderValue(data, 0, maxDepth);
}

function renderValue(value, depth, maxDepth) {
  if (value === null) return `<span class="json-null">null</span>`;
  if (value === undefined) return `<span class="json-null">undefined</span>`;

  const type = typeof value;

  if (type === 'boolean') return `<span class="json-boolean">${value}</span>`;
  if (type === 'number') return `<span class="json-number">${value}</span>`;
  if (type === 'string') return `<span class="json-string">"${escapeHTML(value)}"</span>`;

  if (Array.isArray(value)) return renderArray(value, depth, maxDepth);
  if (type === 'object') return renderObject(value, depth, maxDepth);

  return `<span class="json-string">${escapeHTML(String(value))}</span>`;
}

function renderObject(obj, depth, maxDepth) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return `<span class="json-bracket">{}</span>`;

  if (depth >= maxDepth) {
    return `<span class="json-bracket">{</span> <span class="json-null">…${keys.length} keys</span> <span class="json-bracket">}</span>`;
  }

  const id = `json-${Math.random().toString(36).slice(2, 9)}`;
  const indent = '  '.repeat(depth + 1);
  const closingIndent = '  '.repeat(depth);

  let html = `<span class="json-toggle" data-target="${id}" title="Click to collapse">▼</span><span class="json-bracket">{</span>\n`;
  html += `<span id="${id}">`;

  keys.forEach((key, i) => {
    html += `${indent}<span class="json-key">"${escapeHTML(key)}"</span><span class="json-bracket">: </span>`;
    html += renderValue(obj[key], depth + 1, maxDepth);
    if (i < keys.length - 1) html += '<span class="json-bracket">,</span>';
    html += '\n';
  });

  html += `</span>${closingIndent}<span class="json-bracket">}</span>`;
  return html;
}

function renderArray(arr, depth, maxDepth) {
  if (arr.length === 0) return `<span class="json-bracket">[]</span>`;

  if (depth >= maxDepth) {
    return `<span class="json-bracket">[</span> <span class="json-null">…${arr.length} items</span> <span class="json-bracket">]</span>`;
  }

  // Short primitive arrays — inline
  if (arr.length <= 3 && arr.every(v => typeof v !== 'object' || v === null)) {
    const items = arr.map(v => renderValue(v, depth + 1, maxDepth)).join('<span class="json-bracket">, </span>');
    return `<span class="json-bracket">[</span>${items}<span class="json-bracket">]</span>`;
  }

  const id = `json-${Math.random().toString(36).slice(2, 9)}`;
  const indent = '  '.repeat(depth + 1);
  const closingIndent = '  '.repeat(depth);

  let html = `<span class="json-toggle" data-target="${id}" title="Click to collapse">▼</span><span class="json-bracket">[</span>\n`;
  html += `<span id="${id}">`;

  arr.forEach((item, i) => {
    html += `${indent}`;
    html += renderValue(item, depth + 1, maxDepth);
    if (i < arr.length - 1) html += '<span class="json-bracket">,</span>';
    html += '\n';
  });

  html += `</span>${closingIndent}<span class="json-bracket">]</span>`;
  return html;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Attach toggle event listeners to a container
 * @param {HTMLElement} container
 */
export function attachToggleListeners(container) {
  container.querySelectorAll('.json-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const targetId = toggle.getAttribute('data-target');
      const target = document.getElementById(targetId);
      if (!target) return;

      const isCollapsed = target.classList.contains('json-collapsed');
      if (isCollapsed) {
        target.classList.remove('json-collapsed');
        toggle.textContent = '▼';
      } else {
        target.classList.add('json-collapsed');
        toggle.textContent = '▶';
      }
    });
  });
}

/**
 * Copy JSON to clipboard
 * @param {object} data
 */
export async function copyJSON(data) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

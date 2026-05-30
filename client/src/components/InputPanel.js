// client/src/components/InputPanel.js
// Input panel with textarea, example chips, and compile button

/**
 * Initialize the input panel
 * @param {Function} onCompile - Called with raw_input string when compile is triggered
 */
export function initInputPanel(onCompile) {
  const textarea = document.getElementById('nl-input');
  const charCount = document.getElementById('char-count');
  const compileBtn = document.getElementById('btn-compile');
  const examples = document.querySelectorAll('.example-chip');

  // Character count
  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len.toLocaleString()} / 5,000`;
    compileBtn.disabled = len === 0;
  });

  // Example chips
  examples.forEach(chip => {
    chip.addEventListener('click', () => {
      textarea.value = chip.dataset.example;
      textarea.dispatchEvent(new Event('input'));
      textarea.focus();
    });
  });

  // Compile button
  compileBtn.addEventListener('click', () => {
    const value = textarea.value.trim();
    if (value) {
      onCompile(value);
    }
  });

  // Ctrl+Enter shortcut
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const value = textarea.value.trim();
      if (value) {
        onCompile(value);
      }
    }
  });
}

/**
 * Set loading state on the compile button
 */
export function setCompileLoading(loading) {
  const btn = document.getElementById('btn-compile');
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Compiling...';
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Compile Specification';
  }
}

/**
 * Reset the input panel to initial state
 */
export function resetInputPanel() {
  setCompileLoading(false);
  const textarea = document.getElementById('nl-input');
  if (textarea.value.length > 0) {
    document.getElementById('btn-compile').disabled = false;
  }
}

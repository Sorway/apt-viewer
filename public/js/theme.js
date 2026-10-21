// Applied before styles load to avoid flashing the wrong theme.
(() => {
  let saved;
  try {
    saved = localStorage.getItem('apt-viewer-theme');
  } catch {}
  document.documentElement.dataset.theme = ['light', 'dark'].includes(saved)
    ? saved
    : matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  document.documentElement.dataset.focusMode = 'keyboard';
  document.addEventListener('pointerdown', () => {
    document.documentElement.dataset.focusMode = 'pointer';
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') document.documentElement.dataset.focusMode = 'keyboard';
  }, true);
})();

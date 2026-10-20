// Applied before styles load to avoid flashing the wrong theme.
(() => {
  let saved;
  try { saved = localStorage.getItem('apt-observer-theme'); } catch {}
  document.documentElement.dataset.theme = ['light','dark'].includes(saved) ? saved : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
})();

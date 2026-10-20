// Keep regular links as a fallback; enhance only pagination in the current list.
(() => {
  let loading = false;
  const position = () => {
    const table = document.querySelector('#results .scroll');
    return {x: window.scrollX, y: window.scrollY, tableX: table?.scrollLeft || 0, tableY: table?.scrollTop || 0};
  };
  const restore = value => {
    const table = document.querySelector('#results .scroll');
    if (table) { table.scrollLeft = value.tableX; table.scrollTop = value.tableY; }
    window.scrollTo({left: value.x, top: value.y, behavior: 'instant'});
  };

  async function navigate(url, {historyEntry = true, savedPosition, focusRel} = {}) {
    if (loading) return;
    const current = document.querySelector('#results');
    if (!current) return;
    loading = true;
    const pagination = current.querySelector('.pagination');
    const feedback = pagination.querySelector('.pagination-feedback');
    pagination.setAttribute('aria-busy', 'true');
    feedback.hidden = false;
    feedback.textContent = 'Chargement…';
    try {
      const response = await fetch(url.href, {headers: {'Accept': 'text/html'}, cache: 'no-store'});
      if (!response.ok) throw Error('PAGE_LOAD');
      const nextDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
      const next = nextDocument.querySelector('#results');
      if (!next) throw Error('PAGE_CONTENT');
      const scroll = savedPosition || position();
      if (historyEntry) {
        window.history.replaceState({...window.history.state, aptObserverPagination: position()}, '', window.location.href);
        window.history.pushState({aptObserverPagination: scroll}, '', url.href);
      }
      current.replaceWith(next);
      const readStatus = document.querySelector('.read-status');
      const nextReadStatus = nextDocument.querySelector('.read-status');
      if (readStatus && nextReadStatus) readStatus.replaceWith(nextReadStatus);
      const count = document.querySelector('.filter-heading > span');
      const nextCount = nextDocument.querySelector('.filter-heading > span');
      if (count && nextCount) count.textContent = nextCount.textContent;
      const nextFeedback = next.querySelector('.pagination-feedback');
      nextFeedback.hidden = false;
      nextFeedback.textContent = next.querySelector('.pagination-page').textContent + ' · ' + next.querySelector('.result-range').textContent;
      const focus = focusRel && (next.querySelector(`a[rel="${focusRel}"]`) || next.querySelector('.pagination-page'));
      if (focus) focus.focus({preventScroll: true});
      restore(scroll);
    } catch {
      if (!historyEntry) { window.location.reload(); return; }
      feedback.textContent = 'Chargement impossible. Cliquez à nouveau pour réessayer.';
    } finally {
      pagination.removeAttribute('aria-busy');
      loading = false;
    }
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('.pagination a[rel]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
    event.preventDefault();
    url.hash = '';
    navigate(url, {focusRel: link.rel});
  });
  window.addEventListener('popstate', event => {
    if (loading) { window.location.reload(); return; }
    navigate(new URL(window.location.href), {
      historyEntry: false,
      savedPosition: event.state?.aptObserverPagination || {x: 0, y: 0, tableX: 0, tableY: 0},
    });
  });
})();

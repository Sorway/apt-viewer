function setupNavigation() {
  const form = document.querySelector('.filters');
  let renderedUrl = new URL(location.href);
  let pending;

  function filterKey(url) {
    const values = ['q', 'ip', 'endpoint', 'direction', 'code', 'from', 'to', 'period', 'error']
      .map(key => url.searchParams.get(key) || '');
    const view = url.searchParams.get('view') || (url.pathname === '/failures'
      ? (['time', 'ip'].includes(url.searchParams.get('sort')) ? 'events' : 'groups') : '');
    return JSON.stringify([...values, view]);
  }

  function formUrl() {
    const url = new URL(form.action);
    for (const [key, value] of new FormData(form)) {
      if (value) url.searchParams.set(key, value);
    }
    return url;
  }

  function scrollPosition() {
    const table = document.querySelector('#results .scroll');
    return {
      x: window.scrollX, y: window.scrollY,
      tableX: table?.scrollLeft || 0, tableY: table?.scrollTop || 0,
    };
  }

  function restoreScroll(position) {
    const table = document.querySelector('#results .scroll');
    if (table) {
      table.scrollLeft = position.tableX;
      table.scrollTop = position.tableY;
    }
    window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
  }

  function replaceRegion(nextDocument, selector) {
    const current = document.querySelector(selector);
    const next = nextDocument.querySelector(selector);
    if (!current || !next) return;
    for (const chart of [current, ...current.querySelectorAll('.client-activity, [data-timeline]')]) {
      chart.dispatchEvent(new Event('apt-viewer:dispose'));
    }
    current.replaceWith(next);
  }

  function updateControls(nextDocument, syncForm) {
    if (syncForm) {
      for (const field of form.elements) {
        if (!field.name) continue;
        const next = nextDocument.querySelector('.filters').elements.namedItem(field.name);
        if (!next) continue;
        if (field.tagName === 'SELECT') field.replaceChildren(...next.cloneNode(true).children);
        field.value = next.value;
        field.dispatchEvent(new Event('apt-viewer:sync'));
      }
    }
    for (const key of ['sort', 'order']) {
      form.elements.namedItem(key).value = nextDocument.querySelector('.filters').elements.namedItem(key).value;
    }
    const currentPeriods = document.querySelectorAll('.period-shortcuts a');
    const nextPeriods = nextDocument.querySelectorAll('.period-shortcuts a');
    currentPeriods.forEach((link, index) => {
      link.href = nextPeriods[index].href;
      if (nextPeriods[index].hasAttribute('aria-current')) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    const details = document.querySelector('.date-filters details');
    const nextDetails = nextDocument.querySelector('.date-filters details');
    details.dataset.active = nextDetails.dataset.active;
    if (syncForm) details.open = nextDetails.open;
    const actions = form.querySelector('.filter-actions');
    const nextActions = nextDocument.querySelector('.filter-actions');
    actions.hidden = nextActions.hidden;
    actions.replaceChildren(...nextActions.children);
    const chips = document.querySelector('.active-filters');
    const nextChips = nextDocument.querySelector('.active-filters');
    if (chips && nextChips) chips.replaceWith(nextChips);
    else if (chips) chips.remove();
    else if (nextChips) form.after(nextChips);
    const links = document.querySelectorAll('.primary-nav a, .brand, .overview-action a, .language-switch a');
    const nextLinks = nextDocument.querySelectorAll('.primary-nav a, .brand, .overview-action a, .language-switch a');
    links.forEach((link, index) => {
      if (nextLinks[index]) link.href = nextLinks[index].href;
    });
    replaceRegion(nextDocument, '.nav-count');
  }

  function cancelPending() {
    if (!pending) return;
    pending.controller.abort();
    pending.busy.removeAttribute('aria-busy');
    pending.feedback.hidden = true;
    pending = null;
    document.dispatchEvent(new Event('apt-viewer:idle'));
  }

  async function navigate(url, { historyEntry = true, savedPosition, focusRel, sortKey, syncForm = false } = {}) {
    cancelPending();
    const filtersChanged = filterKey(url) !== filterKey(renderedUrl) || !document.querySelector('#results');
    const busy = document.querySelector(filtersChanged ? '.filter-panel' : '.pagination');
    const feedback = document.querySelector(filtersChanged ? '.filter-feedback' : '.pagination-feedback');
    const request = { controller: new AbortController(), busy, feedback };
    pending = request;
    busy.setAttribute('aria-busy', 'true');
    feedback.hidden = false;
    feedback.textContent = window.aptI18n.t('common.loading');
    document.dispatchEvent(new Event('apt-viewer:navigating'));
    try {
      const response = await fetch(url.href, {
        headers: { Accept: 'text/html' }, cache: 'no-store', signal: request.controller.signal,
      });
      if (!response.ok) throw new Error('PAGE_LOAD');
      const nextDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (!nextDocument.querySelector('.filters')) throw new Error('PAGE_CONTENT');
      if (pending !== request) return;
      const scroll = savedPosition || scrollPosition();
      if (!savedPosition && (sortKey || filtersChanged)) scroll.tableY = 0;
      if (historyEntry && url.href !== location.href) {
        history.replaceState({ ...history.state, aptViewerPagination: scrollPosition() }, '', location.href);
        history.pushState({ aptViewerPagination: scroll }, '', url.href);
      }
      updateControls(nextDocument, syncForm);
      const regions = filtersChanged
        ? ['.cards', '#results', '.timeline-panel', '.entity-failures', '.overview-charts', '.overview-action', '.read-status']
        : ['#results', '.read-status'];
      regions.forEach(selector => replaceRegion(nextDocument, selector));
      replaceRegion(nextDocument, '.filter-heading > span');
      renderedUrl = new URL(url);
      feedback.hidden = true;
      const nextFeedback = document.querySelector('.pagination-feedback');
      if (nextFeedback) {
        nextFeedback.hidden = false;
        nextFeedback.textContent = document.querySelector('.pagination-page').textContent +
          ' · ' + document.querySelector('.result-range').textContent;
      }
      const focus = sortKey ? document.querySelector(`[data-sort-key="${sortKey}"]`) :
        focusRel && (document.querySelector(`.pagination a[rel="${focusRel}"]`) || document.querySelector('.pagination-page'));
      if (focus) focus.focus({ preventScroll: true });
      document.dispatchEvent(new CustomEvent('apt-viewer:updated', { detail: { filters: filtersChanged } }));
      restoreScroll(scroll);
    } catch (error) {
      if (error.name === 'AbortError' || pending !== request) return;
      if (!historyEntry) return location.reload();
      feedback.textContent = window.aptI18n.t('common.loadFailed');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button-secondary';
      retry.textContent = window.aptI18n.t('common.retry');
      retry.addEventListener('click', () => navigate(url, { syncForm }));
      feedback.append(retry);
    } finally {
      if (pending === request) {
        busy.removeAttribute('aria-busy');
        pending = null;
        document.dispatchEvent(new Event('apt-viewer:idle'));
      }
    }
  }

  document.addEventListener('apt-viewer:filters-changing', cancelPending);
  document.addEventListener('apt-viewer:filter', event => navigate(new URL(event.detail.url)));
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('.pagination a[rel], .table-sort, .period-shortcuts a, .filter-chip, [data-reset-filters], [data-failure-view], [data-error-group]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const target = new URL(link.href, location.href);
    if (target.origin !== location.origin || target.pathname !== location.pathname) return;
    event.preventDefault();
    const url = formUrl();
    let syncForm = false;
    if (link.matches('[data-reset-filters]')) {
      const view = form.elements.namedItem('view')?.value;
      url.search = '';
      if (view) url.searchParams.set('view', view);
      syncForm = true;
    } else if (link.matches('[data-failure-view], [data-error-group]')) {
      if (!form.reportValidity()) return;
      url.searchParams.set('view', target.searchParams.get('view'));
      if (link.matches('[data-error-group]')) url.searchParams.set('error', target.searchParams.get('error'));
      for (const key of ['sort', 'order', 'page']) url.searchParams.delete(key);
      syncForm = true;
    } else if (link.matches('[data-remove-filter]')) {
      url.searchParams.delete(link.dataset.removeFilter);
      syncForm = true;
    } else if (link.matches('[data-period]')) {
      url.searchParams.delete('from');
      url.searchParams.delete('to');
      if (link.dataset.period) url.searchParams.set('period', link.dataset.period);
      else url.searchParams.delete('period');
      syncForm = true;
    } else {
      if (!form.reportValidity()) return;
      for (const key of ['sort', 'order']) {
        if (target.searchParams.has(key)) url.searchParams.set(key, target.searchParams.get(key));
      }
      if (link.rel && filterKey(url) === filterKey(renderedUrl)) {
        url.searchParams.set('page', target.searchParams.get('page') || '1');
      }
    }
    if (syncForm) {
      for (const field of form.elements) {
        if (!field.name) continue;
        field.value = url.searchParams.get(field.name) || '';
        field.dispatchEvent(new Event('apt-viewer:sync'));
      }
      form.dispatchEvent(new Event('apt-viewer:sync'));
    }
    navigate(url, { focusRel: link.rel, sortKey: link.dataset.sortKey, syncForm });
  });
  window.addEventListener('popstate', event => {
    navigate(new URL(location.href), {
      historyEntry: false, syncForm: true,
      savedPosition: event.state?.aptViewerPagination || { x: 0, y: 0, tableX: 0, tableY: 0 },
    });
  });
}

setupNavigation();

function setupThemeSwitch() {
  const buttons = document.querySelectorAll('[data-theme-choice]');

  function updateButtons() {
    const theme = document.documentElement.dataset.theme;
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    });
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const theme = button.dataset.themeChoice;
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem('apt-viewer-theme', theme);
      } catch {}
      updateButtons();
    });
  });
  updateButtons();
}

function setupRefresh() {
  const refreshButton = document.querySelector('#refresh');
  const auto = document.querySelector('#auto');
  const form = document.querySelector('.filters');
  const status = document.querySelector('#refresh-status');
  const from = form.elements.namedItem('from');
  const to = form.elements.namedItem('to');
  const period = form.elements.namedItem('period');
  const datePicker = form.querySelector('.custom-period');
  const dateFeedback = form.querySelector('.date-feedback');
  const clearDates = form.querySelector('.date-clear');

  const snapshot = () => JSON.stringify(
    [...new FormData(form).entries()].filter(([key]) => !['sort', 'order'].includes(key)),
  );
  let appliedFilters = snapshot();
  let loading = false;
  let filterTimer;
  const hasPendingFilters = () => appliedFilters !== snapshot();

  try {
    auto.checked = sessionStorage.getItem('auto') === 'true';
  } catch {}

  function refreshMessage(pending) {
    if (!auto.checked) return '';
    if (loading || pending) return window.aptI18n.t('filters.updating');
    if (document.hidden) return window.aptI18n.t('refresh.hidden');
    if (form.contains(document.activeElement)) return window.aptI18n.t('refresh.typing');
    return '';
  }

  function updateRefreshState() {
    const pending = hasPendingFilters();
    refreshButton.disabled = pending || loading;
    refreshButton.title = window.aptI18n.t('refresh.reload');
    status.textContent = refreshMessage(pending);

    to.min = from.value;
    from.max = to.value;
    const invalidPeriod = from.value && to.value && from.value > to.value;
    to.setCustomValidity(invalidPeriod ? window.aptI18n.t('filters.invalidDate') : '');
    dateFeedback.hidden = !invalidPeriod;
    dateFeedback.textContent = invalidPeriod ? window.aptI18n.t('filters.invalidDateShort') : '';
    datePicker.dataset.active = String(Boolean(from.value || to.value));
    clearDates.disabled = !from.value && !to.value;
  }

  function canRefresh() {
    if (!auto.checked || document.hidden || loading || hasPendingFilters()) return false;
    if (form.contains(document.activeElement)) return false;
    if (document.querySelector('.pagination[aria-busy="true"]')) return false;
    return !window.getSelection()?.toString();
  }

  refreshButton.addEventListener('click', () => location.reload());
  auto.addEventListener('change', () => {
    try {
      sessionStorage.setItem('auto', String(auto.checked));
    } catch {}
    updateRefreshState();
  });
  function submitFilters() {
    clearTimeout(filterTimer);
    if (!form.checkValidity() || !hasPendingFilters()) return;
    const url = new URL(form.action);
    for (const [key, value] of new FormData(form)) {
      if (value) url.searchParams.set(key, value);
    }
    document.dispatchEvent(new CustomEvent('apt-viewer:filter', { detail: { url: url.href } }));
  }

  function filterChanged(event) {
    const input = event.target;
    if (!input.name || input.type === 'hidden') return;
    clearTimeout(filterTimer);
    document.dispatchEvent(new Event('apt-viewer:filters-changing'));
    if (input === from || input === to) {
      period.value = '';
      document.querySelectorAll('.period-shortcuts [aria-current]').forEach(link => link.removeAttribute('aria-current'));
    }
    updateRefreshState();
    if (event.isComposing) return;
    const delay = event.type === 'change' ? 0 : input.type === 'datetime-local' ? 600 : 350;
    filterTimer = setTimeout(submitFilters, delay);
  }

  form.addEventListener('input', filterChanged);
  form.addEventListener('change', filterChanged);
  form.addEventListener('compositionend', filterChanged);
  form.addEventListener('submit', event => {
    event.preventDefault();
    submitFilters();
  });
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.name === 'q' && !event.isComposing) {
      event.preventDefault();
      submitFilters();
    }
  });
  document.addEventListener('apt-viewer:navigating', () => {
    clearTimeout(filterTimer);
    loading = true;
    updateRefreshState();
  });
  document.addEventListener('apt-viewer:updated', () => {
    appliedFilters = snapshot();
    updateRefreshState();
  });
  document.addEventListener('apt-viewer:idle', () => {
    loading = false;
    updateRefreshState();
  });
  form.addEventListener('focusin', updateRefreshState);
  form.addEventListener('apt-viewer:sync', updateRefreshState);
  form.addEventListener('focusout', () => queueMicrotask(updateRefreshState));
  document.addEventListener('visibilitychange', updateRefreshState);
  updateRefreshState();

  setInterval(() => {
    if (canRefresh()) location.reload();
  }, 15000);
}

setupThemeSwitch();
setupRefresh();

function setupDatePicker() {
  const picker = document.querySelector('.custom-period');
  const summary = picker.querySelector('summary');
  const popup = picker.querySelector('.date-popover');
  const from = picker.querySelector('[name="from"]');
  const to = picker.querySelector('[name="to"]');

  function position() {
    popup.classList.remove('opens-up');
    popup.style.left = '0px';
    const initial = popup.getBoundingClientRect();
    const left = Math.max(16, Math.min(initial.left, innerWidth - 16 - initial.width));
    popup.style.left = `${left - picker.getBoundingClientRect().left}px`;
    const bounds = popup.getBoundingClientRect();
    if (bounds.bottom > innerHeight - 16 && picker.getBoundingClientRect().top > bounds.height + 16) {
      popup.classList.add('opens-up');
    }
  }

  function close(restoreFocus = false) {
    picker.open = false;
    if (restoreFocus) summary.focus({ preventScroll: true });
  }

  picker.addEventListener('toggle', () => {
    if (!picker.open) return;
    position();
    if (document.activeElement === summary && summary.matches(':focus-visible')) {
      from.focus({ preventScroll: true });
    }
  });
  picker.querySelector('.date-close').addEventListener('click', () => close(true));
  picker.querySelector('.date-clear').addEventListener('click', () => {
    from.value = '';
    to.value = '';
    from.dispatchEvent(new Event('change', { bubbles: true }));
  });
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  });
  picker.addEventListener('focusout', event => {
    if (event.relatedTarget && !picker.contains(event.relatedTarget)) close();
  });
  document.addEventListener('pointerdown', event => {
    if (picker.open && !picker.contains(event.target)) close();
  });
  window.addEventListener('resize', () => {
    if (picker.open) position();
  });
}

setupDatePicker();

document.addEventListener('keydown', event => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
  event.preventDefault();
  document.querySelector('.filters input[name="q"]').focus();
});

function enhanceFilterSelect(select) {
  const field = select.parentElement;
  const label = field.querySelector('label');
  const searchable = select.hasAttribute('data-search-select');
  const root = document.createElement('div');
  root.className = 'search-select';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = select.id + '-trigger';
  trigger.className = 'select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span');
  value.className = 'select-current';
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('class', 'select-arrow');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.setAttribute('focusable', 'false');
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chevron.setAttribute('d', 'm6 9 6 6 6-6');
  arrow.append(chevron);
  trigger.append(value, arrow);

  const popup = document.createElement('div');
  popup.className = 'select-popup';
  popup.hidden = true;
  const input = searchable ? document.createElement('input') : null;
  if (input) {
    input.type = 'search';
    input.id = select.id + '-search';
    input.className = 'select-search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = select.dataset.searchPlaceholder;
    input.setAttribute('aria-label', input.placeholder);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
  }
  const list = document.createElement('div');
  list.id = select.id + '-options';
  list.className = 'select-options';
  list.tabIndex = -1;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label.textContent.trim());
  trigger.setAttribute('aria-controls', list.id);
  input?.setAttribute('aria-controls', list.id);
  if (input) popup.append(input);
  popup.append(list);
  const focusTarget = input || list;
  root.append(trigger, popup);
  field.append(root);
  select.hidden = true;
  label.htmlFor = trigger.id;
  let matches = [];
  let active = -1;

  function optionText(option) {
    const primary = document.createElement('span');
    primary.className = 'select-option-primary';
    primary.textContent = option.dataset.clientIp ? option.value : option.textContent.trim();
    const parts = [primary];
    if (option.dataset.clientIp) {
      primary.classList.add('select-ip');
      const hostname = option.textContent.slice(option.value.length).trim().replace(/^\((.*)\)$/, '$1');
      if (hostname) {
        const secondary = document.createElement('span');
        secondary.className = 'select-option-secondary';
        secondary.textContent = hostname;
        parts.push(secondary);
      }
    }
    return parts;
  }

  function updateValue() {
    const selected = select.selectedOptions[0];
    value.replaceChildren(...(selected ? optionText(selected) : []));
    trigger.title = selected?.textContent.trim() || '';
  }

  function close(restoreFocus = false) {
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    input?.setAttribute('aria-expanded', 'false');
    focusTarget.removeAttribute('aria-activedescendant');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function highlight(index) {
    active = index;
    Array.from(list.children).forEach((row, index) => row.classList.toggle('is-active', index === active));
    const row = matches.length ? list.children[active] : null;
    if (!row) return focusTarget.removeAttribute('aria-activedescendant');
    focusTarget.setAttribute('aria-activedescendant', row.id);
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
  }

  function choose(index) {
    if (!matches[index]) return;
    select.value = matches[index].value;
    updateValue();
    close(true);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function render() {
    const needle = input?.value.trim().toLocaleLowerCase('fr') || '';
    matches = Array.from(select.options).filter(option =>
      !option.disabled && option.textContent.toLocaleLowerCase('fr').includes(needle),
    );
    list.replaceChildren();
    matches.forEach((option, index) => {
      const row = document.createElement('div');
      row.id = list.id + '-' + index;
      row.className = 'select-option';
      row.title = option.textContent.trim();
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.value === select.value));
      row.append(...optionText(option));
      row.addEventListener('pointerdown', event => event.preventDefault());
      row.addEventListener('click', () => choose(index));
      row.addEventListener('pointermove', () => highlight(index));
      list.append(row);
    });
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'select-empty';
      empty.setAttribute('role', 'status');
      empty.textContent = window.aptI18n.t('common.emptyShort');
      list.append(empty);
    }
    list.scrollTop = 0;
    highlight(Math.max(0, matches.findIndex(option => option.value === select.value)));
  }

  function positionPopup() {
    popup.style.left = '0px';
    const bounds = popup.getBoundingClientRect();
    const left = Math.max(16, Math.min(bounds.left, innerWidth - 16 - bounds.width));
    popup.style.left = `${left - root.getBoundingClientRect().left}px`;
  }

  function open(search = '') {
    popup.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (input) {
      input.setAttribute('aria-expanded', 'true');
      input.value = search;
    }
    render();
    positionPopup();
    focusTarget.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => popup.hidden ? open() : close());
  input?.addEventListener('input', render);
  root.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (popup.hidden) open();
      else if (matches.length) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        highlight((active + step + matches.length) % matches.length);
      }
    } else if ((event.key === 'Enter' || (!searchable && event.key === ' ')) && !popup.hidden) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape' && !popup.hidden) {
      event.preventDefault();
      close(true);
    } else if ((event.target === trigger || !searchable) && event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (popup.hidden) open(event.key);
      if (!searchable) {
        const index = matches.findIndex(option => option.textContent.trim().toLocaleLowerCase('fr').startsWith(event.key.toLocaleLowerCase('fr')));
        if (index >= 0) highlight(index);
      }
    }
  });
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget)) close();
  });
  function sync() {
    updateValue();
    close();
  }
  select.addEventListener('change', sync);
  select.addEventListener('apt-viewer:sync', sync);
  document.addEventListener('pointerdown', event => {
    if (!root.contains(event.target)) close();
  });
  document.addEventListener('client-names-updated', () => {
    updateValue();
    if (!popup.hidden) render();
  });
  window.addEventListener('resize', () => {
    if (!popup.hidden) positionPopup();
  });
  updateValue();
}

document.querySelectorAll('.filters select').forEach(enhanceFilterSelect);

function enhancePieChart(chart) {
  const svg = chart.querySelector('.client-pie');
  const tooltip = chart.querySelector('.pie-tooltip');
  if (!svg || !tooltip) return;
  const controller = new AbortController();
  chart.addEventListener('apt-viewer:dispose', () => controller.abort(), { once: true });
  const name = tooltip.querySelector('.pie-tooltip-name');
  const values = tooltip.querySelector('.pie-tooltip-values');
  const slices = Array.from(svg.querySelectorAll('[data-chart-slice]'));
  const rows = Array.from(chart.querySelectorAll('[data-chart-row]'));
  let active;
  function hide() {
    active = undefined;
    tooltip.hidden = true;
    svg.classList.remove('has-highlight');
    slices.forEach(slice => slice.classList.remove('is-highlighted'));
    rows.forEach(row => row.classList.remove('is-highlighted'));
  }
  function show(slice) {
    active = slice;
    const row = rows.find(row => row.dataset.chartRow === slice.dataset.chartSlice);
    const label = row?.querySelector('[data-client-ip]')?.textContent || slice.dataset.label;
    name.textContent = label.trim().replace(/\s+/g, ' ');
    values.textContent = window.aptI18n.t('charts.tooltip', { count: slice.dataset.count, share: slice.dataset.share });
    tooltip.hidden = false;
    svg.classList.add('has-highlight');
    slices.forEach(item => item.classList.toggle('is-highlighted', item === slice));
    rows.forEach(item => item.classList.toggle('is-highlighted', item === row));
  }
  slices.forEach(slice => {
    slice.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') show(slice);
    });
    slice.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'touch') hide();
    });
    slice.addEventListener('click', () => {
      if (active === slice) hide();
      else show(slice);
    });
  });
  rows.forEach(row => {
    const slice = slices.find(slice => slice.dataset.chartSlice === row.dataset.chartRow);
    if (!slice) return;
    row.addEventListener('focusin', () => show(slice));
    row.addEventListener('focusout', hide);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
  }, { signal: controller.signal });
  document.addEventListener('pointerdown', event => {
    if (!chart.contains(event.target)) hide();
  }, { signal: controller.signal });
}
document.querySelectorAll('.client-activity').forEach(enhancePieChart);
document.addEventListener('apt-viewer:updated', event => {
  if (event.detail?.filters) document.querySelectorAll('.client-activity').forEach(enhancePieChart);
});

async function refreshClientNames() {
  if (document.hidden) return;
  try {
    const response = await fetch('/api/client-names');
    if (!response.ok) return;
    const names = await response.json();
    document.querySelectorAll('[data-client-ip]').forEach(element => {
      const ip = element.dataset.clientIp;
      const hostname = element.querySelector('.client-host');
      if (hostname) hostname.textContent = names[ip] || '';
      else element.textContent = ip + (names[ip] ? ` (${names[ip]})` : '');
    });
    document.dispatchEvent(new Event('client-names-updated'));
  } catch {
    /* Keep IPs visible if DNS or the API is unavailable. */
  }
}
setTimeout(refreshClientNames, 2000);
setInterval(refreshClientNames, 15000);

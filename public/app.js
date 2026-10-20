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
  const feedback = document.querySelector('.filter-feedback');
  const from = form.elements.namedItem('from');
  const to = form.elements.namedItem('to');

  const snapshot = () => JSON.stringify([...new FormData(form).entries()]);
  const initialFilters = snapshot();
  const hasPendingFilters = () => initialFilters !== snapshot();

  try {
    auto.checked = sessionStorage.getItem('auto') === 'true';
  } catch {}

  function refreshMessage(pending) {
    if (!auto.checked) return '';
    if (pending) return 'En pause · filtres à appliquer';
    if (document.hidden) return 'En pause · onglet masqué';
    if (form.contains(document.activeElement)) return 'En pause · saisie des filtres';
    return 'Actualisation toutes les 15 s';
  }

  function updateRefreshState() {
    const pending = hasPendingFilters();
    feedback.hidden = !pending;
    refreshButton.disabled = pending;
    refreshButton.title = pending
      ? 'Appliquez les filtres pour actualiser la sélection'
      : 'Relire les données';
    status.textContent = refreshMessage(pending);

    to.min = from.value;
    from.max = to.value;
    const invalidPeriod = from.value && to.value && from.value > to.value;
    to.setCustomValidity(invalidPeriod ? 'La date de fin doit suivre la date de début.' : '');
  }

  function canRefresh() {
    if (!auto.checked || document.hidden || hasPendingFilters()) return false;
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
  form.addEventListener('input', updateRefreshState);
  form.addEventListener('change', updateRefreshState);
  form.addEventListener('focusin', updateRefreshState);
  form.addEventListener('focusout', () => queueMicrotask(updateRefreshState));
  document.addEventListener('visibilitychange', updateRefreshState);
  updateRefreshState();

  setInterval(() => {
    if (canRefresh()) location.reload();
  }, 15000);
}

setupThemeSwitch();
setupRefresh();

function enhanceFilterSelect(select) {
  const field = select.parentElement;
  const label = field.querySelector('label');
  const root = document.createElement('div');
  root.className = 'search-select';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = select.id + '-search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = select.dataset.searchPlaceholder;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  const arrow = document.createElement('span');
  arrow.className = 'select-arrow';
  arrow.textContent = '⌄';
  arrow.setAttribute('aria-hidden', 'true');
  const popup = document.createElement('div');
  popup.className = 'select-popup';
  popup.hidden = true;
  const list = document.createElement('div');
  list.id = select.id + '-options';
  list.className = 'select-options';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label.textContent);
  input.setAttribute('aria-controls', list.id);
  const count = document.createElement('div');
  count.className = 'select-count';
  count.setAttribute('role', 'status');
  popup.append(list, count);
  root.append(input, arrow, popup);
  field.append(root);
  select.hidden = true;
  label.htmlFor = input.id;
  let matches = [];
  let active = -1;
  let query = '';
  const selectedText = () => select.selectedOptions[0]?.textContent.trim() || '';

  function close() {
    popup.hidden = true;
    input.value = selectedText();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function highlight(index) {
    active = index;
    Array.from(list.children).forEach((row, i) => row.classList.toggle('is-active', i === active));
    const row = list.children[active];
    if (!row || !matches.length) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    input.setAttribute('aria-activedescendant', row.id);
    if (row.offsetTop < list.scrollTop) {
      list.scrollTop = row.offsetTop;
    } else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
  }
  function choose(index) {
    if (!matches[index]) return;
    select.value = matches[index].value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  }
  function render(search) {
    query = search;
    const needle = search.trim().toLocaleLowerCase('fr');
    matches = Array.from(select.options).filter(
      option => !option.disabled && option.textContent.toLocaleLowerCase('fr').includes(needle),
    );
    list.replaceChildren();
    matches.forEach((option, index) => {
      const row = document.createElement('div');
      row.id = list.id + '-' + index;
      row.className = 'select-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.value === select.value));
      const text = document.createElement('span');
      const primary = document.createElement('span');
      primary.className = 'select-option-primary';
      const name = option.dataset.clientIp
        ? option.textContent
            .slice(option.value.length)
            .trim()
            .replace(/^\((.*)\)$/, '$1')
        : '';
      primary.textContent = option.dataset.clientIp ? option.value : option.textContent;
      text.append(primary);
      if (name) {
        const secondary = document.createElement('span');
        secondary.className = 'select-option-secondary';
        secondary.textContent = name;
        text.append(secondary);
      }
      const check = document.createElement('span');
      check.className = 'select-option-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = option.value === select.value ? '✓' : '';
      row.append(text, check);
      row.addEventListener('pointerdown', event => event.preventDefault());
      row.addEventListener('click', () => choose(index));
      row.addEventListener('pointermove', () => highlight(index));
      list.append(row);
    });
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'select-empty';
      empty.textContent = 'Aucun résultat';
      list.append(empty);
    }
    count.textContent = matches.length + (matches.length > 1 ? ' résultats' : ' résultat');
    list.scrollTop = 0;
    const selectedIndex = matches.findIndex(option => option.value === select.value);
    highlight(Math.max(0, selectedIndex));
  }
  function open(search = '') {
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    popup.classList.remove('align-right');
    render(search);
    if (popup.getBoundingClientRect().right > window.innerWidth - 16) {
      popup.classList.add('align-right');
    }
  }
  input.value = selectedText();
  input.addEventListener('focus', () => {
    open();
    input.select();
  });
  input.addEventListener('click', () => {
    if (popup.hidden) {
      open();
      input.select();
    }
  });
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('blur', close);
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (popup.hidden) {
        open();
      } else if (matches.length) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        highlight((active + step + matches.length) % matches.length);
      }
    } else if (event.key === 'Enter' && !popup.hidden) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape' && !popup.hidden) {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') close();
  });
  select.addEventListener('change', close);
  document.addEventListener('pointerdown', event => {
    if (!root.contains(event.target)) close();
  });
  document.addEventListener('client-names-updated', () => {
    if (popup.hidden) input.value = selectedText();
    else render(query);
  });
}
document.querySelectorAll('select[data-search-select]').forEach(enhanceFilterSelect);

function enhancePieChart(chart) {
  const svg = chart.querySelector('.client-pie');
  const tooltip = chart.querySelector('.pie-tooltip');
  if (!svg || !tooltip) return;
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
    values.textContent = slice.dataset.count + ' événements · ' + slice.dataset.share + ' %';
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
  });
  document.addEventListener('pointerdown', event => {
    if (!chart.contains(event.target)) hide();
  });
}
document.querySelectorAll('.client-activity').forEach(enhancePieChart);

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

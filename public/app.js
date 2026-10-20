const themeButtons = document.querySelectorAll('[data-theme-choice]');
function updateThemeButtons() {
  themeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === document.documentElement.dataset.theme)));
}
themeButtons.forEach(button => button.addEventListener('click', () => {
  document.documentElement.dataset.theme = button.dataset.themeChoice;
  try { localStorage.setItem('apt-observer-theme', button.dataset.themeChoice); } catch {}
  updateThemeButtons();
}));
updateThemeButtons();
const refreshButton = document.querySelector('#refresh');
const filterForm = document.querySelector('.filters');
const refreshStatus = document.querySelector('#refresh-status');
const filterFeedback = document.querySelector('.filter-feedback');
const filterSnapshot = () => JSON.stringify([...new FormData(filterForm).entries()]);
const initialFilters = filterSnapshot();
const hasPendingFilters = () => initialFilters !== filterSnapshot();
refreshButton.addEventListener('click',()=>location.reload());
const auto=document.querySelector('#auto');
try { auto.checked=sessionStorage.getItem('auto')==='true'; } catch {} 
function updateRefreshState() {
  const pending = hasPendingFilters();
  filterFeedback.hidden = !pending;
  refreshButton.disabled = pending;
  refreshButton.title = pending ? 'Appliquez les filtres pour actualiser la sélection' : 'Relire les données';
  refreshStatus.textContent = !auto.checked ? '' : pending ? 'En pause · filtres à appliquer' : document.hidden ? 'En pause · onglet masqué' : filterForm.contains(document.activeElement) ? 'En pause · saisie des filtres' : 'Actualisation toutes les 15 s';
  const from = filterForm.elements.namedItem('from');
  const to = filterForm.elements.namedItem('to');
  to.min = from.value;
  from.max = to.value;
  to.setCustomValidity(from.value && to.value && from.value > to.value ? 'La date de fin doit suivre la date de début.' : '');
}
auto.addEventListener('change',()=>{try { sessionStorage.setItem('auto',String(auto.checked)); } catch {} updateRefreshState();});
filterForm.addEventListener('input', updateRefreshState);
filterForm.addEventListener('change', updateRefreshState);
filterForm.addEventListener('focusin', updateRefreshState);
filterForm.addEventListener('focusout', () => queueMicrotask(updateRefreshState));
document.addEventListener('visibilitychange', updateRefreshState);
updateRefreshState();
setInterval(()=>{
  if(auto.checked&&!document.hidden&&!hasPendingFilters()&&!filterForm.contains(document.activeElement)&&!document.querySelector('.pagination[aria-busy="true"]')&&!window.getSelection()?.toString())location.reload();
},15000);

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
  let matches = [], active = -1, query = '';
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
    if (!row || !matches.length) { input.removeAttribute('aria-activedescendant'); return; }
    input.setAttribute('aria-activedescendant', row.id);
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }
  function choose(index) {
    if (!matches[index]) return;
    select.value = matches[index].value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
    close();
  }
  function render(search) {
    query = search;
    const needle = search.trim().toLocaleLowerCase('fr');
    matches = Array.from(select.options).filter(option => !option.disabled && option.textContent.toLocaleLowerCase('fr').includes(needle));
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
      const name = option.dataset.clientIp ? option.textContent.slice(option.value.length).trim().replace(/^\((.*)\)$/, '$1') : '';
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
    highlight(Math.max(0, matches.findIndex(option => option.value === select.value)));
  }
  function open(search = '') {
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    popup.classList.remove('align-right');
    render(search);
    if (popup.getBoundingClientRect().right > window.innerWidth - 16) popup.classList.add('align-right');
  }
  input.value = selectedText();
  input.addEventListener('focus', () => { open(); input.select(); });
  input.addEventListener('click', () => { if (popup.hidden) { open(); input.select(); } });
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('blur', close);
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (popup.hidden) open();
      else if (matches.length) highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === 'Enter' && !popup.hidden) {
      event.preventDefault(); choose(active);
    } else if (event.key === 'Escape' && !popup.hidden) {
      event.preventDefault(); close();
    } else if (event.key === 'Tab') close();
  });
  select.addEventListener('change', close);
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); });
  document.addEventListener('client-names-updated', () => { if (popup.hidden) input.value = selectedText(); else render(query); });
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
    name.textContent = row?.querySelector('[data-client-ip]')?.textContent || slice.dataset.label;
    values.textContent = slice.dataset.count + ' événements · ' + slice.dataset.share + ' %';
    tooltip.hidden = false;
    svg.classList.add('has-highlight');
    slices.forEach(item => item.classList.toggle('is-highlighted', item === slice));
    rows.forEach(item => item.classList.toggle('is-highlighted', item === row));
  }
  slices.forEach(slice => {
    slice.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(slice); });
    slice.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') hide(); });
    slice.addEventListener('click', () => { if (active === slice) hide(); else show(slice); });
  });
  rows.forEach(row => {
    const slice = slices.find(slice => slice.dataset.chartSlice === row.dataset.chartRow);
    if (!slice) return;
    row.addEventListener('focusin', () => show(slice));
    row.addEventListener('focusout', hide);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('pointerdown', event => { if (!chart.contains(event.target)) hide(); });
}
document.querySelectorAll('.client-activity').forEach(enhancePieChart);

// Reverse DNS runs on the server with bounded concurrency and a cache.
async function refreshClientNames() {
  if (document.hidden) return;
  try {
    const response = await fetch('/api/client-names');
    if (!response.ok) return;
    const names = await response.json();
    document.querySelectorAll('[data-client-ip]').forEach(element => {
      const ip = element.dataset.clientIp;
      element.textContent = ip + (names[ip] ? ` (${names[ip]})` : '');
    });
    document.dispatchEvent(new Event('client-names-updated'));
  } catch { /* Keep IPs visible if DNS or the API is unavailable. */ }
}
setTimeout(refreshClientNames, 2000);
setInterval(refreshClientNames, 15000);

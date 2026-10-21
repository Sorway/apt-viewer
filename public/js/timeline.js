function setupTimeline(panel) {
  const svg = panel.querySelector('.timeline-svg');
  if (!svg) return;
  const data = JSON.parse(panel.dataset.timeline);
  const plot = panel.querySelector('.timeline-plot');
  const tooltip = panel.querySelector('.timeline-tooltip');
  const buckets = data.buckets;
  const namespace = 'http://www.w3.org/2000/svg';
  const date = new Intl.DateTimeFormat(window.aptI18n.locale, {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const clock = new Intl.DateTimeFormat(window.aptI18n.locale, {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit',
  });
  const day = new Intl.DateTimeFormat(window.aptI18n.locale, {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit',
  });
  let width;
  let active = null;
  let cursor;
  let markers;
  const left = 72;
  const right = 12;
  const top = 30;
  const bottom = 176;
  const errorTop = 226;
  const errorBottom = 270;
  const maxVolume = Math.max(1, ...buckets.flatMap(bucket => [bucket.incoming, bucket.outgoing]));
  const magnitude = 10 ** Math.floor(Math.log10(maxVolume / 4));
  const tick = [1, 2, 5, 10].find(value => value * magnitude >= maxVolume / 4) * magnitude;
  const volumeLimit = tick * 4;
  const errorLimit = Math.max(1, ...buckets.map(bucket => bucket.errors));

  const bytes = window.aptI18n.bytes;

  function element(tag, attributes, text, parent = svg) {
    const node = document.createElementNS(namespace, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text != null) node.textContent = text;
    parent.append(node);
    return node;
  }

  const timeX = time => left + (time - data.from) / (data.to - data.from) * (width - left - right);
  const bucketStart = index => Math.max(data.from, buckets[index].time);
  const bucketEnd = index => Math.min(data.to, buckets[index].time + data.step);
  const x = index => timeX((bucketStart(index) + bucketEnd(index)) / 2);
  const y = value => bottom - value / volumeLimit * (bottom - top);

  function hide() {
    active = null;
    tooltip.hidden = true;
    cursor?.setAttribute('visibility', 'hidden');
    markers?.setAttribute('visibility', 'hidden');
  }

  function show(index) {
    active = index;
    const bucket = buckets[index];
    cursor.setAttribute('x1', x(index));
    cursor.setAttribute('x2', x(index));
    cursor.setAttribute('visibility', 'visible');
    markers.replaceChildren();
    markers.setAttribute('visibility', 'visible');
    for (const key of ['incoming', 'outgoing']) {
      element('circle', { cx: x(index), cy: y(bucket[key]), r: 4, class: `timeline-marker series-${key}` }, null, markers);
    }
    tooltip.querySelector('[data-timeline-time]').textContent = `${date.format(bucketStart(index))} – ${date.format(bucketEnd(index))}`;
    tooltip.querySelector('[data-timeline-incoming]').textContent = bytes(bucket.incoming);
    tooltip.querySelector('[data-timeline-outgoing]').textContent = bytes(bucket.outgoing);
    tooltip.querySelector('[data-timeline-errors]').textContent = bucket.errors.toLocaleString(window.aptI18n.locale);
    tooltip.hidden = false;
    const position = x(index) > width / 2 ? x(index) - tooltip.offsetWidth - 16 : x(index) + 16;
    tooltip.style.left = `${Math.max(0, Math.min(width - tooltip.offsetWidth, position))}px`;
  }

  function draw() {
    width = Math.max(240, plot.clientWidth);
    svg.setAttribute('viewBox', `0 0 ${width} 310`);
    svg.replaceChildren();
    element('text', { x: left, y: 15, class: 'timeline-axis' }, window.aptI18n.t('timeline.volume'));
    for (let index = 0; index <= 4; index++) {
      const value = tick * index;
      element('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), class: 'timeline-grid' });
      element('text', { x: left - 10, y: y(value) + 5, 'text-anchor': 'end', class: 'timeline-axis' }, bytes(value));
    }
    for (const key of ['incoming', 'outgoing']) {
      const points = buckets.map((bucket, index) => `${x(index)},${y(bucket[key])}`).join(' ');
      element('polyline', { points, class: `timeline-line series-${key}`, 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round' });
      if (buckets.length === 1) {
        element('circle', { cx: x(0), cy: y(buckets[0][key]), r: 3, class: `timeline-marker series-${key}` });
      }
    }
    element('text', { x: left, y: errorTop - 12, class: 'timeline-axis' }, window.aptI18n.t('common.errors'));
    element('text', { x: width - right, y: errorTop - 12, 'text-anchor': 'end', class: 'timeline-axis' }, `max. ${errorLimit}`);
    element('line', { x1: left, x2: width - right, y1: errorBottom, y2: errorBottom, class: 'timeline-grid' });
    buckets.forEach((bucket, index) => {
      if (!bucket.errors) return;
      const barWidth = Math.max(1, timeX(bucketEnd(index)) - timeX(bucketStart(index)) - 2);
      const height = bucket.errors / errorLimit * (errorBottom - errorTop);
      element('rect', { x: x(index) - barWidth / 2, y: errorBottom - height, width: barWidth, height, rx: 1, class: 'timeline-bar series-errors' });
    });
    const labels = width < 500 ? 2 : 4;
    for (let index = 0; index <= labels; index++) {
      const time = data.from + (data.to - data.from) * index / labels;
      const label = data.to - data.from >= 172800000
        ? (width < 500 ? day.format(time) : `${day.format(time)} ${clock.format(time)}`)
        : clock.format(time);
      element('text', {
        x: left + (width - left - right) * index / labels,
        y: 301, 'text-anchor': index === 0 ? 'start' : index === labels ? 'end' : 'middle', class: 'timeline-axis',
      }, label);
    }
    cursor = element('line', { x1: 0, x2: 0, y1: top, y2: errorBottom, class: 'timeline-cursor', visibility: 'hidden' });
    markers = element('g', { visibility: 'hidden' });
    if (active != null) show(active);
  }

  svg.addEventListener('pointermove', event => {
    const bounds = svg.getBoundingClientRect();
    const localX = (event.clientX - bounds.left) * width / bounds.width;
    if (localX < left || localX > width - right) return hide();
    const time = data.from + (localX - left) / (width - left - right) * (data.to - data.from);
    show(Math.max(0, Math.min(buckets.length - 1, Math.floor((time - buckets[0].time) / data.step))));
  });
  svg.addEventListener('pointerleave', () => {
    if (document.activeElement !== svg) hide();
  });
  svg.addEventListener('focus', () => show(active ?? 0));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', event => {
    if (event.key === 'Escape') return hide();
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let index = active ?? 0;
    if (event.key === 'ArrowLeft') index--;
    if (event.key === 'ArrowRight') index++;
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = buckets.length - 1;
    show(Math.max(0, Math.min(buckets.length - 1, index)));
  });
  draw();
  const observer = new ResizeObserver(draw);
  observer.observe(plot);
  panel.addEventListener('apt-viewer:dispose', () => observer.disconnect(), { once: true });
}

document.querySelectorAll('[data-timeline]').forEach(setupTimeline);
document.addEventListener('apt-viewer:updated', event => {
  if (event.detail?.filters) document.querySelectorAll('[data-timeline]').forEach(setupTimeline);
});

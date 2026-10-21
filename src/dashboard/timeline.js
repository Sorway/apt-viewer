const minute = 60000;
const intervals = [1, 5, 15, 30, 60, 180, 360, 720, 1440].map(value => value * minute);

export function buildTimeline(events, range, now = Date.now()) {
  let earliest = Infinity;
  let latest = -Infinity;
  for (const event of events) {
    earliest = Math.min(earliest, event.time);
    latest = Math.max(latest, event.time);
  }
  let from = Number.isFinite(range.from) ? range.from : (events.length ? earliest : now - 86400000);
  let to = Number.isFinite(range.to) ? range.to : (events.length ? latest : now);
  if (from > to) {
    if (Number.isFinite(range.from)) to = from + 86400000;
    else from = to - 86400000;
  }
  const span = Math.max(minute, to - from);
  const step = intervals.find(interval => span / interval <= 60) ??
    Math.ceil(span / 60 / 86400000) * 86400000;
  const start = Math.floor(from / step) * step;
  const end = Math.max(to, start + step);
  const count = Math.max(1, Math.ceil((end - start) / step));
  const buckets = Array.from({ length: count }, (_, index) => ({
    time: start + index * step,
    incoming: 0,
    outgoing: 0,
    errors: 0,
  }));
  for (const event of events) {
    if (event.time < from || event.time > to) continue;
    const index = Math.min(count - 1, Math.floor((event.time - start) / step));
    const bucket = buckets[index];
    if (!bucket) continue;
    if (event.direction === 'I') bucket.incoming += event.bytes;
    if (event.direction === 'O') bucket.outgoing += event.bytes;
    if (event.direction === 'E') bucket.errors++;
  }
  return { from, to: Math.max(to, from + 1), step, buckets, empty: !events.length };
}

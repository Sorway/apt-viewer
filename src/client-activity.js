// Count log events, independently of byte volume and activity pagination.
export function clientActivity(clients) {
  const ranked = [...clients].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const total = ranked.reduce((sum, client) => sum + client.count, 0);
  const groups = ranked.slice(0, 7);
  if (ranked.length > 7) {
    groups.push({name: 'Autres', count: ranked.slice(7).reduce((sum, client) => sum + client.count, 0), other: true});
  }
  let offset = 0;
  const point = angle => `${(120 + 112 * Math.cos(angle)).toFixed(6)} ${(120 + 112 * Math.sin(angle)).toFixed(6)}`;
  const slices = groups.map((client, index) => {
    const start = offset / total * 2 * Math.PI - Math.PI / 2;
    offset += client.count;
    const end = offset / total * 2 * Math.PI - Math.PI / 2;
    // Two arcs also cover a single client occupying the entire circle.
    const path = `M 120 120 L ${point(start)} A 112 112 0 0 1 ${point((start + end) / 2)} A 112 112 0 0 1 ${point(end)} Z`;
    return {...client, index, share: client.count / total * 100, path};
  });
  return {total, slices};
}

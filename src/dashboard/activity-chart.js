const maxGroups = 7;
const center = 120;
const radius = 112;

function pointOnCircle(angle) {
  const x = center + radius * Math.cos(angle);
  const y = center + radius * Math.sin(angle);
  return `${x.toFixed(6)} ${y.toFixed(6)}`;
}

export function buildActivityChart(items) {
  const ranked = [...items].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const total = ranked.reduce((sum, item) => sum + item.count, 0);
  const groups = ranked.slice(0, maxGroups);
  if (ranked.length > maxGroups) {
    groups.push({
      name: 'Autres',
      count: ranked.slice(maxGroups).reduce((sum, item) => sum + item.count, 0),
      other: true,
    });
  }

  let offset = 0;
  const slices = groups.map((group, index) => {
    const start = (offset / total) * 2 * Math.PI - Math.PI / 2;
    offset += group.count;
    const end = (offset / total) * 2 * Math.PI - Math.PI / 2;

    // Two half-arcs also draw a complete circle when there is only one group.
    const path = [
      `M ${center} ${center} L ${pointOnCircle(start)}`,
      `A ${radius} ${radius} 0 0 1 ${pointOnCircle((start + end) / 2)}`,
      `A ${radius} ${radius} 0 0 1 ${pointOnCircle(end)} Z`,
    ].join(' ');

    return { ...group, index, share: (group.count / total) * 100, path };
  });

  return { total, slices, groups: ranked.length };
}

/** Domain emblems — 24×24 viewBox, fill currentColor. */
export const MARK_PATH = {
  connectivity:
    "M10.2 3.4h3.6v3.6h-3.6V3.4zM3.6 16.2h3.6v3.6H3.6v-3.6zm13.2 0h3.6v3.6h-3.6v-3.6zM12 7.2v4.2M6.2 16.2l3.6-4.8M17.8 16.2l-3.6-4.8",
  collaboration: "M7.2 17.6h10.4a3.6 3.6 0 0 0 .2-7.2 5 5 0 0 0-9.6-1.5A3.7 3.7 0 0 0 7.2 17.6z",
  managed: "M12 2.4l8 3.1v6.4c0 5.1-3.5 8.6-8 9.9-4.5-1.3-8-4.8-8-9.9V5.5L12 2.4z",
};

export const MARK_STROKE = {
  connectivity: true,
};

export function markSvg(pillar, size = 22) {
  const d = MARK_PATH[pillar] || MARK_PATH.connectivity;
  const stroke = MARK_STROKE[pillar]
    ? ` fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"`
    : "";
  return `<svg class="mark m-${pillar}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"${stroke}></path></svg>`;
}

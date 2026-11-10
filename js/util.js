// Small DOM helpers and icons.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function html(strings, ...values) {
  const t = document.createElement('template');
  t.innerHTML = String.raw({ raw: strings }, ...values).trim();
  return t.content.firstElementChild;
}

const svg = (body, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icon = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chevron: svg('<path d="M9 5l7 7-7 7"/>', 18),
  plus: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>'),
  minus: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', 18),
  tap: svg('<path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V12m0-1a1.5 1.5 0 013 0v4.5a5.5 5.5 0 01-5.5 5.5h-1a5 5 0 01-4.2-2.3L5 15.5a1.5 1.5 0 012.5-1.6L9 15.5"/>', 18),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16),
  cross: svg('<path d="M6 6l12 12M18 6L6 18"/>', 16),
  shuffle: svg('<path d="M4 7h3.5c5 0 5 10 10 10H20M4 17h3.5c1.6 0 2.7-1 3.6-2.4M20 7h-2.5c-1.6 0-2.7 1-3.6 2.4M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/>', 18),
  repeat: svg('<path d="M4 12a8 8 0 0113.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>', 18),
  next: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 18),
  download: svg('<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>', 18),
  upload: svg('<path d="M12 16V5M7.5 9L12 4.5 16.5 9M5 20h14"/>', 18),
};

export const vibrate = (ms = 12) => {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
};

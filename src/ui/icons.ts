// Small inline SVG icons for big kid-sized buttons.
const svg = (body: string, vb = "0 0 48 48") =>
  `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  gear: svg(`<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="6" fill="currentColor"/><path d="M24 9v6M24 33v6M9 24h6M33 24h6"/>`),
  flaps: svg(`<path d="M5 20 L32 16 L43 20 L32 24 Z" fill="currentColor" stroke-width="2.5"/><path d="M30 26 L40 34" stroke-width="5"/>`),
  radio: svg(`<path d="M10 28v-4a14 14 0 0 1 28 0v4"/><rect x="6" y="27" width="8" height="12" rx="3" fill="currentColor"/><rect x="34" y="27" width="8" height="12" rx="3" fill="currentColor"/><path d="M38 39c0 4-5 5-10 5"/>`),
  camera: svg(`<rect x="5" y="14" width="28" height="22" rx="5"/><path d="M33 22l10-6v18l-10-6z" fill="currentColor"/>`),
  brake: svg(`<circle cx="24" cy="24" r="17"/><path d="M14 24h20" stroke-width="6"/>`),
  pause: svg(`<rect x="13" y="10" width="7" height="28" rx="2" fill="currentColor" stroke="none"/><rect x="28" y="10" width="7" height="28" rx="2" fill="currentColor" stroke="none"/>`),
  home: svg(`<path d="M7 23 L24 9 L41 23"/><path d="M12 20v19h24V20"/><rect x="20" y="28" width="8" height="11" fill="currentColor" stroke="none"/>`),
  plane: svg(`<path d="M24 4c2 0 3 3 3 6v9l15 9v4l-15-4v9l5 4v3l-8-2-8 2v-3l5-4v-9L6 32v-4l15-9v-9c0-3 1-6 3-6z" fill="currentColor" stroke="none"/>`),
  wing: svg(`<path d="M20.5 21C15 17 9 16 2 16.5c2.5 1.6 4.6 2.6 6.8 3.4-2 .2-3.9.5-5.6 1.2 2.7 1.3 5.5 2 8.4 2.2-1.6.6-3 1.3-4.3 2.2 3.9.9 8.6.7 13.2-.5zM27.5 21C33 17 39 16 46 16.5c-2.5 1.6-4.6 2.6-6.8 3.4 2 .2 3.9.5 5.6 1.2-2.7 1.3-5.5 2-8.4 2.2 1.6.6 3 1.3 4.3 2.2-3.9.9-8.6.7-13.2-.5z" fill="currentColor" stroke="none"/><path d="M24 15l5 3v6c0 3-2.2 5.2-5 6.5-2.8-1.3-5-3.5-5-6.5v-6z" fill="currentColor" stroke="none"/>`),
  school: svg(`<path d="M4 18 L24 9 L44 18 L24 27 Z" fill="currentColor" stroke-width="2"/><path d="M12 22v9c4 4 20 4 24 0v-9"/><path d="M40 20v12"/>`),
  map: svg(`<path d="M5 11l12-5 14 5 12-5v31l-12 5-14-5-12 5z"/><path d="M17 6v31M31 11v31"/>`),
  gearSettings: svg(`<circle cx="24" cy="24" r="6"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M10.5 37.5l4.2-4.2M33.3 14.7l4.2-4.2"/>`),
  star: svg(`<path d="M24 5l5.8 12.3 13.4 1.7-9.8 9.3 2.5 13.3L24 35.2 12.1 41.6l2.5-13.3-9.8-9.3 13.4-1.7z" fill="currentColor" stroke-width="2"/>`),
  back: svg(`<path d="M30 8L14 24l16 16"/>`),
  lock: svg(`<rect x="10" y="21" width="28" height="21" rx="4" fill="currentColor" stroke="none"/><path d="M16 21v-6a8 8 0 0 1 16 0v6"/>`),
  compass: svg(`<circle cx="24" cy="24" r="18"/><path d="M24 10l5 14-5 14-5-14z" fill="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="2.5" fill="#fff" stroke="none"/>`),
  pin: svg(`<path d="M24 43s-13-13.5-13-23a13 13 0 0 1 26 0c0 9.5-13 23-13 23z"/><circle cx="24" cy="20" r="5" fill="currentColor"/>`),
  eye: svg(`<path d="M3 24c6-10 13-15 21-15s15 5 21 15c-6 10-13 15-21 15S9 34 3 24z"/><circle cx="24" cy="24" r="7" fill="currentColor"/>`),
  reset: svg(`<path d="M10 24a14 14 0 1 0 4-10"/><path d="M10 8v8h8"/>`),
  check: svg(`<path d="M9 25l10 10 20-22" stroke-width="5"/>`),
};

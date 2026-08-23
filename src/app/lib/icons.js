/* Icons come from a build-time SVG sprite (spec §8, feedback F14).
   `<symbol>` defined once, referenced by `<use>` — ~400 bytes per icon, sharp
   at any size, follows currentColor, and never fetched from anywhere. */
import { html } from './html.js';
import { countryCode } from './util.js';

export function Icon({ name, size, class: cls = '', label }) {
  const style = size ? `font-size:${size}` : undefined;
  return html`
    <svg class=${`icon ${cls}`} style=${style} aria-hidden=${label ? undefined : 'true'}
         role=${label ? 'img' : undefined} focusable="false">
      ${label && html`<title>${label}</title>`}
      <use href=${`#i-${name}`} />
    </svg>`;
}

/* A country flag, looked up from a city record. Renders nothing when the
   country is unknown — an empty circle is worse than no circle. */
export function Flag({ city, code, size, class: cls = '' }) {
  const cc = code || countryCode(city);
  if (!cc) return null;
  const style = size ? `font-size:${size}` : undefined;
  return html`
    <svg class=${`flag ${cls}`} style=${style} role="img"
         aria-label=${city?.country || cc.toUpperCase()}>
      <use href=${`#f-${cc}`} />
    </svg>`;
}

/* Transport mode → icon name. */
export const MODE_ICONS = {
  flight: 'plane', train: 'train-front', ferry: 'ship',
  car: 'car', bus: 'bus', other: 'circle-dot',
};
export const modeIcon = (mode) => MODE_ICONS[mode] || 'circle-dot';

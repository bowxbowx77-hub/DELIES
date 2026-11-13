/**
 * Inline SVG icon registry — 24x24 grid, 1.8px stroke, currentColor.
 * Hand authored so the whole set stays visually consistent and no network
 * request (icon font / CDN sprite) is ever needed, including offline in the APK.
 */

const OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
const CLOSE = '</svg>';

function icon(inner) {
  return OPEN + inner + CLOSE;
}

export const ICONS = {
  home: icon('<path d="M4 10.6 12 4l8 6.6"/><path d="M6 9.8V20h12V9.8"/><path d="M10 20v-5.2h4V20"/>'),
  calendar: icon('<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M3.5 10h17"/><path d="M8 3.5v4M16 3.5v4"/>'),
  tasks: icon('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="m7.5 12 2.2 2.2 4.3-4.6"/><path d="M14.5 16.5h3"/>'),
  note: icon('<path d="M6 3.5h8.5L19.5 8v12.5H6z" /><path d="M14 3.5V8h5"/><path d="M9 12h7M9 16h5"/>'),
  bell: icon('<path d="M18 16.5H6l1.3-2.2V10a4.7 4.7 0 0 1 9.4 0v4.3z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/>'),
  bellOff: icon('<path d="M18 16.5H6l1.3-2.2V10a4.7 4.7 0 0 1 7.2-4"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/><path d="m4 4 16 16"/>'),
  cart: icon('<circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/><path d="M3 4h2.2l2.3 10h10.2l2-7H6"/>'),
  chart: icon('<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="12" width="3" height="5" rx="1"/><rect x="12.5" y="8.5" width="3" height="8.5" rx="1"/><rect x="17.5" y="5.5" width="0.1" height="11.5" rx="1"/>'),
  more: icon('<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>'),
  settings: icon('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="17" r="2"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  minus: icon('<path d="M5 12h14"/>'),
  search: icon('<circle cx="11" cy="11" r="6"/><path d="m15.6 15.6 4 4"/>'),
  close: icon('<path d="m6 6 12 12M18 6 6 18"/>'),
  check: icon('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  edit: icon('<path d="M4.5 19.5h4l9.6-9.6a2.4 2.4 0 0 0-3.4-3.4L5 16.1z"/><path d="m14.2 6.6 3.4 3.4"/>'),
  trash: icon('<path d="M4.5 7h15"/><path d="M9 7V4.6h6V7"/><path d="M6.5 7l.9 12.4h9.2L17.5 7"/><path d="M10.5 11v5M13.5 11v5"/>'),
  chevronLeft: icon('<path d="m14.5 6-6 6 6 6"/>'),
  chevronRight: icon('<path d="m9.5 6 6 6-6 6"/>'),
  chevronDown: icon('<path d="m6 9.5 6 6 6-6"/>'),
  chevronUp: icon('<path d="m6 14.5 6-6 6 6"/>'),
  arrowLeft: icon('<path d="M20 12H4"/><path d="m10 6-6 6 6 6"/>'),
  pin: icon('<path d="M12 3.5 14 9l5 1.5-2 4.5h-3v5l-2 1.5-2-1.5v-5H7l-2-4.5L10 9z"/>'),
  clock: icon('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'),
  flag: icon('<path d="M6 21V4h11l-1.8 4L17 12H6"/>'),
  alert: icon('<path d="M12 4.5 21 19H3z"/><path d="M12 10v4M12 16.5v.2"/>'),
  download: icon('<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M4.5 20h15"/>'),
  upload: icon('<path d="M12 16V5"/><path d="m7.5 9 4.5-4.5L16.5 9"/><path d="M4.5 20h15"/>'),
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>'),
  moon: icon('<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>'),
  contrast: icon('<circle cx="12" cy="12" r="8"/><path d="M12 4v16a8 8 0 0 0 0-16z" fill-rule="nonzero"/>'),
  globe: icon('<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><path d="M12 4c2.4 2.2 3.6 4.9 3.6 8S14.4 17.8 12 20c-2.4-2.2-3.6-4.9-3.6-8S9.6 6.2 12 4z"/>'),
  info: icon('<circle cx="12" cy="12" r="8"/><path d="M12 11v5.5M12 7.8v.2"/>'),
  filter: icon('<path d="M4 6h16l-6 7v5.5L10 21v-8z"/>'),
  repeat: icon('<path d="M6 8h10a3 3 0 0 1 3 3v1"/><path d="m13 5 3 3-3 3"/><path d="M18 16H8a3 3 0 0 1-3-3v-1"/><path d="m11 19-3-3 3-3"/>'),
  shield: icon('<path d="M12 3.5 19 6v6c0 4-3 6.9-7 8.5C8 18.9 5 16 5 12V6z"/><path d="m9 12 2 2 4-4"/>'),
  database: icon('<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v11c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-11"/><path d="M5 12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8"/>'),
  refresh: icon('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5V10h-5.2"/>'),
  snooze: icon('<circle cx="12" cy="13" r="7"/><path d="M9.5 10.5h5l-5 5h5"/><path d="M9 3.5h6"/>'),
  listCheck: icon('<path d="M4.5 6.5h9M4.5 12h9M4.5 17.5h6"/><path d="m15 16 2 2 3.5-4"/>'),
  target: icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2"/>'),
  star: icon('<path d="m12 4 2.5 5.2 5.5.7-4 3.9 1 5.6L12 16.7 7 19.4l1-5.6-4-3.9 5.5-.7z"/>'),
  share: icon('<circle cx="17.5" cy="6" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="m8.7 10.8 6.6-3.6M8.7 13.2l6.6 3.6"/>'),
  user: icon('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20c.6-3.4 3.6-5.4 7.2-5.4s6.6 2 7.2 5.4"/>'),
  web: icon('<circle cx="12" cy="12" r="8"/><path d="M4.4 9.4h15.2M4.4 14.6h15.2"/>'),
  android: icon('<rect x="6" y="8.5" width="12" height="10" rx="2.5"/><path d="M9.5 8.5 8 5.8M14.5 8.5 16 5.8"/><circle cx="9.8" cy="12.3" r=".9" fill="currentColor" stroke="none"/><circle cx="14.2" cy="12.3" r=".9" fill="currentColor" stroke="none"/><path d="M9 18.5v2M15 18.5v2M6 11.5H4.2M19.8 11.5H18"/>'),
  folder: icon('<path d="M3.8 7.2h6l2 2.4h8.4v9.2a2 2 0 0 1-2 2H5.8a2 2 0 0 1-2-2z"/>'),
  fire: icon('<path d="M12 3.5c3 3.2 4.5 6 4.5 8.4a4.5 4.5 0 1 1-9 0c0-1 .3-2 1-3.1.6 1.2 1.3 1.9 2 2.1-.4-2.6.1-5 1.5-7.4z"/>'),
  clipboard: icon('<rect x="5.5" y="5" width="13" height="15.5" rx="2.5"/><path d="M9 5V3.5h6V5"/><path d="M9 10h6M9 14h4"/>'),
  case_: icon('<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V5.5h6v2"/><path d="M3.5 12.5h17"/>'),
  eye: icon('<path d="M2.8 12S6 6.5 12 6.5 21.2 12 21.2 12 18 17.5 12 17.5 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.6"/>')
};

export function iconSvg(name) {
  return ICONS[name] || ICONS.info;
}

export function iconNode(name, className) {
  const span = document.createElement('span');
  span.className = className || 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = iconSvg(name); // static, author-controlled markup
  return span;
}

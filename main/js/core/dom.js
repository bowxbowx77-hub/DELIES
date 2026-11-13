/**
 * Small DOM helpers. All user supplied strings are inserted with textContent
 * or attribute setters — never with innerHTML — to avoid HTML injection.
 */

/**
 * Creates an element.
 * @param {string} tag  tag name, may include classes: "div.card.card--flat"
 * @param {Object|null} props  attributes/properties, `on` map for events
 * @param {...(Node|string|number|false|null|undefined|Array)} children
 */
export function h(tag, props, ...children) {
  const [name, ...classes] = String(tag).split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') {
        el.className = el.className ? `${el.className} ${value}` : String(value);
      } else if (key === 'text') {
        el.textContent = String(value);
      } else if (key === 'style' && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          if (k.startsWith('--')) el.style.setProperty(k, String(v));
          else el.style[k] = v;
        }
      } else if (key === 'dataset' && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          if (v !== null && v !== undefined) el.dataset[k] = String(v);
        }
      } else if (key === 'on' && typeof value === 'object') {
        for (const [evt, handler] of Object.entries(value)) {
          if (typeof handler === 'function') el.addEventListener(evt, handler);
        }
      } else if (key === 'ref' && typeof value === 'function') {
        value(el);
      } else if (key in el && key !== 'list' && typeof value !== 'string') {
        try {
          el[key] = value;
        } catch {
          el.setAttribute(key, String(value));
        }
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }

  appendChildren(el, children);
  return el;
}

export function appendChildren(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function svgIcon(svgMarkup, className) {
  // Icons are static, developer-authored markup (see core/icons.js), never user input.
  const wrap = document.createElement('span');
  wrap.className = className || 'icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = svgMarkup;
  return wrap;
}

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function qs(selector, root) {
  return (root || document).querySelector(selector);
}

export function debounce(fn, delay) {
  let timer = 0;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function raf(fn) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
  return setTimeout(fn, 16);
}

/** Traps Tab focus inside `container` and returns a cleanup function. */
export function trapFocus(container, previousActive) {
  const selector =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function onKeydown(event) {
    if (event.key !== 'Tab') return;
    const items = Array.from(container.querySelectorAll(selector)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKeydown);
  return function release() {
    container.removeEventListener('keydown', onKeydown);
    if (previousActive && typeof previousActive.focus === 'function') {
      try {
        previousActive.focus();
      } catch {
        /* element may be gone */
      }
    }
  };
}

import type { AtriumContext } from '../core/context';
import { el, icon } from '../core/dom';

export interface SelectOptions {
  /** Called with the new value after the user picks an option. */
  onChange?: (value: string) => void;
}

export interface SelectHandle {
  readonly element: HTMLElement;
  readonly value: string;
  setValue(value: string): void;
  /** Rebuilds the options after the native <select>'s <option>s changed. */
  refresh(): void;
  destroy(): void;
}

let uid = 0;

/**
 * Turns a native <select> into MOSAIC's custom dropdown. The native element stays
 * in the DOM (hidden) and is kept in sync, so forms and `select.value` keep working.
 * An option can show an icon with data-icon="bootstrap-icon-name".
 */
export function enhanceSelect(ctx: AtriumContext, native: HTMLSelectElement, options: SelectOptions = {}): SelectHandle {
  const id = `atrium-select-${++uid}`;
  const root = el('div', 'atrium-select');
  if (native.className) root.classList.add(...native.className.split(' ').filter((c) => c && c !== 'atrium-input'));

  const trigger = el('button', 'atrium-select-trigger');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${id}-list`);
  const labelledBy = native.id ? document.querySelector(`label[for="${native.id}"]`) : null;
  if (labelledBy) {
    labelledBy.id ||= `${id}-label`;
    trigger.setAttribute('aria-labelledby', `${labelledBy.id} ${id}-value`);
    labelledBy.addEventListener('click', (e) => {
      e.preventDefault();
      trigger.focus();
    });
  }

  const valueEl = el('span', 'atrium-select-value');
  valueEl.id = `${id}-value`;
  trigger.append(valueEl, icon('chevron-down'));

  const dropdown = el('div', 'atrium-select-dropdown');
  dropdown.id = `${id}-list`;
  dropdown.setAttribute('role', 'listbox');

  root.append(trigger, dropdown);
  native.classList.add('atrium-select-native');
  native.tabIndex = -1;
  native.setAttribute('aria-hidden', 'true');
  native.after(root);
  root.prepend(native);

  let highlighted = -1;

  const optionEls = () => Array.from(dropdown.querySelectorAll<HTMLElement>('.atrium-select-option'));

  const render = () => {
    dropdown.replaceChildren();
    Array.from(native.options).forEach((opt, i) => {
      const item = el('div', 'atrium-select-option');
      item.id = `${id}-opt-${i}`;
      item.dataset.index = String(i);
      item.setAttribute('role', 'option');
      if (opt.dataset.icon) item.appendChild(icon(opt.dataset.icon));
      item.appendChild(el('span', undefined, ctx.translate(opt.text)));
      if (opt.disabled) {
        item.classList.add('is-disabled');
        item.setAttribute('aria-disabled', 'true');
      }
      item.addEventListener('click', () => {
        if (!opt.disabled) choose(i);
      });
      item.addEventListener('pointermove', () => highlight(i, false));
      dropdown.appendChild(item);
    });
    sync();
  };

  const sync = () => {
    const selected = native.selectedIndex;
    optionEls().forEach((item, i) => {
      item.classList.toggle('is-selected', i === selected);
      item.setAttribute('aria-selected', String(i === selected));
    });
    valueEl.replaceChildren();
    const opt = native.options[selected];
    if (opt) {
      if (opt.dataset.icon) valueEl.appendChild(icon(opt.dataset.icon));
      valueEl.append(ctx.translate(opt.text));
    }
    root.classList.toggle('is-disabled', native.disabled);
    trigger.disabled = native.disabled;
  };

  const highlight = (i: number, scroll = true) => {
    const items = optionEls();
    highlighted = Math.max(0, Math.min(i, items.length - 1));
    items.forEach((item, n) => item.classList.toggle('is-highlighted', n === highlighted));
    const target = items[highlighted];
    if (target) {
      trigger.setAttribute('aria-activedescendant', target.id);
      if (scroll) target.scrollIntoView({ block: 'nearest' });
    }
  };

  const step = (from: number, dir: 1 | -1) => {
    const opts = native.options;
    for (let i = from + dir; i >= 0 && i < opts.length; i += dir) {
      if (!opts[i].disabled) return i;
    }
    return from;
  };

  const isOpen = () => root.classList.contains('is-open');

  const open = () => {
    if (isOpen() || native.disabled) return;
    // Open upward when the dropdown would overflow the viewport (MOSAIC's open-up).
    const rect = root.getBoundingClientRect();
    const needed = Math.min(300, dropdown.scrollHeight) + 8;
    root.classList.toggle('is-up', rect.bottom + needed > window.innerHeight && rect.top > needed);
    root.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    highlight(native.selectedIndex >= 0 ? native.selectedIndex : 0);
  };

  const close = () => {
    root.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    optionEls().forEach((item) => item.classList.remove('is-highlighted'));
  };

  const choose = (i: number) => {
    const changed = native.selectedIndex !== i;
    native.selectedIndex = i;
    sync();
    close();
    trigger.focus({ preventScroll: true });
    if (changed) {
      native.dispatchEvent(new Event('input', { bubbles: true }));
      native.dispatchEvent(new Event('change', { bubbles: true }));
      options.onChange?.(native.value);
    }
  };

  trigger.addEventListener('click', () => (isOpen() ? close() : open()));
  trigger.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen()) open();
        else highlight(step(highlighted, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen()) open();
        else highlight(step(highlighted, -1));
        break;
      case 'Home':
        if (isOpen()) {
          e.preventDefault();
          highlight(step(-1, 1));
        }
        break;
      case 'End':
        if (isOpen()) {
          e.preventDefault();
          highlight(step(native.options.length, -1));
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen() && highlighted >= 0 && !native.options[highlighted]?.disabled) choose(highlighted);
        else open();
        break;
      case 'Escape':
        if (isOpen()) {
          e.preventDefault();
          e.stopPropagation(); // don't also close a modal around it
          close();
        }
        break;
      case 'Tab':
        close();
        break;
    }
  });

  const onOutside = (e: PointerEvent) => {
    if (!root.contains(e.target as Node)) close();
  };
  document.addEventListener('pointerdown', onOutside, true);
  native.addEventListener('change', sync);

  render();

  return {
    element: root,
    get value() {
      return native.value;
    },
    setValue(value: string) {
      native.value = value;
      sync();
    },
    refresh: render,
    destroy() {
      document.removeEventListener('pointerdown', onOutside, true);
      native.removeEventListener('change', sync);
      native.classList.remove('atrium-select-native');
      native.removeAttribute('aria-hidden');
      native.removeAttribute('tabindex');
      root.replaceWith(native);
    },
  };
}

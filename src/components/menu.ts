import type { AtriumContext } from '../core/context';
import { el, icon } from '../core/dom';

export interface MenuItem {
  label: string;
  /** Bootstrap Icons name. */
  icon?: string;
  /** Right-aligned hint, e.g. a shortcut. */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export type MenuEntry = MenuItem | 'separator';

/** Matches MOSAIC: the menu is removed 150ms into its 200ms close animation. */
const CLOSE_MS = 150;
const EDGE = 10;

/** MOSAIC's context menu. One menu is open at a time. */
export class MenuManager {
  private readonly ctx: AtriumContext;
  private readonly menu: HTMLElement;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private restoreFocus: Element | null = null;
  private readonly bindings = new Map<HTMLElement, (e: MouseEvent) => void>();

  constructor(ctx: AtriumContext) {
    this.ctx = ctx;
    this.menu = el('div', 'atrium-menu');
    this.menu.setAttribute('role', 'menu');
    this.menu.tabIndex = -1;
    ctx.mount.appendChild(this.menu);

    this.menu.addEventListener('keydown', this.onMenuKeyDown);
    document.addEventListener('pointerdown', this.onOutside, true);
    window.addEventListener('blur', this.closeNow);
    window.addEventListener('resize', this.closeNow);
    window.addEventListener('scroll', this.onScroll, true);
  }

  get isOpen(): boolean {
    return this.menu.classList.contains('is-open') && !this.menu.classList.contains('is-closing');
  }

  /** Opens the menu at the pointer (from a contextmenu/click event) or at a point. */
  open(at: MouseEvent | { x: number; y: number }, entries: MenuEntry[]) {
    if (at instanceof MouseEvent) at.preventDefault();
    const x = at instanceof MouseEvent ? at.clientX : at.x;
    const y = at instanceof MouseEvent ? at.clientY : at.y;

    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.restoreFocus = document.activeElement;
    this.render(entries);

    // Measure while invisible, then place it inside the viewport (MOSAIC's rules).
    this.menu.classList.remove('is-open', 'is-closing');
    this.menu.style.visibility = 'hidden';
    this.menu.style.display = 'block';
    const { offsetWidth: w, offsetHeight: h } = this.menu;
    this.menu.style.removeProperty('display');
    this.menu.style.removeProperty('visibility');

    let left = x;
    let top = y;
    if (left + w > window.innerWidth) left = window.innerWidth - w - EDGE;
    if (top + h > window.innerHeight) top = Math.max(EDGE, y - h);
    this.menu.style.left = `${Math.max(EDGE, left)}px`;
    this.menu.style.top = `${top}px`;

    void this.menu.offsetWidth; // restart the entrance animation
    this.menu.classList.add('is-open');
    this.menu.focus({ preventScroll: true });
  }

  /** Opens `entries` on right-click of `target`. `entries` can depend on the event. Returns an unbind function. */
  bind(target: HTMLElement, entries: MenuEntry[] | ((e: MouseEvent) => MenuEntry[] | null)): () => void {
    const handler = (e: MouseEvent) => {
      const list = typeof entries === 'function' ? entries(e) : entries;
      if (list && list.length) this.open(e, list);
    };
    target.addEventListener('contextmenu', handler);
    this.bindings.set(target, handler);
    return () => {
      target.removeEventListener('contextmenu', handler);
      this.bindings.delete(target);
    };
  }

  close() {
    if (!this.isOpen) return;
    const delay = this.ctx.duration(CLOSE_MS);
    if (delay === 0) {
      this.closeNow();
      return;
    }
    this.menu.classList.add('is-closing');
    this.closeTimer = setTimeout(this.closeNow, delay);
  }

  closeNow = () => {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    const wasFocused = this.menu.contains(document.activeElement);
    this.menu.classList.remove('is-open', 'is-closing');
    if (wasFocused && this.restoreFocus instanceof HTMLElement) this.restoreFocus.focus({ preventScroll: true });
  };

  destroy() {
    this.closeNow();
    this.bindings.forEach((handler, target) => target.removeEventListener('contextmenu', handler));
    this.bindings.clear();
    document.removeEventListener('pointerdown', this.onOutside, true);
    window.removeEventListener('blur', this.closeNow);
    window.removeEventListener('resize', this.closeNow);
    window.removeEventListener('scroll', this.onScroll, true);
    this.menu.remove();
  }

  private render(entries: MenuEntry[]) {
    this.menu.replaceChildren();
    for (const entry of entries) {
      if (entry === 'separator') {
        const sep = el('div', 'atrium-menu-separator');
        sep.setAttribute('role', 'separator');
        this.menu.appendChild(sep);
        continue;
      }
      const item = el('button', `atrium-menu-item${entry.danger ? ' atrium-menu-item-danger' : ''}`);
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.disabled = !!entry.disabled;
      if (entry.icon) item.appendChild(icon(entry.icon));
      item.appendChild(el('span', 'atrium-menu-item-label', this.ctx.translate(entry.label)));
      if (entry.hint) item.appendChild(el('span', 'atrium-menu-item-hint', entry.hint));
      item.addEventListener('click', () => {
        this.close();
        entry.onClick?.();
      });
      this.menu.appendChild(item);
    }
  }

  private items(): HTMLButtonElement[] {
    return Array.from(this.menu.querySelectorAll<HTMLButtonElement>('.atrium-menu-item:not(:disabled)'));
  }

  private onMenuKeyDown = (e: KeyboardEvent) => {
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focus(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focus(index < 0 ? items.length - 1 : index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focus(0);
        break;
      case 'End':
        e.preventDefault();
        focus(items.length - 1);
        break;
      case 'Escape':
      case 'Tab':
        e.preventDefault();
        this.close();
        break;
    }
  };

  private onOutside = (e: PointerEvent) => {
    if (this.isOpen && !this.menu.contains(e.target as Node)) this.close();
  };

  private onScroll = (e: Event) => {
    if (this.isOpen && !this.menu.contains(e.target as Node)) this.close();
  };
}

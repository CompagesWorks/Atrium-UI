import type { AtriumContext } from '../core/context';
import { el, icon } from '../core/dom';
import { renderShortcut } from '../core/keys';

export interface MenuItem {
  label: string;
  /** Bootstrap Icons name. */
  icon?: string;
  /** Right-aligned hint text. */
  hint?: string;
  /** Right-aligned keyboard shortcut shown as key chips, e.g. 'Mod+O'. Display only. */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export type MenuEntry = MenuItem | 'separator';

export type MenuPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export interface MenuAnchorOptions {
  /** Default: 'bottom-start'. Flips vertically when there is no room. */
  placement?: MenuPlacement;
  /** Gap between the anchor and the menu, in px. Default: 6. */
  offset?: number;
}

/** Matches MOSAIC: the menu is removed 150ms into its 200ms close animation. */
const CLOSE_MS = 150;
const EDGE = 10;

/** MOSAIC's context menu, also usable as a dropdown anchored to a button. One menu is open at a time. */
export class MenuManager {
  private readonly ctx: AtriumContext;
  private readonly menu: HTMLElement;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private restoreFocus: Element | null = null;
  private readonly bindings = new Map<HTMLElement, (e: MouseEvent) => void>();
  private anchor: HTMLElement | null = null;

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

    const { w, h } = this.prepare(entries, null);

    // MOSAIC's rules: shift left at the right edge, open upward at the bottom edge.
    let left = x;
    let top = y;
    if (left + w > window.innerWidth) left = window.innerWidth - w - EDGE;
    if (top + h > window.innerHeight) top = Math.max(EDGE, y - h);
    this.show(Math.max(EDGE, left), top, false);
    this.menu.focus({ preventScroll: true });
  }

  /**
   * Opens the menu as a dropdown under (or above) `anchor`, e.g. a "⋯" button.
   * Calling it again for the same open anchor closes it.
   */
  openAt(anchor: HTMLElement, entries: MenuEntry[], options: MenuAnchorOptions = {}, focusFirst = false) {
    if (this.isOpen && this.anchor === anchor) {
      this.close();
      return;
    }
    const placement = options.placement ?? 'bottom-start';
    const gap = options.offset ?? 6;
    const { w, h } = this.prepare(entries, anchor);
    const r = anchor.getBoundingClientRect();

    const roomBelow = window.innerHeight - r.bottom - gap - EDGE;
    const roomAbove = r.top - gap - EDGE;
    const wantsUp = placement.startsWith('top');
    const up = wantsUp ? roomAbove >= h || roomAbove > roomBelow : roomBelow < h && roomAbove > roomBelow;

    let left = placement.endsWith('end') ? r.right - w : r.left;
    left = Math.min(Math.max(EDGE, left), window.innerWidth - w - EDGE);
    const top = up ? Math.max(EDGE, r.top - gap - h) : r.bottom + gap;

    this.menu.style.transformOrigin = `${placement.endsWith('end') ? 'right' : 'left'} ${up ? 'bottom' : 'top'}`;
    this.show(left, top, up);
    anchor.setAttribute('aria-expanded', 'true');

    if (focusFirst) this.items()[0]?.focus({ preventScroll: true });
    else this.menu.focus({ preventScroll: true });
  }

  /**
   * Turns `button` into a dropdown trigger: click toggles the menu, ArrowDown / Enter / Space
   * open it with the first item focused. `entries` can be computed on each open. Returns an unbind function.
   */
  attach(
    button: HTMLElement,
    entries: MenuEntry[] | (() => MenuEntry[]),
    options: MenuAnchorOptions = {},
  ): () => void {
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const list = () => (typeof entries === 'function' ? entries() : entries);

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      // detail === 0 means keyboard activation; the keydown handler already opened it.
      if (e.detail !== 0) this.openAt(button, list(), options);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!(this.isOpen && this.anchor === button)) this.openAt(button, list(), options, true);
      }
    };
    button.addEventListener('click', onClick);
    button.addEventListener('keydown', onKeyDown);
    return () => {
      button.removeEventListener('click', onClick);
      button.removeEventListener('keydown', onKeyDown);
      button.removeAttribute('aria-haspopup');
      button.removeAttribute('aria-expanded');
    };
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
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.anchor = null;
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

  /** Renders the entries and measures the menu while it is invisible. */
  private prepare(entries: MenuEntry[], anchor: HTMLElement | null): { w: number; h: number } {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.anchor = anchor;
    this.restoreFocus = anchor ?? document.activeElement;
    this.render(entries);

    this.menu.classList.remove('is-open', 'is-closing', 'is-up');
    this.menu.style.removeProperty('transform-origin');
    this.menu.style.visibility = 'hidden';
    this.menu.style.display = 'block';
    const size = { w: this.menu.offsetWidth, h: this.menu.offsetHeight };
    this.menu.style.removeProperty('display');
    this.menu.style.removeProperty('visibility');
    return size;
  }

  private show(left: number, top: number, up: boolean) {
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${top}px`;
    this.menu.classList.toggle('is-up', up);
    void this.menu.offsetWidth; // restart the entrance animation
    this.menu.classList.add('is-open');
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
      if (entry.shortcut) item.appendChild(renderShortcut(entry.shortcut));
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
    const target = e.target as Node;
    // A press on the anchor is left to its click handler, which toggles the menu.
    if (this.isOpen && !this.menu.contains(target) && !this.anchor?.contains(target)) this.close();
  };

  private onScroll = (e: Event) => {
    if (this.isOpen && !this.menu.contains(e.target as Node)) this.close();
  };
}

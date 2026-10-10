import type { AtriumContext } from '../core/context';
import { el } from '../core/dom';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipOptions {
  placement?: TooltipPlacement;
  /** Hover delay in ms before showing. Default: 0 (as in MOSAIC). */
  delay?: number;
}

const GAP = 8;
const MARGIN = 8;
const OPPOSITE: Record<TooltipPlacement, TooltipPlacement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/**
 * Floating tooltips. Any element with [data-atrium-tooltip] gets one automatically
 * (delegated, so elements added later work too); `attach()` binds one from code.
 */
export class TooltipManager {
  private readonly ctx: AtriumContext;
  private readonly tip: HTMLElement;
  private current: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly attached = new WeakMap<HTMLElement, { text: string; options: TooltipOptions }>();

  constructor(ctx: AtriumContext) {
    this.ctx = ctx;
    this.tip = el('div', 'atrium-floating-tooltip');
    this.tip.id = `atrium-tooltip-${Math.random().toString(36).slice(2, 8)}`;
    this.tip.setAttribute('role', 'tooltip');
    ctx.mount.appendChild(this.tip);

    document.addEventListener('pointerover', this.onEnter);
    document.addEventListener('pointerout', this.onLeave);
    document.addEventListener('focusin', this.onEnter);
    document.addEventListener('focusout', this.onLeave);
    document.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('scroll', this.hide, true);
  }

  /** Binds a tooltip from code. Returns a function that removes it. */
  attach(target: HTMLElement, text: string, options: TooltipOptions = {}): () => void {
    this.attached.set(target, { text, options });
    return () => {
      this.attached.delete(target);
      if (this.current === target) this.hide();
    };
  }

  show(target: HTMLElement, text: string, options: TooltipOptions = {}) {
    if (!text) return;
    this.cancelTimer();
    this.current = target;
    this.tip.textContent = this.ctx.translate(text);
    target.setAttribute('aria-describedby', this.tip.id);
    this.position(target, options.placement ?? 'top');
    // Next frame so the entrance transition runs from the offset position.
    requestAnimationFrame(() => {
      if (this.current === target) this.tip.classList.add('is-visible');
    });
  }

  hide = () => {
    this.cancelTimer();
    if (this.current) this.current.removeAttribute('aria-describedby');
    this.current = null;
    this.tip.classList.remove('is-visible');
  };

  destroy() {
    this.hide();
    document.removeEventListener('pointerover', this.onEnter);
    document.removeEventListener('pointerout', this.onLeave);
    document.removeEventListener('focusin', this.onEnter);
    document.removeEventListener('focusout', this.onLeave);
    document.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('scroll', this.hide, true);
    this.tip.remove();
  }

  private resolve(target: EventTarget | null): { el: HTMLElement; text: string; options: TooltipOptions } | null {
    let node = target instanceof Element ? target : null;
    while (node) {
      if (node instanceof HTMLElement) {
        const bound = this.attached.get(node);
        if (bound) return { el: node, ...bound };
        const text = node.dataset.atriumTooltip;
        if (text) {
          return {
            el: node,
            text,
            options: {
              placement: node.dataset.atriumTooltipPosition as TooltipPlacement | undefined,
              delay: node.dataset.atriumTooltipDelay ? Number(node.dataset.atriumTooltipDelay) : undefined,
            },
          };
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  private onEnter = (e: Event) => {
    const hit = this.resolve(e.target);
    if (!hit || hit.el === this.current) return;
    this.cancelTimer();
    const delay = hit.options.delay ?? 0;
    if (delay > 0) this.showTimer = setTimeout(() => this.show(hit.el, hit.text, hit.options), delay);
    else this.show(hit.el, hit.text, hit.options);
  };

  private onLeave = (e: Event) => {
    const related = (e as PointerEvent | FocusEvent).relatedTarget as Node | null;
    const hit = this.resolve(e.target);
    if (!hit) return;
    if (related && hit.el.contains(related)) return; // still inside the same element
    if (hit.el === this.current || this.showTimer) this.hide();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.current) this.hide();
  };

  private cancelTimer() {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
  }

  /** Places the tooltip, flipping to the opposite side and clamping inside the viewport. */
  private position(target: HTMLElement, preferred: TooltipPlacement) {
    const tip = this.tip;
    tip.classList.remove('is-visible');
    tip.style.left = '0px';
    tip.style.top = '0px';

    const r = target.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const fits: Record<TooltipPlacement, boolean> = {
      top: r.top - GAP - h >= MARGIN,
      bottom: r.bottom + GAP + h <= vh - MARGIN,
      left: r.left - GAP - w >= MARGIN,
      right: r.right + GAP + w <= vw - MARGIN,
    };
    const placement = fits[preferred] || !fits[OPPOSITE[preferred]] ? preferred : OPPOSITE[preferred];

    let x: number;
    let y: number;
    if (placement === 'top' || placement === 'bottom') {
      x = r.left + r.width / 2 - w / 2;
      y = placement === 'top' ? r.top - GAP - h : r.bottom + GAP;
    } else {
      x = placement === 'left' ? r.left - GAP - w : r.right + GAP;
      y = r.top + r.height / 2 - h / 2;
    }

    tip.dataset.placement = placement;
    tip.style.left = `${Math.round(Math.min(Math.max(x, MARGIN), vw - w - MARGIN))}px`;
    tip.style.top = `${Math.round(Math.min(Math.max(y, MARGIN), vh - h - MARGIN))}px`;
  }
}

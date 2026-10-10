import type { AtriumContext } from '../core/context';
import { replayAnimation } from '../core/dom';

export type StatusTone = 'default' | 'success' | 'warning' | 'error' | 'busy';

export interface Statusbar {
  /** Swaps the left text with MOSAIC's blur-and-slide transition. */
  set(text: string, tone?: StatusTone): void;
  /** Replaces the right-hand content (plain text or a node). */
  setRight(content: string | Node): void;
  /** MOSAIC's attention bounce. */
  bounce(): void;
}

/** One phase of MOSAIC's status text swap: transition, then the target styles. */
interface Phase {
  transition: string;
  opacity: string;
  transform: string;
  filter: string;
}

const SWAP = {
  full: {
    out: {
      transition: 'opacity 0.16s ease-in, transform 0.18s cubic-bezier(0.55, 0, 0.75, 0), filter 0.16s ease-in',
      opacity: '0',
      transform: 'translate3d(0, 7px, 0) scale(0.986)',
      filter: 'blur(5px)',
    },
    outMs: 150,
    from: { transform: 'translate3d(0, -9px, 0) scale(1.012)', filter: 'blur(6px)' },
    in: {
      transition: 'opacity 0.24s ease-out, transform 0.34s cubic-bezier(0.16, 1, 0.3, 1), filter 0.26s ease-out',
      opacity: '1',
      transform: 'translate3d(0, 0, 0) scale(1)',
      filter: 'blur(0)',
    },
    inMs: 340,
  },
  reduced: {
    out: {
      transition: 'opacity 0.12s ease-out, transform 0.12s ease-out, filter 0.12s ease-out',
      opacity: '0',
      transform: 'translate3d(0, 4px, 0) scale(0.994)',
      filter: 'blur(2px)',
    },
    outMs: 110,
    from: { transform: 'translate3d(0, -4px, 0) scale(1.004)', filter: 'blur(2px)' },
    in: {
      transition: 'opacity 0.16s ease-out, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), filter 0.16s ease-out',
      opacity: '1',
      transform: 'translate3d(0, 0, 0) scale(1)',
      filter: 'blur(0)',
    },
    inMs: 180,
  },
} satisfies Record<string, { out: Phase; outMs: number; from: Partial<Phase>; in: Phase; inMs: number }>;

const TONES: StatusTone[] = ['success', 'warning', 'error', 'busy'];

/**
 * Drives an existing `.atrium-statusbar` (see shell.css for the markup).
 * Ported from MOSAIC's StatusBarManager.animateStatusChange.
 */
export function createStatusbar(ctx: AtriumContext, bar: HTMLElement): Statusbar {
  const left = bar.querySelector<HTMLElement>('.atrium-statusbar-left');
  const right = bar.querySelector<HTMLElement>('.atrium-statusbar-right');
  if (!left) throw new Error('[Atrium] statusbar needs an .atrium-statusbar-left element');
  left.setAttribute('role', 'status');
  left.setAttribute('aria-live', 'polite');

  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const apply = (phase: Partial<Phase>) => {
    if (phase.transition !== undefined) left.style.transition = phase.transition;
    if (phase.opacity !== undefined) left.style.opacity = phase.opacity;
    if (phase.transform !== undefined) left.style.transform = phase.transform;
    if (phase.filter !== undefined) left.style.filter = phase.filter;
  };

  const clear = () => {
    for (const prop of ['transition', 'opacity', 'transform', 'filter', 'willChange'] as const) left.style[prop] = '';
  };

  const write = (text: string, tone: StatusTone) => {
    left.textContent = ctx.translate(text);
    left.classList.remove(...TONES.map((t) => `is-${t}`));
    if (tone !== 'default') left.classList.add(`is-${tone}`);
  };

  return {
    set(text, tone = 'default') {
      const mode = ctx.motion;
      if (timer) clearTimeout(timer);
      const mine = ++generation;

      if (mode === 'none') {
        clear();
        write(text, tone);
        return;
      }

      const swap = SWAP[mode === 'reduced' ? 'reduced' : 'full'];
      left.style.willChange = 'opacity, transform, filter';
      replayAnimation(bar, 'is-swapping');
      apply(swap.out);

      timer = setTimeout(() => {
        if (mine !== generation) return;
        write(text, tone);
        apply({ transition: 'none', opacity: '0', ...swap.from });

        requestAnimationFrame(() => {
          if (mine !== generation) return;
          apply(swap.in);
          timer = setTimeout(() => {
            if (mine === generation) clear();
          }, swap.inMs);
        });
      }, swap.outMs);
    },

    setRight(content) {
      if (!right) return;
      if (typeof content === 'string') right.textContent = ctx.translate(content);
      else right.replaceChildren(content);
    },

    bounce() {
      if (ctx.motion === 'none') return;
      replayAnimation(bar, 'is-bouncing');
    },
  };
}

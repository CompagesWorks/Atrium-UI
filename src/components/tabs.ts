import type { AtriumContext } from '../core/context';

/**
 * - 'slide': MOSAIC's main tab switch (sidebar). Outgoing panel slides left and
 *   fades, incoming slides in from the right with a passing shadow.
 * - 'step': MOSAIC's settings sub-tabs. Incoming panel slides 14px in the
 *   direction of travel (forward / back by button order).
 */
export type TabTransition = 'slide' | 'step';

export interface TabsOptions {
  /** Element whose direct children with [data-atrium-panel="name"] are the panels. */
  root: HTMLElement;
  /** Where the [data-atrium-tab="name"] buttons live. Default: document. */
  nav?: ParentNode;
  /** Default: 'slide'. */
  transition?: TabTransition;
  /** Panel shown first. Default: the first panel. */
  initial?: string;
  /** Plays the 'switchTab' sound on change. Default: true for 'slide', false for 'step' (as in MOSAIC). */
  sound?: boolean;
  /** Awaited before switching, e.g. to lazy-load the panel's content. */
  beforeChange?: (name: string, previous: string | null) => void | Promise<void>;
  onChange?: (name: string, previous: string | null) => void;
}

export interface Tabs {
  readonly current: string | null;
  show(name: string): Promise<void>;
  destroy(): void;
}

/**
 * GSAP's power eases, reproduced exactly. In GSAP, powerN uses exponent N + 1
 * (power2 = cubic, power3 = quartic), so these are NOT the cubic-bezier "cubic" curves.
 * They are sampled into CSS linear() easings; browsers without linear() get the
 * closest cubic-bezier.
 */
const gsapOut = (power: number) => (t: number) => 1 - (1 - t) ** (power + 1);
const gsapInOut = (power: number) => (t: number) =>
  t < 0.5 ? (2 * t) ** (power + 1) / 2 : 1 - (2 * (1 - t)) ** (power + 1) / 2;

const supportsLinearEasing = typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)');

function easing(fn: (t: number) => number, fallback: string): string {
  if (!supportsLinearEasing) return fallback;
  const steps = 64;
  const points = Array.from({ length: steps + 1 }, (_, i) => Number(fn(i / steps).toFixed(5)));
  return `linear(${points.join(', ')})`;
}

const EASE = {
  power3InOut: easing(gsapInOut(3), 'cubic-bezier(0.76, 0, 0.24, 1)'),
  power3Out: easing(gsapOut(3), 'cubic-bezier(0.25, 1, 0.5, 1)'),
};

const NO_SHADOW = '0 0 0 rgba(0, 0, 0, 0)';
const LIFT_SHADOW = '0 10px 40px rgba(0, 0, 0, 0.3)';

/** Matches MOSAIC's settings timeout (the CSS animation itself runs 0.2s). */
const STEP_CLEANUP_MS = 360;

export function createTabs(ctx: AtriumContext, options: TabsOptions): Tabs {
  const { root } = options;
  const nav = options.nav ?? document;
  const transition = options.transition ?? 'slide';
  const playSound = options.sound ?? transition === 'slide';

  root.classList.add(transition === 'slide' ? 'atrium-tab-stage' : 'atrium-subtab-stage');
  const panelClass = transition === 'slide' ? 'atrium-tab-panel' : 'atrium-subtab-panel';

  const panels = () => Array.from(root.querySelectorAll<HTMLElement>(':scope > [data-atrium-panel]'));
  const panel = (name: string) => panels().find((p) => p.dataset.atriumPanel === name) ?? null;
  const buttons = () =>
    Array.from(nav.querySelectorAll<HTMLElement>('[data-atrium-tab]')).filter((b) => panel(b.dataset.atriumTab!));

  panels().forEach((p) => {
    p.classList.add(panelClass);
    p.setAttribute('role', 'tabpanel');
  });

  let current: string | null = null;
  let requestId = 0;
  let settle: (() => void) | null = null;

  const setButtons = (name: string) => {
    buttons().forEach((b) => {
      const active = b.dataset.atriumTab === name;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
  };

  const showInstantly = (to: HTMLElement) => {
    panels().forEach((p) => {
      p.classList.toggle('is-active', p === to);
      p.classList.remove('is-entering', 'is-forward', 'is-back');
      p.style.removeProperty('z-index');
    });
  };

  const slide = (from: HTMLElement | null, to: HTMLElement) => {
    panels().forEach((p) => {
      if (p !== from && p !== to) p.classList.remove('is-active');
    });

    to.classList.add('is-active');
    to.style.zIndex = '2';
    if (from) from.style.zIndex = '1';

    const animations: Animation[] = [];

    if (from) {
      const out = from.animate(
        [
          { transform: 'translateX(0) scale(1)', opacity: 1 },
          { transform: 'translateX(-50px) scale(0.95)', opacity: 0 },
        ],
        { duration: 300, easing: EASE.power3InOut, fill: 'forwards' },
      );
      out.addEventListener('finish', () => {
        from.classList.remove('is-active');
        from.style.removeProperty('z-index');
        out.cancel();
      });
      animations.push(out);
    }

    animations.push(
      to.animate(
        [
          { transform: 'translateX(50px) scale(0.95)', opacity: 0, boxShadow: NO_SHADOW },
          { transform: 'translateX(0) scale(1)', opacity: 1, boxShadow: LIFT_SHADOW },
        ],
        { duration: 400, easing: EASE.power3Out, fill: 'forwards' },
      ),
    );

    // MOSAIC's code asks GSAP to fade the shadow out (0.2s, power2.inOut, 0.1s after
    // the entrance), but GSAP can't interpolate between its two box-shadow strings, so
    // in practice the shadow holds until 0.7s and is then cleared at once. Matched here.
    const shadow = to.animate([{ boxShadow: LIFT_SHADOW }, { boxShadow: LIFT_SHADOW }], {
      duration: 200,
      delay: 500,
      fill: 'forwards',
    });
    animations.push(shadow);

    const done = () => {
      animations.forEach((a) => a.cancel());
      showInstantly(to);
      settle = null;
    };
    settle = done;
    shadow.addEventListener('finish', () => {
      if (settle === done) done();
    });
  };

  const step = (from: HTMLElement | null, to: HTMLElement) => {
    const order = panels();
    const forward = !from || order.indexOf(to) >= order.indexOf(from);

    panels().forEach((p) => p.classList.toggle('is-active', p === to));
    to.classList.remove('is-forward', 'is-back');
    void to.offsetWidth; // restart the animation if re-entering quickly
    to.classList.add('is-entering', forward ? 'is-forward' : 'is-back');

    const timer = setTimeout(() => done(), STEP_CLEANUP_MS);
    const done = () => {
      clearTimeout(timer);
      showInstantly(to);
      settle = null;
    };
    settle = done;
  };

  const show = async (name: string) => {
    const to = panel(name);
    if (!to) {
      console.warn(`[Atrium] no tab panel named "${name}"`);
      return;
    }
    if (name === current) return;

    const id = ++requestId;
    const previous = current;
    if (playSound && previous !== null) ctx.playSound('switchTab');

    await options.beforeChange?.(name, previous);
    if (id !== requestId) return; // a newer switch started while loading

    settle?.(); // finish any running transition immediately
    const from = previous ? panel(previous) : null;
    current = name;
    setButtons(name);

    const instant =
      !from || (transition === 'slide' ? ctx.motion !== 'full' : ctx.motion === 'none');
    if (instant) showInstantly(to);
    else if (transition === 'slide') slide(from, to);
    else step(from, to);

    options.onChange?.(name, previous);
  };

  const onClick = (e: Event) => {
    const button = (e.target as Element | null)?.closest<HTMLElement>('[data-atrium-tab]');
    if (button && panel(button.dataset.atriumTab!)) void show(button.dataset.atriumTab!);
  };
  nav.addEventListener('click', onClick);

  buttons().forEach((b) => b.setAttribute('role', 'tab'));
  const first = options.initial ?? panels()[0]?.dataset.atriumPanel;
  if (first) void show(first);

  return {
    get current() {
      return current;
    },
    show,
    destroy() {
      settle?.();
      nav.removeEventListener('click', onClick);
    },
  };
}

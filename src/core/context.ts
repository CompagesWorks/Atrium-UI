export type ThemeName = 'dark' | 'light';
export type MotionMode = 'full' | 'reduced' | 'none';
export type SoundName = 'complete' | 'error' | 'notification' | 'switchTab';
export type TranslateParams = Record<string, string | number>;

export interface AtriumOptions {
  /** Translation hook. Receives a key (or plain text) and returns the translated string. */
  t?: (key: string, params?: TranslateParams) => string | null | undefined;
  /** Sound hook, called when toasts appear and when tabs change. */
  sounds?: { play(name: SoundName): void };
  /** Initial theme. Default: 'dark'. */
  theme?: ThemeName;
  /** Initial motion mode. Default: 'full', or 'reduced' when the OS asks for reduced motion. */
  motion?: MotionMode;
  /** Element that receives the toast container, overlay and modals. Default: document.body. */
  mount?: HTMLElement;
  toast?: {
    /** Max toasts in the stack before the oldest is dismissed. Default: 5. */
    maxVisible?: number;
    /** Identical toasts shown within this window (ms) are dropped. Default: 2000. */
    dedupeWindow?: number;
    /** Default display time (ms). Default: 3000. */
    duration?: number;
  };
}

/** Shared state handed to every component. */
export class AtriumContext {
  readonly mount: HTMLElement;
  readonly options: AtriumOptions;

  constructor(options: AtriumOptions) {
    this.options = options;
    this.mount = options.mount ?? document.body;
    this.setTheme(options.theme ?? 'dark');
    this.setMotion(options.motion ?? (prefersReducedMotion() ? 'reduced' : 'full'));
  }

  get motion(): MotionMode {
    return (document.documentElement.dataset.atriumMotion as MotionMode) ?? 'full';
  }

  setMotion(mode: MotionMode) {
    const root = document.documentElement;
    if (mode === 'full') delete root.dataset.atriumMotion;
    else root.dataset.atriumMotion = mode;
  }

  get theme(): ThemeName {
    return (document.documentElement.dataset.atriumTheme as ThemeName) ?? 'dark';
  }

  setTheme(theme: ThemeName) {
    document.documentElement.dataset.atriumTheme = theme;
  }

  /** Scales a full-motion duration (ms) to the current motion mode. */
  duration(fullMs: number): number {
    switch (this.motion) {
      case 'none':
        return 0;
      case 'reduced':
        return Math.min(fullMs, 150);
      default:
        return fullMs;
    }
  }

  translate(text: string, params: TranslateParams = {}): string {
    let result = text;
    const translated = this.options.t?.(text, params);
    if (translated) result = translated;

    for (const [key, value] of Object.entries(params)) {
      result = result.replaceAll(`{{${key}}}`, String(value));
    }
    return result;
  }

  playSound(name: SoundName) {
    try {
      this.options.sounds?.play(name);
    } catch (err) {
      console.warn('[Atrium] sound hook failed', err);
    }
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

import type { AtriumContext, SoundName, TranslateParams } from '../core/context';
import { el, icon } from '../core/dom';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  /** Display time in ms. */
  duration?: number;
  /** Interpolated into the message ({{name}}) and passed to the `t` hook. */
  params?: TranslateParams;
  action?: { text: string; onClick: () => void };
}

const ICONS: Record<ToastType, string> = {
  success: 'check-circle-fill',
  error: 'x-circle-fill',
  warning: 'exclamation-triangle-fill',
  info: 'info-circle-fill',
};

const SOUNDS: Record<ToastType, SoundName> = {
  success: 'complete',
  error: 'error',
  warning: 'notification',
  info: 'notification',
};

/** Matches the .is-hiding transition plus a small margin, as in MOSAIC. */
const HIDE_MS = 450;
const MAX_STACK_DEPTH = 4;

export class ToastManager {
  private readonly ctx: AtriumContext;
  private readonly container: HTMLElement;
  private toasts: HTMLElement[] = [];
  private history = new Map<string, number>();

  constructor(ctx: AtriumContext) {
    this.ctx = ctx;
    this.container = el('div', 'atrium-toast-container');
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-live', 'polite');
    ctx.mount.appendChild(this.container);
  }

  success(message: string, options?: ToastOptions) {
    return this.show('success', message, options);
  }

  error(message: string, options?: ToastOptions) {
    return this.show('error', message, options);
  }

  warning(message: string, options?: ToastOptions) {
    return this.show('warning', message, options);
  }

  info(message: string, options?: ToastOptions) {
    return this.show('info', message, options);
  }

  /** Shows a toast and returns a function that dismisses it, or null if it was deduplicated. */
  show(type: ToastType, message: string, options: ToastOptions = {}): (() => void) | null {
    const config = this.ctx.options.toast ?? {};
    const duration = options.duration ?? config.duration ?? 3000;
    const text = this.ctx.translate(message, options.params);
    if (!text) return null;

    if (this.isDuplicate(`${type}:${text}`, config.dedupeWindow ?? 2000)) return null;

    this.ctx.playSound(SOUNDS[type]);

    if (this.toasts.length >= (config.maxVisible ?? 5)) {
      this.hide(this.toasts[this.toasts.length - 1]);
    }

    const toast = el('div', `atrium-toast atrium-toast-${type}`);
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.style.setProperty('--toast-duration', `${duration}ms`);
    toast.append(icon(ICONS[type]), el('span', 'atrium-toast-message', text));

    if (options.action) {
      const { text: actionText, onClick } = options.action;
      const actionBtn = el('button', 'atrium-toast-action', this.ctx.translate(actionText));
      actionBtn.type = 'button';
      actionBtn.addEventListener('click', () => {
        onClick();
        this.hide(toast);
      });
      toast.appendChild(actionBtn);
    }

    const closeBtn = el('button', 'atrium-toast-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', this.ctx.translate('Close'));
    closeBtn.appendChild(icon('x'));
    closeBtn.addEventListener('click', () => this.hide(toast));
    toast.appendChild(closeBtn);

    this.container.prepend(toast);
    this.toasts.unshift(toast);
    this.startAutoHide(toast, duration);

    requestAnimationFrame(() => {
      toast.classList.add('is-shown');
      this.updateStack();
    });

    return () => this.hide(toast);
  }

  hide(toast: HTMLElement | undefined) {
    if (!toast || !toast.isConnected || toast.classList.contains('is-hiding')) return;

    toast.classList.remove('is-shown');
    toast.removeAttribute('data-stacked');
    toast.classList.add('is-hiding');
    this.toasts = this.toasts.filter((t) => t !== toast);
    this.updateStack();

    setTimeout(() => toast.remove(), this.ctx.duration(HIDE_MS));
  }

  clear() {
    [...this.toasts].forEach((toast) => this.hide(toast));
  }

  destroy() {
    this.toasts = [];
    this.container.remove();
  }

  /** Pauses the countdown while hovered, then resumes with the time that was left. */
  private startAutoHide(toast: HTMLElement, duration: number) {
    let remaining = duration;
    let startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => this.hide(toast), remaining);

    toast.addEventListener('mouseenter', () => {
      toast.classList.add('is-paused');
      if (timer) clearTimeout(timer);
      timer = null;
      remaining = Math.max(remaining - (Date.now() - startedAt), 500);
    });

    toast.addEventListener('mouseleave', () => {
      toast.classList.remove('is-paused');
      startedAt = Date.now();
      timer = setTimeout(() => this.hide(toast), remaining);
    });
  }

  private updateStack() {
    this.toasts.forEach((toast, i) => {
      toast.style.setProperty('--stack-index', String(Math.min(i, MAX_STACK_DEPTH)));
      if (i === 0) toast.removeAttribute('data-stacked');
      else toast.setAttribute('data-stacked', 'true');
    });
  }

  private isDuplicate(key: string, windowMs: number): boolean {
    const now = Date.now();
    for (const [k, at] of this.history) {
      if (now - at > Math.max(windowMs, 10_000)) this.history.delete(k);
    }
    const last = this.history.get(key);
    if (last !== undefined && now - last < windowMs) return true;
    this.history.set(key, now);
    return false;
  }
}

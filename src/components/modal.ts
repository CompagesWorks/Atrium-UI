import type { AtriumContext, TranslateParams } from '../core/context';
import { el, icon, replayAnimation } from '../core/dom';

export type ModalSize = 'small' | 'normal' | 'large' | 'fullscreen';
export type ModalTone = 'default' | 'danger' | 'warning' | 'success';
export type ButtonVariant = 'primary' | 'secondary' | 'cancel' | 'danger';

export interface ModalButton {
  text: string;
  variant?: ButtonVariant;
  id?: string;
  /** Return false (or throw) to keep the modal open. */
  onClick?: (event: MouseEvent, modal: ModalHandle) => void | boolean | Promise<void | boolean>;
  /** Default: true. */
  closeOnClick?: boolean;
  /** Focus this button when the modal opens. */
  autofocus?: boolean;
}

export interface ModalOptions {
  id?: string;
  title: string;
  /** Bootstrap Icons name shown before the title, e.g. 'exclamation-triangle-fill'. */
  icon?: string;
  tone?: ModalTone;
  /** A string is inserted as HTML: only pass trusted markup. */
  body: string | Node;
  size?: ModalSize;
  /** Default: a single "Close" button. Pass [] for no footer. */
  buttons?: ModalButton[];
  /** Shows an X in the header. Default: false (MOSAIC's custom modals have none). */
  closeButton?: boolean;
  /** Default: true. */
  escapeToClose?: boolean;
  /** Default: true. */
  clickOverlayToClose?: boolean;
  /** Extra class on the modal element. */
  className?: string;
  params?: TranslateParams;
  onClose?: () => void;
}

export interface PromptOptions {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  /** Initial value, selected when the modal opens. */
  value?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  /** A textarea instead of a single-line input (Ctrl+Enter submits). */
  multiline?: boolean;
  /** Default: true. Empty (whitespace-only) answers are refused. */
  required?: boolean;
  /** Return an error message to refuse the value (the modal shakes and shows it). */
  validate?: (value: string) => string | null | undefined | void | Promise<string | null | undefined | void>;
  params?: TranslateParams;
}

export interface ModalHandle {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  close(): Promise<void>;
  /** MOSAIC's error shake, e.g. on invalid input. */
  shake(): void;
}

interface OpenModal {
  handle: ModalHandle;
  options: ModalOptions;
  restoreFocus: Element | null;
  closing: boolean;
}

/** Matches the CSS: 0.4s in / 0.3s out for modals, 0.25s out for the overlay. */
const MODAL_OUT_MS = 300;
const OVERLAY_OUT_MS = 250;

export class ModalManager {
  private readonly ctx: AtriumContext;
  private readonly overlay: HTMLElement;
  private stack: OpenModal[] = [];
  private overlayTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerDownOnOverlay = false;

  constructor(ctx: AtriumContext) {
    this.ctx = ctx;
    this.overlay = el('div', 'atrium-modal-overlay');
    ctx.mount.appendChild(this.overlay);

    // Only close when the whole click happened on the overlay, so drag-selecting
    // text inside a modal and releasing outside does not dismiss it.
    this.overlay.addEventListener('pointerdown', (e) => {
      this.pointerDownOnOverlay = e.target === this.overlay;
    });
    this.overlay.addEventListener('click', (e) => {
      const top = this.top();
      if (this.pointerDownOnOverlay && e.target === this.overlay && top) {
        if (top.options.clickOverlayToClose !== false) void top.handle.close();
        else top.handle.shake();
      }
      this.pointerDownOnOverlay = false;
    });

    document.addEventListener('keydown', this.onKeyDown);
  }

  open(options: ModalOptions): ModalHandle {
    if (options.id) document.getElementById(options.id)?.remove();

    const modal = el('div', 'atrium-modal');
    if (options.size && options.size !== 'normal') modal.classList.add(`atrium-modal-${options.size}`);
    if (options.tone && options.tone !== 'default') modal.classList.add(`atrium-modal-${options.tone}`);
    if (options.className) modal.classList.add(...options.className.split(' ').filter(Boolean));
    if (options.id) modal.id = options.id;
    modal.classList.toggle('is-stacked', this.stack.length > 0);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const titleId = `${options.id ?? 'atrium-modal'}-title-${Date.now()}`;
    modal.setAttribute('aria-labelledby', titleId);

    const header = el('div', 'atrium-modal-header');
    const title = el('h3', 'atrium-modal-title');
    title.id = titleId;
    if (options.icon) title.appendChild(icon(options.icon));
    title.append(this.ctx.translate(options.title, options.params));
    header.appendChild(title);

    const body = el('div', 'atrium-modal-body');
    if (typeof options.body === 'string') body.innerHTML = options.body;
    else body.appendChild(options.body);

    modal.append(header, body);

    let closePromise: Promise<void> | null = null;
    const handle: ModalHandle = {
      element: modal,
      body,
      close: () => (closePromise ??= this.close(entry)),
      shake: () => replayAnimation(modal, 'atrium-shake-centered'),
    };
    const entry: OpenModal = {
      handle,
      options,
      restoreFocus: document.activeElement,
      closing: false,
    };

    if (options.closeButton) {
      const closeBtn = el('button', 'atrium-modal-close');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', this.ctx.translate('Close'));
      closeBtn.appendChild(icon('x-lg'));
      closeBtn.addEventListener('click', () => void handle.close());
      header.appendChild(closeBtn);
    }

    const buttons = options.buttons ?? [{ text: 'Close', variant: 'secondary' }];
    let autofocusTarget: HTMLElement | null = null;
    if (buttons.length > 0) {
      const footer = el('div', 'atrium-modal-footer');
      for (const config of buttons) {
        const btn = this.createButton(config, handle);
        if (config.autofocus) autofocusTarget = btn;
        footer.appendChild(btn);
      }
      modal.appendChild(footer);
    }

    this.ctx.mount.appendChild(modal);
    this.stack.push(entry);
    this.showOverlay();
    modal.classList.add('is-open');
    this.settleWhenEntered(modal);

    const focusTarget =
      autofocusTarget ??
      body.querySelector<HTMLElement>('input, textarea, select, [autofocus]') ??
      modal.querySelector<HTMLElement>('.atrium-btn-primary, .atrium-btn-danger');
    focusTarget?.focus({ preventScroll: true });

    return handle;
  }

  /** Resolves true when confirmed, false when cancelled or dismissed. */
  confirm(options: {
    title: string;
    message: string | Node;
    confirmText?: string;
    cancelText?: string;
    icon?: string;
    danger?: boolean;
    params?: TranslateParams;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      let confirmed = false;
      this.open({
        title: options.title,
        icon: options.icon ?? (options.danger ? 'exclamation-triangle-fill' : undefined),
        tone: options.danger ? 'danger' : 'default',
        body: typeof options.message === 'string' ? textParagraph(this.ctx.translate(options.message, options.params)) : options.message,
        params: options.params,
        buttons: [
          { text: options.cancelText ?? 'Cancel', variant: 'cancel' },
          {
            text: options.confirmText ?? 'Confirm',
            variant: options.danger ? 'danger' : 'primary',
            autofocus: true,
            onClick: () => {
              confirmed = true;
            },
          },
        ],
        onClose: () => resolve(confirmed),
      });
    });
  }

  /**
   * Asks for a single value. Resolves with the trimmed text, or null when cancelled.
   * Invalid values (see `required` / `validate`) keep the modal open, shake it and show the error.
   */
  prompt(options: PromptOptions): Promise<string | null> {
    const t = (text: string) => this.ctx.translate(text, options.params);
    const body = el('div', 'atrium-prompt');
    if (options.message) body.appendChild(el('p', 'atrium-prompt-message', t(options.message)));

    const fieldId = `atrium-prompt-${Date.now()}`;
    if (options.label) {
      const label = el('label', 'atrium-label', t(options.label));
      label.htmlFor = fieldId;
      body.appendChild(label);
    }

    const field = options.multiline ? el('textarea', 'atrium-input') : el('input', 'atrium-input');
    field.id = fieldId;
    field.value = options.value ?? '';
    if (options.placeholder) field.placeholder = t(options.placeholder);
    if (field instanceof HTMLInputElement) field.type = 'text';
    field.setAttribute('aria-describedby', `${fieldId}-error`);
    body.appendChild(field);

    const error = el('p', 'atrium-field-error');
    error.id = `${fieldId}-error`;
    error.setAttribute('role', 'alert');
    body.appendChild(error);

    const setError = (message: string) => {
      error.textContent = message;
      field.classList.toggle('is-invalid', !!message);
      field.setAttribute('aria-invalid', String(!!message));
    };
    field.addEventListener('input', () => setError(''));

    return new Promise((resolve) => {
      let result: string | null = null;
      let confirmButton: HTMLButtonElement | null = null;

      const handle = this.open({
        title: options.title,
        icon: options.icon,
        size: options.multiline ? 'normal' : 'small',
        body,
        params: options.params,
        buttons: [
          { text: options.cancelText ?? 'Cancel', variant: 'cancel' },
          {
            text: options.confirmText ?? 'OK',
            variant: 'primary',
            onClick: async (_e, modal) => {
              const value = field.value.trim();
              let message = '';
              if (options.required !== false && !value) message = t('Please enter a value.');
              else message = (await options.validate?.(value)) || '';
              if (message) {
                setError(t(message));
                modal.shake();
                field.focus();
                return false;
              }
              result = value;
            },
          },
        ],
        onClose: () => resolve(result),
      });

      confirmButton = handle.element.querySelector<HTMLButtonElement>('.atrium-btn-primary');
      (field as HTMLElement).addEventListener('keydown', (e: KeyboardEvent) => {
        const submit = options.multiline ? e.key === 'Enter' && (e.ctrlKey || e.metaKey) : e.key === 'Enter';
        if (submit && !e.isComposing) {
          e.preventDefault();
          confirmButton?.click();
        }
      });
      field.select();
    });
  }

  /** Resolves once the alert is dismissed. */
  alert(options: {
    title: string;
    message: string | Node;
    tone?: ModalTone;
    okText?: string;
    params?: TranslateParams;
  }): Promise<void> {
    const icons: Record<ModalTone, string> = {
      default: 'info-circle-fill',
      success: 'check-circle-fill',
      warning: 'exclamation-triangle-fill',
      danger: 'x-circle-fill',
    };
    const tone = options.tone ?? 'default';
    return new Promise((resolve) => {
      this.open({
        title: options.title,
        icon: icons[tone],
        tone,
        size: 'small',
        body: typeof options.message === 'string' ? textParagraph(this.ctx.translate(options.message, options.params)) : options.message,
        params: options.params,
        buttons: [{ text: options.okText ?? 'OK', variant: 'primary', autofocus: true }],
        onClose: () => resolve(),
      });
    });
  }

  closeAll(): Promise<void> {
    return Promise.all([...this.stack].map((m) => m.handle.close())).then(() => undefined);
  }

  get openCount(): number {
    return this.stack.filter((m) => !m.closing).length;
  }

  destroy() {
    document.removeEventListener('keydown', this.onKeyDown);
    this.stack.forEach((m) => m.handle.element.remove());
    this.stack = [];
    this.overlay.remove();
  }

  private createButton(config: ModalButton, handle: ModalHandle): HTMLButtonElement {
    const btn = el('button', `atrium-btn atrium-btn-${config.variant ?? 'secondary'}`, this.ctx.translate(config.text));
    btn.type = 'button';
    if (config.id) btn.id = config.id;

    btn.addEventListener('click', async (e) => {
      let shouldClose = config.closeOnClick !== false;
      if (config.onClick) {
        btn.disabled = true;
        try {
          if ((await config.onClick(e, handle)) === false) shouldClose = false;
        } catch (err) {
          console.error('[Atrium] modal button handler failed', err);
          shouldClose = false;
        } finally {
          btn.disabled = false;
        }
      }
      if (shouldClose) await handle.close();
    });
    return btn;
  }

  private async close(entry: OpenModal): Promise<void> {
    if (entry.closing || !this.stack.includes(entry)) return;
    entry.closing = true;

    const modal = entry.handle.element;
    modal.classList.remove('atrium-shake-centered');
    modal.classList.add('is-closing');
    this.hideOverlayIfIdle();

    await wait(this.ctx.duration(MODAL_OUT_MS));

    modal.remove();
    this.stack = this.stack.filter((m) => m !== entry);
    if (entry.restoreFocus instanceof HTMLElement && entry.restoreFocus.isConnected) {
      entry.restoreFocus.focus({ preventScroll: true });
    }
    entry.options.onClose?.();
  }

  /** Swaps the entrance animation for a static "shown" state once it has played. */
  private settleWhenEntered(modal: HTMLElement) {
    const settle = () => {
      modal.removeEventListener('animationend', onEnd);
      modal.classList.add('is-shown');
    };
    const onEnd = (e: AnimationEvent) => {
      if (e.target === modal) settle();
    };

    if (this.ctx.motion === 'none') {
      settle();
      return;
    }
    modal.addEventListener('animationend', onEnd);
    setTimeout(settle, 600); // fallback if animationend never fires
  }

  private showOverlay() {
    if (this.overlayTimer) {
      clearTimeout(this.overlayTimer);
      this.overlayTimer = null;
    }
    this.overlay.classList.remove('is-closing');
    this.overlay.classList.add('is-open');
  }

  private hideOverlayIfIdle() {
    if (this.openCount > 0) return;
    this.overlay.classList.add('is-closing');
    this.overlayTimer = setTimeout(() => {
      this.overlay.classList.remove('is-open', 'is-closing');
      this.overlayTimer = null;
    }, this.ctx.duration(OVERLAY_OUT_MS));
  }

  private top(): OpenModal | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (!this.stack[i].closing) return this.stack[i];
    }
    return undefined;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const top = this.top();
    if (!top) return;

    if (e.key === 'Escape' && top.options.escapeToClose !== false) {
      e.preventDefault();
      void top.handle.close();
    } else if (e.key === 'Tab') {
      trapFocus(top.handle.element, e);
    }
  };
}

function textParagraph(text: string): HTMLElement {
  return el('p', undefined, text);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab / Shift+Tab inside the topmost modal. */
function trapFocus(modal: HTMLElement, e: KeyboardEvent) {
  const items = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;

  if (!modal.contains(active)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

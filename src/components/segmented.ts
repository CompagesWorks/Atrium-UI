import type { AtriumContext } from '../core/context';
import { el, icon } from '../core/dom';

export interface SegmentOption {
  value: string;
  label?: string;
  /** Bootstrap Icons name. */
  icon?: string;
  disabled?: boolean;
}

export interface SegmentedOptions {
  /** Builds the buttons from this list; otherwise the element's <button data-value> children are used. */
  options?: SegmentOption[];
  /** Initially selected value. Default: the button with aria-checked="true", else the first one. */
  value?: string;
  onChange?: (value: string) => void;
  /** Accessible name when the element has no aria-label. */
  label?: string;
}

export interface Segmented {
  readonly element: HTMLElement;
  readonly value: string;
  /** Selects a value without calling onChange. */
  setValue(value: string): void;
  destroy(): void;
}

/**
 * Segmented control: a single-choice group (role="radiogroup") with a sliding selection.
 * Arrow keys move between options, as with radio buttons.
 */
export function createSegmented(ctx: AtriumContext, element: HTMLElement, options: SegmentedOptions = {}): Segmented {
  element.classList.add('atrium-segmented');
  element.setAttribute('role', 'radiogroup');
  if (options.label && !element.hasAttribute('aria-label')) element.setAttribute('aria-label', ctx.translate(options.label));

  if (options.options) {
    element.replaceChildren(
      ...options.options.map((opt) => {
        const button = el('button');
        button.dataset.value = opt.value;
        button.disabled = !!opt.disabled;
        if (opt.icon) button.appendChild(icon(opt.icon));
        if (opt.label) button.append(ctx.translate(opt.label));
        else if (opt.icon) button.setAttribute('aria-label', opt.value);
        return button;
      }),
    );
  }

  const buttons = () => Array.from(element.querySelectorAll<HTMLButtonElement>(':scope > button[data-value]'));
  buttons().forEach((b) => {
    b.type = 'button';
    b.setAttribute('role', 'radio');
  });

  const indicator = el('span', 'atrium-segmented-indicator');
  indicator.setAttribute('aria-hidden', 'true');
  element.prepend(indicator);

  let value =
    options.value ?? buttons().find((b) => b.getAttribute('aria-checked') === 'true')?.dataset.value ?? buttons()[0]?.dataset.value ?? '';

  const place = (instant: boolean) => {
    const current = buttons().find((b) => b.dataset.value === value);
    indicator.classList.toggle('is-instant', instant);
    indicator.style.opacity = current ? '1' : '0';
    if (!current) return;
    indicator.style.width = `${current.offsetWidth}px`;
    indicator.style.transform = `translateX(${current.offsetLeft}px)`;
    if (instant) void indicator.offsetWidth; // apply before transitions come back
  };

  const sync = (instant = false) => {
    buttons().forEach((b) => {
      const on = b.dataset.value === value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    place(instant);
  };

  const select = (next: string, focus = false) => {
    const target = buttons().find((b) => b.dataset.value === next && !b.disabled);
    if (!target || next === value) return;
    value = next;
    sync();
    if (focus) target.focus();
    options.onChange?.(value);
  };

  const onClick = (e: MouseEvent) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button[data-value]');
    if (button && element.contains(button) && !button.disabled) select(button.dataset.value!);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const enabled = buttons().filter((b) => !b.disabled);
    const index = enabled.findIndex((b) => b.dataset.value === value);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    let next: HTMLButtonElement | undefined;
    if (step) next = enabled[(index + step + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    select(next.dataset.value!, true);
  };

  element.addEventListener('click', onClick);
  element.addEventListener('keydown', onKeyDown);

  // Re-measure when labels, fonts or the container change size.
  const resize = new ResizeObserver(() => place(true));
  resize.observe(element);
  buttons().forEach((b) => resize.observe(b));
  void document.fonts?.ready.then(() => place(true));

  sync(true);

  return {
    element,
    get value() {
      return value;
    },
    setValue(next: string) {
      if (!buttons().some((b) => b.dataset.value === next)) return;
      value = next;
      sync();
    },
    destroy() {
      resize.disconnect();
      element.removeEventListener('click', onClick);
      element.removeEventListener('keydown', onKeyDown);
      indicator.remove();
    },
  };
}

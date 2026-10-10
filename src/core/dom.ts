export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function icon(name: string): HTMLElement {
  return el('i', `bi bi-${name}`);
}

/**
 * Sets --atrium-index on each child so `.atrium-enter-list` items animate in one after another.
 */
export function stagger(container: HTMLElement, selector = ':scope > *') {
  container.querySelectorAll<HTMLElement>(selector).forEach((child, index) => {
    child.style.setProperty('--atrium-index', String(index));
  });
}

/** Re-triggers a one-shot animation class (e.g. 'atrium-shake') on an element. */
export function replayAnimation(target: HTMLElement, className: string) {
  target.classList.remove(className);
  void target.offsetWidth; // force reflow so the animation restarts
  target.classList.add(className);
  target.addEventListener('animationend', () => target.classList.remove(className), { once: true });
}

/**
 * MOSAIC's "jump to setting" highlight: scrolls `target` into view and pulses it with an
 * accent outline, then fades out after `duration` ms or on the first click inside it.
 * Works on .atrium-settings-section and .atrium-setting-row.
 */
export function highlight(target: HTMLElement, duration = 3000) {
  const still = document.documentElement.dataset.atriumMotion === 'none';
  target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
  if (still) return;

  target.classList.remove('is-highlight-fading');
  target.classList.add('is-highlighted');

  let done = false;
  const fade = () => {
    if (done) return;
    done = true;
    target.removeEventListener('pointerdown', fade);
    target.classList.remove('is-highlighted');
    target.classList.add('is-highlight-fading');
    setTimeout(() => target.classList.remove('is-highlight-fading'), 500);
  };
  target.addEventListener('pointerdown', fade);
  setTimeout(fade, duration);
}

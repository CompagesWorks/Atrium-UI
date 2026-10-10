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

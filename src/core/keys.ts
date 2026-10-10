/**
 * Keyboard shortcuts written as 'Mod+Shift+P', 'Ctrl+S', 'Alt+Enter', 'F2', '/'.
 * `Mod` is ⌘ on macOS and Ctrl elsewhere.
 */

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

interface ParsedShortcut {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  del: 'delete',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  plus: '+',
};

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split(/\+(?!$)/).map((p) => p.trim().toLowerCase());
  const key = parts.pop() ?? '';
  const has = (name: string) => parts.includes(name);
  return {
    ctrl: has('ctrl') || has('control') || (!isMac && has('mod')),
    meta: has('meta') || has('cmd') || (isMac && has('mod')),
    alt: has('alt') || has('option'),
    shift: has('shift'),
    key: ALIASES[key] ?? key,
  };
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const s = parseShortcut(shortcut);
  const key = event.key.toLowerCase();
  // Use `code` for letters/digits so Shift or AZERTY layouts don't change the match.
  const codeKey = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : /^Digit\d$/.test(event.code) ? event.code.slice(5) : null;
  const keyMatches = key === s.key || (s.key.length === 1 && codeKey === s.key);
  // Symbols like '?' already need Shift on most layouts, so Shift is only checked for other keys.
  const isSymbol = s.key.length === 1 && !/[a-z0-9]/.test(s.key);
  const shiftMatches = s.shift ? event.shiftKey : isSymbol || !event.shiftKey;
  return keyMatches && shiftMatches && event.ctrlKey === s.ctrl && event.metaKey === s.meta && event.altKey === s.alt;
}

const LABELS: Record<string, string> = {
  escape: 'Esc',
  enter: '↵',
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: 'Del',
  tab: 'Tab',
};

/** Splits a shortcut into the labels to display, e.g. 'Mod+K' → ['Ctrl', 'K'] (['⌘', 'K'] on macOS). */
export function formatShortcut(shortcut: string): string[] {
  const s = parseShortcut(shortcut);
  const keys: string[] = [];
  if (s.ctrl) keys.push(isMac ? '⌃' : 'Ctrl');
  if (s.alt) keys.push(isMac ? '⌥' : 'Alt');
  if (s.shift) keys.push(isMac ? '⇧' : 'Shift');
  if (s.meta) keys.push(isMac ? '⌘' : 'Win');
  keys.push(LABELS[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : s.key.charAt(0).toUpperCase() + s.key.slice(1)));
  return keys;
}

/** Builds <kbd class="atrium-kbd"> chips for a shortcut. */
export function renderShortcut(shortcut: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'atrium-kbd-group';
  wrap.setAttribute('aria-label', formatShortcut(shortcut).join(' '));
  for (const label of formatShortcut(shortcut)) {
    const kbd = document.createElement('kbd');
    kbd.className = 'atrium-kbd';
    kbd.textContent = label;
    wrap.appendChild(kbd);
  }
  return wrap;
}

/** True while the user is typing in a field, where global shortcuts should not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

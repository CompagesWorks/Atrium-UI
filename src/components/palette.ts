import type { AtriumContext } from '../core/context';
import { el, icon } from '../core/dom';
import { isTypingTarget, matchesShortcut, renderShortcut } from '../core/keys';

export interface Command {
  /** Unique id; registering the same id again replaces the command. */
  id: string;
  title: string;
  /** Bootstrap Icons name. */
  icon?: string;
  /** Group heading, e.g. 'Navigation'. */
  section?: string;
  /** Extra words that should match the search, e.g. ['preferences'] for "Settings". */
  keywords?: string[];
  /** Global keyboard shortcut, e.g. 'Mod+,' — shown in the palette and active anywhere in the app. */
  shortcut?: string;
  /** Short text on the right, e.g. the current value. */
  hint?: string;
  /** Hidden (and its shortcut inactive) while this returns false. */
  when?: () => boolean;
  run: () => void | Promise<void>;
}

export interface PaletteOptions {
  /** Shortcut that opens the palette. Default: 'Mod+K'. `false` disables it. */
  hotkey?: string | false;
  placeholder?: string;
  /** Shown when nothing matches. */
  emptyText?: string;
}

interface Match {
  command: Command;
  score: number;
  /** Matched character positions in the title, for highlighting. */
  positions: number[];
}

/** Scores `text` against `query`: prefix > word start > substring > in-order letters. 0 = no match. */
function score(text: string, query: string): { score: number; positions: number[] } {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return { score: 1, positions: [] };

  const at = t.indexOf(q);
  if (at !== -1) {
    const wordStart = at === 0 || /[\s\-_/.:]/.test(t[at - 1]);
    const positions = Array.from({ length: q.length }, (_, i) => at + i);
    return { score: at === 0 ? 100 : wordStart ? 80 : 60, positions };
  }

  // Each typed word as letters in order (e.g. "tgl thm" → "Toggle … theme"), starting at a word
  // start when possible; rewards consecutive letters and word starts.
  const isWordStart = (i: number) => i === 0 || /[\s\-_/.:]/.test(t[i - 1]);
  const subsequence = (word: string, start: number): number[] | null => {
    const found: number[] = [];
    let from = start;
    for (const ch of word) {
      const i = t.indexOf(ch, from);
      if (i === -1) return null;
      found.push(i);
      from = i + 1;
    }
    return found;
  };

  const positions: number[] = [];
  let from = 0;
  for (const word of q.split(/\s+/).filter(Boolean)) {
    let found: number[] | null = null;
    for (let i = t.indexOf(word[0], from); i !== -1 && !found; i = t.indexOf(word[0], i + 1)) {
      if (isWordStart(i)) found = subsequence(word, i);
    }
    found ??= subsequence(word, from);
    if (!found) return { score: 0, positions: [] };
    positions.push(...found);
    from = found[found.length - 1] + 1;
  }

  let points = 0;
  positions.forEach((p, n) => {
    if (n > 0 && p === positions[n - 1] + 1) points += 3;
    if (isWordStart(p)) points += 2;
  });
  return { score: 10 + points - (positions[positions.length - 1] - positions[0]) * 0.1, positions };
}

/** Matches on the title first, then on keywords / section (no highlight for those). */
function match(command: Command, query: string): Match | null {
  const title = score(command.title, query);
  if (title.score > 0) return { command, score: title.score, positions: title.positions };
  // e.g. "go set" → section "Go to" + title "Settings page"
  const extra = [command.section ?? '', command.title, ...(command.keywords ?? [])].join(' ');
  const other = score(extra, query);
  return other.score > 0 ? { command, score: other.score * 0.5, positions: [] } : null;
}

/** Matches MOSAIC's modal timings. */
const CLOSE_MS = 200;

/**
 * Command palette (Atrium addition, in MOSAIC's modal and menu style): a searchable list
 * of app actions opened with Ctrl+K / ⌘K. Commands with a `shortcut` also work globally.
 */
export class CommandPalette {
  private readonly ctx: AtriumContext;
  private readonly options: PaletteOptions;
  private readonly commands = new Map<string, Command>();
  private readonly overlay: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;
  private results: Match[] = [];
  private active = 0;
  private restoreFocus: Element | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: AtriumContext, options: PaletteOptions = {}) {
    this.ctx = ctx;
    this.options = options;

    this.overlay = el('div', 'atrium-palette-overlay');
    this.panel = el('div', 'atrium-palette');
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', ctx.translate('Command palette'));

    const search = el('div', 'atrium-palette-search');
    search.appendChild(icon('search'));
    this.input = el('input', 'atrium-palette-input');
    this.input.type = 'text';
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.input.placeholder = ctx.translate(options.placeholder ?? 'Type a command or search…');
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-expanded', 'true');
    this.input.setAttribute('aria-controls', 'atrium-palette-list');
    this.input.setAttribute('aria-autocomplete', 'list');
    search.appendChild(this.input);

    this.list = el('div', 'atrium-palette-list');
    this.list.id = 'atrium-palette-list';
    this.list.setAttribute('role', 'listbox');

    const footer = el('div', 'atrium-palette-footer');
    for (const [keys, label] of [
      ['ArrowUp', 'ArrowDown'],
      ['Enter'],
      ['Escape'],
    ].map((k, i) => [k, ['to navigate', 'to run', 'to close'][i]] as const)) {
      const hint = el('span', 'atrium-palette-footer-hint');
      for (const key of keys) hint.appendChild(renderShortcut(key));
      hint.append(ctx.translate(label));
      footer.appendChild(hint);
    }

    this.panel.append(search, this.list, footer);
    this.overlay.appendChild(this.panel);
    ctx.mount.appendChild(this.overlay);

    this.input.addEventListener('input', () => this.search());
    this.input.addEventListener('keydown', this.onInputKeyDown);
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', this.onGlobalKeyDown);
  }

  get isOpen(): boolean {
    return this.overlay.classList.contains('is-open') && !this.overlay.classList.contains('is-closing');
  }

  /** Adds or replaces commands. Returns a function that removes them. */
  register(commands: Command | Command[]): () => void {
    const list = Array.isArray(commands) ? commands : [commands];
    list.forEach((c) => this.commands.set(c.id, c));
    if (this.isOpen) this.search();
    return () => {
      list.forEach((c) => {
        if (this.commands.get(c.id) === c) this.commands.delete(c.id);
      });
      if (this.isOpen) this.search();
    };
  }

  open(query = '') {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    if (!this.isOpen) this.restoreFocus = document.activeElement;
    this.overlay.classList.remove('is-closing');
    this.overlay.classList.add('is-open');
    this.input.value = query;
    this.search();
    this.input.focus({ preventScroll: true });
    this.input.select();
  }

  close() {
    if (!this.isOpen) return;
    const finish = () => {
      this.overlay.classList.remove('is-open', 'is-closing');
      this.closeTimer = null;
      if (this.restoreFocus instanceof HTMLElement && this.restoreFocus.isConnected) {
        this.restoreFocus.focus({ preventScroll: true });
      }
    };
    const delay = this.ctx.duration(CLOSE_MS);
    if (delay === 0) {
      finish();
      return;
    }
    this.overlay.classList.add('is-closing');
    this.closeTimer = setTimeout(finish, delay);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Runs a registered command by id (respecting `when`). */
  async run(id: string) {
    const command = this.commands.get(id);
    if (command && (command.when?.() ?? true)) await command.run();
  }

  destroy() {
    document.removeEventListener('keydown', this.onGlobalKeyDown);
    this.overlay.remove();
    this.commands.clear();
  }

  private available(): Command[] {
    return [...this.commands.values()].filter((c) => c.when?.() ?? true);
  }

  private search() {
    const query = this.input.value.trim();
    const matches = this.available()
      .map((c) => match(c, query))
      .filter((m): m is Match => m !== null);

    // With a query, best matches first; without one, keep sections together in registration order.
    if (query) matches.sort((a, b) => b.score - a.score);
    else {
      const order = [...new Set(matches.map((m) => m.command.section ?? ''))];
      matches.sort((a, b) => order.indexOf(a.command.section ?? '') - order.indexOf(b.command.section ?? ''));
    }

    this.results = matches;
    this.active = 0;
    this.render(!query);
  }

  private render(grouped: boolean) {
    this.list.replaceChildren();
    if (this.results.length === 0) {
      this.list.appendChild(el('div', 'atrium-palette-empty', this.ctx.translate(this.options.emptyText ?? 'No matching commands')));
      this.input.removeAttribute('aria-activedescendant');
      return;
    }

    let section: string | undefined;
    this.results.forEach((m, i) => {
      const c = m.command;
      if (grouped && c.section && c.section !== section) {
        section = c.section;
        this.list.appendChild(el('div', 'atrium-palette-section', this.ctx.translate(section)));
      }

      const item = el('div', 'atrium-palette-item');
      item.id = `atrium-palette-item-${i}`;
      item.setAttribute('role', 'option');
      if (c.icon) item.appendChild(icon(c.icon));

      const title = el('span', 'atrium-palette-title');
      const text = this.ctx.translate(c.title);
      if (m.positions.length && text === c.title) {
        let last = 0;
        for (const pos of m.positions) {
          if (pos > last) title.append(text.slice(last, pos));
          title.appendChild(el('mark', 'atrium-palette-match', text[pos]));
          last = pos + 1;
        }
        title.append(text.slice(last));
      } else {
        title.textContent = text;
      }
      item.appendChild(title);

      if (!grouped && c.section) item.appendChild(el('span', 'atrium-palette-item-section', this.ctx.translate(c.section)));
      if (c.hint) item.appendChild(el('span', 'atrium-palette-hint', this.ctx.translate(c.hint)));
      if (c.shortcut) item.appendChild(renderShortcut(c.shortcut));

      item.addEventListener('pointermove', () => {
        if (this.active !== i) this.setActive(i, false);
      });
      item.addEventListener('click', () => void this.execute(i));
      this.list.appendChild(item);
    });
    this.setActive(0, false);
  }

  private setActive(index: number, scroll = true) {
    const items = this.list.querySelectorAll<HTMLElement>('.atrium-palette-item');
    if (!items.length) return;
    this.active = (index + items.length) % items.length;
    items.forEach((item, i) => {
      const on = i === this.active;
      item.classList.toggle('is-active', on);
      item.setAttribute('aria-selected', String(on));
    });
    const current = items[this.active];
    this.input.setAttribute('aria-activedescendant', current.id);
    if (scroll) current.scrollIntoView({ block: 'nearest' });
  }

  private async execute(index: number) {
    const m = this.results[index];
    if (!m) return;
    this.close();
    try {
      await m.command.run();
    } catch (err) {
      console.error(`[Atrium] command "${m.command.id}" failed`, err);
    }
  }

  private onInputKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.setActive(this.active + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.setActive(this.active - 1);
        break;
      case 'Home':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.setActive(0);
        }
        break;
      case 'End':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.setActive(this.results.length - 1);
        }
        break;
      case 'Enter':
        if (!e.isComposing) {
          e.preventDefault();
          void this.execute(this.active);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        break;
      case 'Tab':
        e.preventDefault(); // keep focus in the palette
        break;
    }
  };

  private onGlobalKeyDown = (e: KeyboardEvent) => {
    const hotkey = this.options.hotkey === undefined ? 'Mod+K' : this.options.hotkey;
    if (hotkey && matchesShortcut(e, hotkey)) {
      e.preventDefault();
      this.toggle();
      return;
    }
    if (this.isOpen || e.defaultPrevented || e.repeat) return;

    for (const command of this.available()) {
      if (!command.shortcut || !matchesShortcut(e, command.shortcut)) continue;
      // Plain keys ('/', 'F2'…) must not fire while typing; modifier shortcuts may.
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (!hasModifier && isTypingTarget(e.target)) return;
      e.preventDefault();
      void Promise.resolve(command.run()).catch((err) => console.error(`[Atrium] command "${command.id}" failed`, err));
      return;
    }
  };
}

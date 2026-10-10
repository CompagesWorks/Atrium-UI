import type { AtriumContext } from '../core/context';
import { el, icon } from '../core/dom';

export interface DropzoneOptions {
  /** The .atrium-statusbar that expands into the drop target. Default: the first one on the page. */
  target?: HTMLElement;
  /** Called with the dropped files. */
  onDrop: (files: File[], event: DragEvent) => void;
  /** Only react while this returns true (MOSAIC only accepts drops on its Mods tab). */
  when?: () => boolean;
  /** Lower-case extensions to accept, e.g. ['zip', 'rar', '7z']. Folders always pass. Default: everything. */
  accept?: string[];
  /** Called with the files that `accept` filtered out. */
  onReject?: (files: File[]) => void;
  /** Card text. Defaults are MOSAIC's. */
  badge?: string;
  title?: string;
  hint?: string;
  /** Bootstrap Icons name. Default: 'cloud-arrow-down-fill'. */
  icon?: string;
}

export interface Dropzone {
  /** Updates the card text. */
  setText(text: Pick<DropzoneOptions, 'badge' | 'title' | 'hint'>): void;
  destroy(): void;
}

/**
 * MOSAIC's file drop target: while files are dragged over the window, the status bar
 * grows to 180px with a dashed edge and a bouncing "Drop files here" card.
 * Ported from ModDragDropHandler (mod-drag-drop.ts) and animations/drag-drop.css.
 */
export function createDropzone(ctx: AtriumContext, options: DropzoneOptions): Dropzone {
  const bar = options.target ?? document.querySelector<HTMLElement>('.atrium-statusbar');
  if (!bar) throw new Error('[Atrium] dropzone needs an .atrium-statusbar (or pass `target`)');

  const badge = el('span', 'atrium-island-badge');
  const title = el('span', 'atrium-island-title');
  const hint = el('div', 'atrium-island-text');
  const iconBox = el('div', 'atrium-island-icon');
  iconBox.appendChild(icon(options.icon ?? 'cloud-arrow-down-fill'));

  const header = el('div', 'atrium-island-header');
  header.append(badge, title);
  const details = el('div', 'atrium-island-details');
  details.append(header, hint);
  const card = el('div', 'atrium-island-card');
  card.append(iconBox, details);

  const overlay = el('div', 'atrium-dropzone-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.appendChild(card);
  bar.appendChild(overlay);

  const setText = (text: Pick<DropzoneOptions, 'badge' | 'title' | 'hint'>) => {
    if (text.badge !== undefined) badge.textContent = ctx.translate(text.badge);
    if (text.title !== undefined) title.textContent = ctx.translate(text.title);
    if (text.hint !== undefined) hint.textContent = ctx.translate(text.hint);
  };
  setText({
    badge: options.badge ?? 'Drag & drop',
    title: options.title ?? 'Drop files here',
    hint: options.hint ?? 'Supports ZIP, RAR, 7Z, and folders',
  });

  // dragenter/dragleave fire for every child crossed, so count them (as MOSAIC does).
  let depth = 0;

  const active = (e: DragEvent) =>
    (options.when?.() ?? true) && !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

  const reset = () => {
    depth = 0;
    bar.classList.remove('is-drag-active', 'is-drag-hover');
  };

  const onEnter = (e: DragEvent) => {
    if (!active(e)) return;
    e.preventDefault();
    depth++;
    if (depth === 1) bar.classList.add('is-drag-active');
    if (bar.contains(e.target as Node)) bar.classList.add('is-drag-hover');
  };

  const onOver = (e: DragEvent) => {
    if (!active(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  };

  const onLeave = (e: DragEvent) => {
    if (!active(e)) return;
    e.preventDefault();
    depth = Math.max(0, depth - 1);
    if (depth === 0) bar.classList.remove('is-drag-active');
    if (!bar.contains(e.relatedTarget as Node)) bar.classList.remove('is-drag-hover');
  };

  const onDrop = (e: DragEvent) => {
    if (!active(e)) return;
    e.preventDefault();
    e.stopPropagation();
    reset();

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;

    const accept = options.accept?.map((ext) => ext.replace(/^\./, '').toLowerCase());
    if (!accept) {
      options.onDrop(files, e);
      return;
    }

    // A folder has no extension and an empty type; let it through.
    const ok = (file: File) => {
      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
      return accept.includes(ext) || (!ext && !file.type);
    };
    const accepted = files.filter(ok);
    const rejected = files.filter((f) => !ok(f));
    if (rejected.length) options.onReject?.(rejected);
    if (accepted.length) options.onDrop(accepted, e);
  };

  // A cancelled drag (Escape) or a lost window focus never fires a matching drop.
  const onEnd = () => reset();

  document.addEventListener('dragenter', onEnter);
  document.addEventListener('dragover', onOver);
  document.addEventListener('dragleave', onLeave);
  document.addEventListener('drop', onDrop);
  document.addEventListener('dragend', onEnd);
  window.addEventListener('blur', onEnd);

  return {
    setText,
    destroy() {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragend', onEnd);
      window.removeEventListener('blur', onEnd);
      reset();
      overlay.remove();
    },
  };
}

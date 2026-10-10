import './styles/index.css';

import { createDropzone, type Dropzone, type DropzoneOptions } from './components/dropzone';
import { MenuManager } from './components/menu';
import { ModalManager } from './components/modal';
import { enhanceSelect, type SelectHandle, type SelectOptions } from './components/select';
import { createStatusbar, type Statusbar } from './components/statusbar';
import { createTabs, type Tabs, type TabsOptions } from './components/tabs';
import { ToastManager } from './components/toast';
import { TooltipManager } from './components/tooltip';
import { AtriumContext, type AtriumOptions, type MotionMode, type ThemeName } from './core/context';

export interface WindowControls {
  minimize?: () => void;
  maximize?: () => void;
  close?: () => void;
}

export interface Atrium {
  readonly toast: ToastManager;
  readonly modal: ModalManager;
  /** Context menu: `menu.open(event, items)` or `menu.bind(element, items)`. */
  readonly menu: MenuManager;
  /** Floating tooltips. Elements with [data-atrium-tooltip] work automatically. */
  readonly tooltip: TooltipManager;
  /** Wires tab buttons ([data-atrium-tab]) to panels ([data-atrium-panel]) with MOSAIC's switch animation. */
  tabs(options: TabsOptions): Tabs;
  /** Turns a native <select> into MOSAIC's custom dropdown (the native element stays in sync). */
  select(element: HTMLSelectElement, options?: SelectOptions): SelectHandle;
  /** Drives an .atrium-statusbar: animated status text, tones, bounce. */
  statusbar(element: HTMLElement): Statusbar;
  /** Wires the titlebar's [data-atrium-window="minimize|maximize|close"] buttons. Returns an unbind function. */
  windowControls(handlers: WindowControls): () => void;
  /** MOSAIC's file drop target: the status bar grows into a dashed drop zone while files are dragged. */
  dropzone(options: DropzoneOptions): Dropzone;
  readonly theme: ThemeName;
  readonly motion: MotionMode;
  setTheme(theme: ThemeName): void;
  setMotion(mode: MotionMode): void;
  /** Removes everything Atrium added to the page. */
  destroy(): void;
}

/**
 * Creates the Atrium-UI instance for a page. Call it once, after the DOM is ready.
 *
 * @example
 * const atrium = createAtrium({ t: i18n.t, sounds: { play: (n) => sfx[n].play() } });
 * atrium.toast.success('Saved');
 * if (await atrium.modal.confirm({ title: 'Delete?', message: 'This cannot be undone.', danger: true })) { … }
 */
export function createAtrium(options: AtriumOptions = {}): Atrium {
  const ctx = new AtriumContext(options);
  const toast = new ToastManager(ctx);
  const modal = new ModalManager(ctx);
  const menu = new MenuManager(ctx);
  const tooltip = new TooltipManager(ctx);
  const cleanups: (() => void)[] = [];

  return {
    toast,
    modal,
    menu,
    tooltip,
    tabs: (tabOptions) => {
      const tabs = createTabs(ctx, tabOptions);
      cleanups.push(() => tabs.destroy());
      return tabs;
    },
    select: (element, selectOptions) => {
      const handle = enhanceSelect(ctx, element, selectOptions);
      cleanups.push(() => handle.destroy());
      return handle;
    },
    statusbar: (element) => createStatusbar(ctx, element),
    dropzone: (dropOptions) => {
      const zone = createDropzone(ctx, dropOptions);
      cleanups.push(() => zone.destroy());
      return zone;
    },
    windowControls(handlers) {
      const onClick = (e: Event) => {
        const button = (e.target as Element | null)?.closest<HTMLElement>('[data-atrium-window]');
        const action = button?.dataset.atriumWindow as keyof WindowControls | undefined;
        if (action) handlers[action]?.();
      };
      document.addEventListener('click', onClick);
      const unbind = () => document.removeEventListener('click', onClick);
      cleanups.push(unbind);
      return unbind;
    },
    get theme() {
      return ctx.theme;
    },
    get motion() {
      return ctx.motion;
    },
    setTheme: (theme) => ctx.setTheme(theme),
    setMotion: (mode) => ctx.setMotion(mode),
    destroy() {
      cleanups.splice(0).forEach((fn) => fn());
      toast.destroy();
      modal.destroy();
      menu.destroy();
      tooltip.destroy();
    },
  };
}

export { stagger, replayAnimation } from './core/dom';
export { ToastManager, ModalManager, MenuManager, TooltipManager };
export type { AtriumOptions, MotionMode, ThemeName, SoundName, TranslateParams } from './core/context';
export type { ToastType, ToastOptions } from './components/toast';
export type { Tabs, TabsOptions, TabTransition } from './components/tabs';
export type { MenuEntry, MenuItem } from './components/menu';
export type { SelectHandle, SelectOptions } from './components/select';
export type { Statusbar, StatusTone } from './components/statusbar';
export type { Dropzone, DropzoneOptions } from './components/dropzone';
export type { TooltipOptions, TooltipPlacement } from './components/tooltip';
export type {
  ModalOptions,
  ModalButton,
  ModalHandle,
  ModalSize,
  ModalTone,
  ButtonVariant,
} from './components/modal';

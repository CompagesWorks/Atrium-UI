/**
 * atrium-ui/electron: wiring for the custom titlebar's window buttons.
 *
 *   main.ts     registerWindowControls({ ipcMain, BrowserWindow })
 *   preload.ts  exposeWindowControls({ contextBridge, ipcRenderer })
 *   renderer    atrium.windowControls()   // picks up window.atriumWindow automatically
 *
 * Electron's objects are passed in rather than imported, so this module has no
 * dependency on the electron package and works from ESM or CommonJS.
 */

export const WINDOW_CHANNELS = {
  minimize: 'atrium:window:minimize',
  maximize: 'atrium:window:maximize',
  close: 'atrium:window:close',
  isMaximized: 'atrium:window:is-maximized',
  maximizedChanged: 'atrium:window:maximized-changed',
} as const;

/** The API the preload exposes on `window.atriumWindow` (or the key you pass). */
export interface AtriumWindowApi {
  minimize(): void;
  /** Maximizes, or restores when already maximized. */
  maximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  /** Calls back whenever the window is maximized or restored. Returns an unsubscribe function. */
  onMaximizedChange(callback: (maximized: boolean) => void): () => void;
}

// ---------- Minimal shapes of the Electron APIs used ----------

interface WebContentsLike {
  send(channel: string, ...args: unknown[]): void;
  isDestroyed?(): boolean;
}

interface IpcMainEventLike {
  sender: WebContentsLike;
}

interface IpcMainLike {
  on(channel: string, listener: (event: IpcMainEventLike) => void): unknown;
  handle(channel: string, listener: (event: IpcMainEventLike) => unknown): void;
  removeAllListeners(channel: string): unknown;
  removeHandler(channel: string): void;
}

interface BrowserWindowLike {
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  isMaximized(): boolean;
  close(): void;
  isDestroyed(): boolean;
  webContents: WebContentsLike;
  on(event: 'maximize' | 'unmaximize', listener: () => void): unknown;
}

interface BrowserWindowStaticLike {
  fromWebContents(webContents: never): BrowserWindowLike | null;
}

interface IpcRendererLike {
  send(channel: string, ...args: unknown[]): void;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

interface ContextBridgeLike {
  exposeInMainWorld(key: string, api: unknown): void;
}

// ---------- Main process ----------

/**
 * Handles the titlebar buttons for every BrowserWindow, and tells each renderer
 * when its window is maximized or restored. Call once, in the main process.
 * Returns a function that removes the handlers.
 */
export function registerWindowControls(electron: {
  ipcMain: IpcMainLike;
  BrowserWindow: BrowserWindowStaticLike;
}): () => void {
  const { ipcMain, BrowserWindow } = electron;
  const watched = new WeakSet<BrowserWindowLike>();

  const windowOf = (event: IpcMainEventLike): BrowserWindowLike | null => {
    const win = BrowserWindow.fromWebContents(event.sender as never);
    if (!win || win.isDestroyed()) return null;
    if (!watched.has(win)) {
      watched.add(win);
      const notify = () => {
        if (!win.isDestroyed()) win.webContents.send(WINDOW_CHANNELS.maximizedChanged, win.isMaximized());
      };
      win.on('maximize', notify);
      win.on('unmaximize', notify);
    }
    return win;
  };

  ipcMain.on(WINDOW_CHANNELS.minimize, (event) => windowOf(event)?.minimize());
  ipcMain.on(WINDOW_CHANNELS.maximize, (event) => {
    const win = windowOf(event);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on(WINDOW_CHANNELS.close, (event) => windowOf(event)?.close());
  ipcMain.handle(WINDOW_CHANNELS.isMaximized, (event) => windowOf(event)?.isMaximized() ?? false);

  return () => {
    ipcMain.removeAllListeners(WINDOW_CHANNELS.minimize);
    ipcMain.removeAllListeners(WINDOW_CHANNELS.maximize);
    ipcMain.removeAllListeners(WINDOW_CHANNELS.close);
    ipcMain.removeHandler(WINDOW_CHANNELS.isMaximized);
  };
}

// ---------- Preload ----------

/** Builds the window API on top of ipcRenderer (use directly if you expose your own bridge). */
export function createWindowApi(ipcRenderer: IpcRendererLike): AtriumWindowApi {
  return {
    minimize: () => ipcRenderer.send(WINDOW_CHANNELS.minimize),
    maximize: () => ipcRenderer.send(WINDOW_CHANNELS.maximize),
    close: () => ipcRenderer.send(WINDOW_CHANNELS.close),
    isMaximized: async () => Boolean(await ipcRenderer.invoke(WINDOW_CHANNELS.isMaximized)),
    onMaximizedChange(callback) {
      const listener = (_event: unknown, maximized: unknown) => callback(Boolean(maximized));
      ipcRenderer.on(WINDOW_CHANNELS.maximizedChanged, listener);
      return () => ipcRenderer.removeListener(WINDOW_CHANNELS.maximizedChanged, listener);
    },
  };
}

/**
 * Exposes the window API to the renderer as `window.atriumWindow` (or `window[key]`).
 * Call in the preload script; requires contextIsolation (Electron's default).
 */
export function exposeWindowControls(
  electron: { contextBridge: ContextBridgeLike; ipcRenderer: IpcRendererLike },
  key = 'atriumWindow',
): void {
  electron.contextBridge.exposeInMainWorld(key, createWindowApi(electron.ipcRenderer));
}

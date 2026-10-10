/**
 * Standalone preload: exposes the titlebar window API as `window.atriumWindow`.
 *
 * Sandboxed preloads (Electron's default) can only require 'electron', so this file
 * is built as one self-contained CommonJS file (dist/preload.cjs) and must not import
 * anything else. registerWindowControls({ session }) registers it automatically.
 * The channel names below must stay in sync with WINDOW_CHANNELS in ./index.ts.
 */
import { contextBridge, ipcRenderer } from 'electron';

const MINIMIZE = 'atrium:window:minimize';
const MAXIMIZE = 'atrium:window:maximize';
const CLOSE = 'atrium:window:close';
const IS_MAXIMIZED = 'atrium:window:is-maximized';
const MAXIMIZED_CHANGED = 'atrium:window:maximized-changed';

contextBridge.exposeInMainWorld('atriumWindow', {
  minimize: () => ipcRenderer.send(MINIMIZE),
  maximize: () => ipcRenderer.send(MAXIMIZE),
  close: () => ipcRenderer.send(CLOSE),
  isMaximized: async () => Boolean(await ipcRenderer.invoke(IS_MAXIMIZED)),
  onMaximizedChange(callback: (maximized: boolean) => void) {
    const listener = (_event: unknown, maximized: unknown) => callback(Boolean(maximized));
    ipcRenderer.on(MAXIMIZED_CHANGED, listener);
    return () => {
      ipcRenderer.removeListener(MAXIMIZED_CHANGED, listener);
    };
  },
});

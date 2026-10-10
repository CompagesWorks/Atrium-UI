// Minimal typings for the parts of 'electron' used by the standalone preload.
// Atrium-UI does not depend on the electron package; it is external at build time.
declare module 'electron' {
  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };
  export const ipcRenderer: {
    send(channel: string, ...args: unknown[]): void;
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
    removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  };
}

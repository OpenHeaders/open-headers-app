// Mock electron module for testing outside Electron runtime
// ESM version — supports both `import { app }` and `require('electron')`

export const app = {
    getPath: (name) => `/tmp/open-headers-test/${name}`,
    getName: () => 'OpenHeaders',
    getVersion: () => '0.0.0-test',
    setName: () => {},
    quit: () => {},
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    on: () => {},
    commandLine: { appendSwitch: () => {} },
};

export const ipcMain = { handle: () => {}, on: () => {} };
export const ipcRenderer = { invoke: () => Promise.resolve(), on: () => {}, send: () => {} };
export const contextBridge = { exposeInMainWorld: () => {} };
export function BrowserWindow() {}
export const Menu = { buildFromTemplate: () => {}, setApplicationMenu: () => {} };
export const shell = { openExternal: () => {} };
export const dialog = { showOpenDialog: () => Promise.resolve({}), showSaveDialog: () => Promise.resolve({}) };

export default { app, ipcMain, ipcRenderer, contextBridge, BrowserWindow, Menu, shell, dialog };

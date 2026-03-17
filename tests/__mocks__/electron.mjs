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

export const ipcMain = { handle: () => {}, on: () => {}, once: () => {} };
export const ipcRenderer = { invoke: () => Promise.resolve(), on: () => {}, send: () => {} };
export const contextBridge = { exposeInMainWorld: () => {} };
export function BrowserWindow() {}
BrowserWindow.getFocusedWindow = () => null;
BrowserWindow.getAllWindows = () => [];
export const Menu = { buildFromTemplate: () => {}, setApplicationMenu: () => {} };
export const shell = { openExternal: () => {}, showItemInFolder: () => {} };
export const dialog = {
    showOpenDialog: () => Promise.resolve({}),
    showSaveDialog: () => Promise.resolve({}),
    showMessageBox: () => Promise.resolve({ response: 0 }),
    showErrorBox: () => {}
};
export const desktopCapturer = { getSources: () => Promise.resolve([]) };
export const screen = { getAllDisplays: () => [] };

export default { app, ipcMain, ipcRenderer, contextBridge, BrowserWindow, Menu, shell, dialog, desktopCapturer, screen };

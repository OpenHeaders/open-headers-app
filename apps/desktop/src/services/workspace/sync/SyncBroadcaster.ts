/**
 * SyncBroadcaster — sends sync-related IPC events to renderer windows.
 *
 * Wraps Electron's BrowserWindow.webContents.send with an injectable
 * broadcaster function for testing.
 */

import electron from 'electron';
import type { BroadcasterFn, WorkspaceBroadcastData } from './types';

export function broadcastToRenderers(
  channel: string,
  data: WorkspaceBroadcastData,
  broadcaster: BroadcasterFn | null = null,
): void {
  if (broadcaster) {
    broadcaster(channel, data);
    return;
  }

  const { BrowserWindow } = electron;
  for (const win of BrowserWindow.getAllWindows()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

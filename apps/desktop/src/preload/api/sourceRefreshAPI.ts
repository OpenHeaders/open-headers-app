import electron from 'electron';
import type { Source } from '../../types/source';
import type { RefreshStatusInfo, ScheduleUpdatedPayload, StatusChangedPayload } from '../../types/source-refresh';

const { ipcRenderer } = electron;

const sourceRefreshAPI = {
  manualRefresh: (sourceId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('source-refresh:manual', sourceId),

  updateSource: (source: Source): Promise<void> => ipcRenderer.invoke('source-refresh:update-source', source),

  getRefreshStatus: (sourceId: string): Promise<RefreshStatusInfo> =>
    ipcRenderer.invoke('source-refresh:get-status', sourceId),

  getTimeUntilRefresh: (sourceId: string): Promise<number> =>
    ipcRenderer.invoke('source-refresh:get-time-until', sourceId),

  onStatusChanged: (callback: (data: StatusChangedPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: StatusChangedPayload) => callback(data);
    ipcRenderer.on('source-refresh:status-changed', handler);
    return () => ipcRenderer.removeListener('source-refresh:status-changed', handler);
  },

  onScheduleUpdated: (callback: (data: ScheduleUpdatedPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ScheduleUpdatedPayload) => callback(data);
    ipcRenderer.on('source-refresh:schedule-updated', handler);
    return () => ipcRenderer.removeListener('source-refresh:schedule-updated', handler);
  },
};

export default sourceRefreshAPI;

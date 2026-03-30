/**
 * IPC handlers for SourceRefreshService — lets the renderer request
 * manual refreshes and query refresh status.
 */

import sourceRefreshService from '@/services/source-refresh/SourceRefreshService';
import type { IpcInvokeEvent } from '@/types/common';
import type { Source } from '@/types/source';
import mainLogger from '@/utils/mainLogger';

const { createLogger } = mainLogger;
const log = createLogger('SourceRefreshHandlers');

class SourceRefreshHandlers {
  handleManualRefresh: (event: IpcInvokeEvent, sourceId: string) => Promise<{ success: boolean; error?: string }>;
  handleUpdateSource: (event: IpcInvokeEvent, source: Source) => Promise<void>;
  handleGetStatus: (
    event: IpcInvokeEvent,
    sourceId: string,
  ) => ReturnType<typeof sourceRefreshService.getRefreshStatus>;
  handleGetTimeUntil: (event: IpcInvokeEvent, sourceId: string) => Promise<number>;

  constructor() {
    this.handleManualRefresh = this._handleManualRefresh.bind(this);
    this.handleUpdateSource = this._handleUpdateSource.bind(this);
    this.handleGetStatus = this._handleGetStatus.bind(this);
    this.handleGetTimeUntil = this._handleGetTimeUntil.bind(this);
  }

  async _handleManualRefresh(_: IpcInvokeEvent, sourceId: string): Promise<{ success: boolean; error?: string }> {
    log.info(`Manual refresh requested for source ${sourceId}`);
    return sourceRefreshService.manualRefresh(sourceId);
  }

  async _handleUpdateSource(_: IpcInvokeEvent, source: Source): Promise<void> {
    log.info(`Source config update received for source ${source.sourceId}`);
    await sourceRefreshService.updateSource(source);
  }

  _handleGetStatus(_: IpcInvokeEvent, sourceId: string) {
    return sourceRefreshService.getRefreshStatus(sourceId);
  }

  async _handleGetTimeUntil(_: IpcInvokeEvent, sourceId: string): Promise<number> {
    return sourceRefreshService.getTimeUntilRefresh(sourceId);
  }
}

const sourceRefreshHandlers = new SourceRefreshHandlers();

export { SourceRefreshHandlers };
export default sourceRefreshHandlers;

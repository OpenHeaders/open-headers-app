/**
 * StateBroadcaster — functions for pushing state to external services and renderer.
 *
 * Centralizes all outbound communication: WebSocket clients, proxy service,
 * source refresh service, and renderer windows via IPC.
 */

import type { Source } from '@openheaders/core';
import { errorMessage } from '@openheaders/core';
import electron from 'electron';
import mainLogger from '@/utils/mainLogger';
import type { ProxyServiceLike, SourceRefreshServiceLike, WebSocketServiceLike, WorkspaceState } from './types';

const { createLogger } = mainLogger;
const log = createLogger('StateBroadcaster');

/**
 * Push current sources and rules to WebSocket service (for browser extensions)
 * and proxy service (for HTTP proxy header injection).
 */
export function broadcastToServices(
  state: WorkspaceState,
  webSocketService: WebSocketServiceLike | null,
  proxyService: ProxyServiceLike | null,
): void {
  if (webSocketService) {
    webSocketService.sources = state.sources;
    webSocketService.rules = state.rules;
    webSocketService.sourceHandler.broadcastSources();
    webSocketService.ruleHandler.broadcastRules();
  }

  if (proxyService) {
    proxyService.updateSources(state.sources);
    proxyService.updateHeaderRules(state.rules.header);
    proxyService.updateProxyRules(state.proxyRules);
  }
}

/**
 * Sync all HTTP sources to SourceRefreshService (registers/updates refresh schedules).
 * Called only during workspace load — NOT on individual source updates, to avoid
 * feedback loops (fetch result → updateSource → sync back to refresh service).
 */
export function syncToRefreshService(sources: Source[], refreshService: SourceRefreshServiceLike | null): void {
  if (!refreshService) return;

  const httpIds = new Set<string>();
  for (const source of sources) {
    if (source.sourceType === 'http') {
      httpIds.add(source.sourceId);
      refreshService
        .updateSource(source)
        .catch((e) => log.warn(`Failed to sync source ${source.sourceId} to refresh service:`, errorMessage(e)));
    }
  }
  refreshService
    .removeSourcesNotIn(httpIds)
    .catch((e) => log.warn('Failed to clean up refresh service:', errorMessage(e)));
}

/**
 * Send a state patch to all open renderer windows.
 * Safely no-ops when no windows exist (app running in background).
 */
export function sendPatchToRenderers(state: WorkspaceState, changedKeys: string[]): void {
  const patch: Record<string, unknown> = {};
  for (const key of changedKeys) {
    if (key in state) {
      patch[key] = state[key as keyof WorkspaceState];
    }
  }

  const { BrowserWindow } = electron;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('workspace:state-patch', patch);
    }
  }
}

/**
 * Send workspace switch progress to all renderer windows.
 */
export function sendProgressToRenderers(
  step: string,
  progress: number,
  label: string,
  isGitOperation = false,
  targetWorkspace?: { id: string; name: string; type: string },
): void {
  const { BrowserWindow } = electron;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('workspace:switch-progress', { step, progress, label, isGitOperation, targetWorkspace });
    }
  }
}

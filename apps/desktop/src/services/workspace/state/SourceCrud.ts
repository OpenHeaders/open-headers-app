/**
 * SourceCrud — source CRUD operations extracted from WorkspaceStateService.
 *
 * All functions receive a StateContext so they can mutate state, mark dirty,
 * broadcast, and persist without coupling to the service class.
 */

import fs from 'node:fs';
import type { HeaderRule, Source, SourceUpdate } from '@openheaders/core';
import { errorMessage } from '@/types/common';
import type { ProxyRule } from '@/types/proxy';
import mainLogger from '@/utils/mainLogger';
import { evaluateSourceDependencies } from './SourceDependencyEvaluator';
import { broadcastToServices, sendPatchToRenderers } from './StateBroadcaster';
import type { StateContext } from './types';

const { createLogger } = mainLogger;
const log = createLogger('SourceCrud');

export async function addSource(ctx: StateContext, sourceData: Source): Promise<Source> {
  const isDuplicate = ctx.state.sources.some(
    (src) =>
      src.sourceType === sourceData.sourceType &&
      src.sourcePath === sourceData.sourcePath &&
      (sourceData.sourceType !== 'http' || src.sourceMethod === sourceData.sourceMethod),
  );
  if (isDuplicate) {
    throw new Error(`Source already exists: ${sourceData.sourceType.toUpperCase()} ${sourceData.sourcePath}`);
  }

  const maxId = ctx.state.sources.reduce((max, src) => {
    const id = parseInt(src.sourceId ?? '0', 10);
    return id > max ? id : max;
  }, 0);

  const deps =
    sourceData.sourceType === 'http'
      ? evaluateSourceDependencies(sourceData, ctx.envResolver)
      : { ready: true, missing: [] as string[] };

  const newSource: Source = {
    ...sourceData,
    sourceId: String(maxId + 1),
    createdAt: new Date().toISOString(),
    activationState: deps.ready ? 'active' : 'waiting_for_deps',
    missingDependencies: deps.missing,
  };

  ctx.state.sources.push(newSource);
  ctx.dirty.sources = true;

  await ctx.saveSources();
  ctx.updateWorkspaceMetadataInMemory(ctx.state.activeWorkspaceId, {
    sourceCount: ctx.state.sources.length,
    lastDataUpdate: new Date().toISOString(),
  });

  broadcastToServices(ctx.state, ctx.webSocketService, ctx.proxyService);
  sendPatchToRenderers(ctx.state, ['sources']);

  if (newSource.sourceType === 'http' && ctx.sourceRefreshService) {
    ctx.sourceRefreshService
      .updateSource(newSource)
      .catch((e) => log.warn(`Failed to register source ${newSource.sourceId} with refresh service:`, errorMessage(e)));
  }

  return newSource;
}

export async function updateSource(ctx: StateContext, sourceId: string, updates: SourceUpdate): Promise<Source | null> {
  let updatedSource: Source | null = null;
  ctx.state.sources = ctx.state.sources.map((source) => {
    if (source.sourceId === String(sourceId)) {
      const { refreshOptions: refreshUpdates, ...otherUpdates } = updates;
      const resolvedUpdates: Partial<Source> = { ...otherUpdates };
      if (refreshUpdates) {
        const base = source.refreshOptions ?? { enabled: false };
        resolvedUpdates.refreshOptions = { ...base, ...refreshUpdates };
      }
      const updated: Source = { ...source, ...resolvedUpdates, updatedAt: new Date().toISOString() };

      if (updated.sourceType === 'http' && updated.activationState === 'waiting_for_deps') {
        const deps = evaluateSourceDependencies(updated, ctx.envResolver);
        if (deps.ready) {
          updated.activationState = 'active';
          updated.missingDependencies = [];
        }
      }

      updatedSource = updated;
      return updated;
    }
    return source;
  });
  ctx.dirty.sources = true;
  ctx.scheduleDebouncedSave();

  broadcastToServices(ctx.state, ctx.webSocketService, ctx.proxyService);
  sendPatchToRenderers(ctx.state, ['sources']);

  // Sync to refresh service when source config changes (URL, method, refresh interval, etc.)
  // but NOT for content-only updates (sourceContent, originalResponse, etc.) to avoid feedback loops.
  const configFields = ['sourcePath', 'sourceMethod', 'requestOptions', 'refreshOptions', 'jsonFilter', 'sourceType'];
  const hasConfigChange = configFields.some((field) => field in updates);
  if (hasConfigChange && updatedSource && (updatedSource as Source).sourceType === 'http' && ctx.sourceRefreshService) {
    ctx.sourceRefreshService
      .updateSource(updatedSource as Source)
      .catch((e) => log.warn(`Failed to sync source config to refresh service:`, errorMessage(e)));
  }
  return updatedSource;
}

export async function removeSource(ctx: StateContext, sourceId: string): Promise<void> {
  ctx.state.sources = ctx.state.sources.filter((s) => s.sourceId !== String(sourceId));
  ctx.dirty.sources = true;
  ctx.scheduleDebouncedSave();

  ctx.updateWorkspaceMetadataInMemory(ctx.state.activeWorkspaceId, {
    sourceCount: ctx.state.sources.length,
    lastDataUpdate: new Date().toISOString(),
  });

  broadcastToServices(ctx.state, ctx.webSocketService, ctx.proxyService);
  sendPatchToRenderers(ctx.state, ['sources']);

  if (ctx.sourceRefreshService) {
    const httpIds = new Set(ctx.state.sources.filter((s) => s.sourceType === 'http').map((s) => s.sourceId));
    ctx.sourceRefreshService
      .removeSourcesNotIn(httpIds)
      .catch((e) => log.warn('Failed to clean up refresh service after source removal:', errorMessage(e)));
  }
}

export async function updateSourceFetchResult(
  ctx: StateContext,
  sourceId: string,
  result: {
    content: string;
    originalResponse: string;
    headers: Record<string, string>;
    isFiltered: boolean;
    filteredWith?: string;
  },
): Promise<void> {
  await updateSource(ctx, sourceId, {
    sourceContent: result.content,
    originalResponse: result.originalResponse,
    responseHeaders: result.headers,
    isFiltered: result.isFiltered,
    filteredWith: result.filteredWith ?? null,
    needsInitialFetch: false,
  });
}

export async function importSources(ctx: StateContext, newSources: Source[], replace: boolean): Promise<void> {
  if (replace) {
    ctx.state.sources = newSources;
  } else {
    ctx.state.sources = [...ctx.state.sources, ...newSources];
  }
  ctx.dirty.sources = true;
  ctx.scheduleDebouncedSave();
  broadcastToServices(ctx.state, ctx.webSocketService, ctx.proxyService);
  sendPatchToRenderers(ctx.state, ['sources']);
}

export async function refreshSource(ctx: StateContext, sourceId: string): Promise<boolean> {
  const source = ctx.state.sources.find((s) => s.sourceId === sourceId);
  if (!source) throw new Error(`Source ${sourceId} not found`);

  if (source.sourceType === 'file') {
    const content = await fs.promises.readFile(source.sourcePath || '', 'utf8');
    await updateSource(ctx, sourceId, { sourceContent: content });
    return true;
  } else if (source.sourceType === 'env') {
    const value = process.env[source.sourcePath || ''] ?? '';
    await updateSource(ctx, sourceId, { sourceContent: value });
    return true;
  } else if (source.sourceType === 'http') {
    if (ctx.sourceRefreshService) {
      const result = await ctx.sourceRefreshService.manualRefresh(sourceId);
      return result.success;
    }
    return false;
  }
  return false;
}

// ── Header Rule CRUD ──────────────────────────────────────────────

export async function addHeaderRule(ctx: StateContext, ruleData: Partial<HeaderRule>): Promise<void> {
  const newRule: HeaderRule = {
    ...ruleData,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  } as HeaderRule;
  ctx.state.rules = { ...ctx.state.rules, header: [...ctx.state.rules.header, newRule] };
  ctx.dirty.rules = true;
  ctx.scheduleDebouncedSave();
  broadcastToServices(ctx.state, ctx.webSocketService, ctx.proxyService);
  sendPatchToRenderers(ctx.state, ['rules']);
}

export async function updateHeaderRule(ctx: StateContext, ruleId: string, updates: Partial<HeaderRule>): Promise<void> {
  ctx.state.rules = {
    ...ctx.state.rules,
    header: ctx.state.rules.header.map((rule) =>
      rule.id === ruleId ? { ...rule, ...updates, updatedAt: new Date().toISOString() } : rule,
    ),
  };
  ctx.dirty.rules = true;
  ctx.scheduleDebouncedSave();
  broadcastToServices(ctx.state, ctx.webSocketService, ctx.proxyService);
  sendPatchToRenderers(ctx.state, ['rules']);
}

/**
 * Batch-update multiple header rules and broadcast once.
 * Used by handleToggleAllRules to avoid N broadcasts for N toggles.
 */
export async function updateHeaderRulesBatch(
  ctx: StateContext,
  updates: Array<{ ruleId: string; changes: Partial<HeaderRule> }>,
): Promise<void> {
  const now = new Date().toISOString();
  const updateMap = new Map(updates.map((u) => [u.ruleId, u.changes]));

  ctx.state.rules = {
    ...ctx.state.rules,
    header: ctx.state.rules.header.map((rule) => {
      const changes = updateMap.get(rule.id);
      return changes ? { ...rule, ...changes, updatedAt: now } : rule;
    }),
  };
  ctx.dirty.rules = true;
  ctx.scheduleDebouncedSave();
  broadcastToServices(ctx.state, ctx.webSocketService, ctx.proxyService);
  sendPatchToRenderers(ctx.state, ['rules']);
}

export async function removeHeaderRule(ctx: StateContext, ruleId: string): Promise<void> {
  ctx.state.rules = { ...ctx.state.rules, header: ctx.state.rules.header.filter((rule) => rule.id !== ruleId) };
  ctx.dirty.rules = true;
  ctx.scheduleDebouncedSave();
  broadcastToServices(ctx.state, ctx.webSocketService, ctx.proxyService);
  sendPatchToRenderers(ctx.state, ['rules']);
}

// ── Proxy Rule CRUD ───────────────────────────────────────────────

export async function addProxyRule(ctx: StateContext, ruleData: ProxyRule): Promise<void> {
  ctx.state.proxyRules = [...ctx.state.proxyRules, ruleData];
  ctx.dirty.proxyRules = true;
  ctx.scheduleDebouncedSave();
  if (ctx.proxyService) {
    ctx.proxyService.updateProxyRules(ctx.state.proxyRules);
  }
  sendPatchToRenderers(ctx.state, ['proxyRules']);
}

export async function removeProxyRule(ctx: StateContext, ruleId: string): Promise<void> {
  ctx.state.proxyRules = ctx.state.proxyRules.filter((r) => r.id !== ruleId);
  ctx.dirty.proxyRules = true;
  ctx.scheduleDebouncedSave();
  if (ctx.proxyService) {
    ctx.proxyService.updateProxyRules(ctx.state.proxyRules);
  }
  sendPatchToRenderers(ctx.state, ['proxyRules']);
}

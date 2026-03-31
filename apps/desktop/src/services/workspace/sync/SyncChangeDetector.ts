/**
 * SyncChangeDetector — compares synced data against existing workspace files
 * to determine whether anything actually changed.
 *
 * This avoids redundant broadcasts and UI refreshes on periodic syncs
 * where the remote config hasn't changed.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { RulesStorage, Source } from '@openheaders/core';
import electron from 'electron';
import type { EnvironmentMap, EnvironmentsFile } from '@/types/environment';
import type { ProxyRule } from '@/types/proxy';
import mainLogger from '@/utils/mainLogger';
import type { SyncData } from './types';

const { createLogger } = mainLogger;
const log = createLogger('SyncChangeDetector');

/**
 * Order-independent comparison of two arrays of objects keyed by an ID field.
 * Builds a Map from each array, then compares by key. Returns true if the sets
 * differ in count or if any entry differs in serialized content.
 *
 * `normalize` strips runtime-only fields so the comparison only covers
 * config-relevant properties (the ones that come from the git repo).
 */
function hasCollectionChanges<T>(
  existing: T[],
  incoming: T[],
  getKey: (item: T) => string,
  normalize: (item: T) => unknown,
): boolean {
  if (existing.length !== incoming.length) return true;

  const existingMap = new Map<string, string>();
  for (const item of existing) {
    existingMap.set(getKey(item), JSON.stringify(normalize(item)));
  }

  for (const item of incoming) {
    const key = getKey(item);
    const existingJson = existingMap.get(key);
    if (existingJson === undefined) return true; // new item
    if (existingJson !== JSON.stringify(normalize(item))) return true; // changed
  }

  return false;
}

/**
 * Check if synced data has any changes compared to existing workspace files on disk.
 * Returns true if there are changes (or on error, to be safe).
 */
export async function checkForDataChanges(workspaceId: string, newData: SyncData): Promise<boolean> {
  try {
    const userDataPath = electron.app.getPath('userData');
    const workspacePath = path.join(userDataPath, 'workspaces', workspaceId);

    if (await hasSourceChanges(workspacePath, newData)) return true;
    if (await hasRuleChanges(workspacePath, newData)) return true;
    if (await hasProxyRuleChanges(workspacePath, newData)) return true;
    return await hasEnvironmentChanges(workspacePath, newData);
  } catch (error) {
    log.error('Error checking for data changes:', error);
    return true; // Assume changes on error to be safe
  }
}

async function hasSourceChanges(workspacePath: string, newData: SyncData): Promise<boolean> {
  if (!newData.sources) return false;

  try {
    const sourcesPath = path.join(workspacePath, 'sources.json');
    const existingData = await fs.promises.readFile(sourcesPath, 'utf8');
    const existingSources: Source[] = JSON.parse(existingData);

    const normalizeSource = (source: Source) => ({
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      sourcePath: source.sourcePath,
      sourceMethod: source.sourceMethod,
      sourceTag: source.sourceTag,
      requestOptions: source.requestOptions,
      jsonFilter: source.jsonFilter,
      refreshOptions: source.refreshOptions
        ? {
            enabled: source.refreshOptions.enabled,
            type: source.refreshOptions.type,
            interval: source.refreshOptions.interval,
          }
        : undefined,
    });

    const changed = hasCollectionChanges(existingSources, newData.sources, (s) => s.sourceId, normalizeSource);

    if (changed) {
      log.info('Sources have changed');
      return true;
    }
  } catch (_error) {
    return true; // File doesn't exist or read error — consider it a change
  }

  return false;
}

async function hasRuleChanges(workspacePath: string, newData: SyncData): Promise<boolean> {
  if (!newData.rules) return false;

  try {
    const rulesPath = path.join(workspacePath, 'rules.json');
    const existingData = await fs.promises.readFile(rulesPath, 'utf8');
    const existingRules: Partial<RulesStorage> = JSON.parse(existingData);

    const existing = existingRules.rules;
    if (!existing) return true;

    const ruleKey = (r: { id: string }) => r.id;
    const identity = <T>(r: T): T => r;

    if (hasCollectionChanges(existing.header ?? [], newData.rules.header ?? [], ruleKey, identity)) {
      log.info('Header rules have changed');
      return true;
    }
    if (hasCollectionChanges(existing.request ?? [], newData.rules.request ?? [], ruleKey, identity)) {
      log.info('Request rules have changed');
      return true;
    }
    if (hasCollectionChanges(existing.response ?? [], newData.rules.response ?? [], ruleKey, identity)) {
      log.info('Response rules have changed');
      return true;
    }
  } catch (_error) {
    return true;
  }

  return false;
}

async function hasProxyRuleChanges(workspacePath: string, newData: SyncData): Promise<boolean> {
  if (!newData.proxyRules) return false;

  try {
    const proxyPath = path.join(workspacePath, 'proxy-rules.json');
    const existingData = await fs.promises.readFile(proxyPath, 'utf8');
    const existingProxy: ProxyRule[] = JSON.parse(existingData);

    const changed = hasCollectionChanges(
      existingProxy,
      newData.proxyRules,
      (r) => r.id,
      (r) => r,
    );

    if (changed) {
      log.info('Proxy rules have changed');
      return true;
    }
  } catch (_error) {
    return true;
  }

  return false;
}

/**
 * Fingerprint an environment variable's config-relevant properties.
 * Excludes `updatedAt` (local timestamp) and `value` (local user data)
 * unless the remote is explicitly pushing a non-empty value.
 */
function envVarFingerprint(isSecret: boolean, remoteValue?: string): string {
  // Include the remote value only when the remote is explicitly providing one.
  // Empty-string values mean "placeholder, keep local" in the merge logic.
  if (remoteValue) {
    return `${isSecret}|${remoteValue}`;
  }
  return `${isSecret}`;
}

async function hasEnvironmentChanges(workspacePath: string, newData: SyncData): Promise<boolean> {
  if (!newData.environments && !newData.environmentSchema) return false;

  try {
    const envPath = path.join(workspacePath, 'environments.json');
    const existingData = await fs.promises.readFile(envPath, 'utf8');
    const existingEnv: Partial<EnvironmentsFile> = JSON.parse(existingData);
    const existingEnvs = existingEnv.environments ?? {};

    // Build fingerprint maps: envName → { varName → fingerprint }
    const existingFingerprints = buildExistingFingerprints(existingEnvs);
    const incomingFingerprints = buildIncomingFingerprints(newData, existingEnvs);

    if (!incomingFingerprints) return false; // No env data to compare

    // Compare environment names
    const existingEnvNames = Object.keys(existingFingerprints).sort();
    const incomingEnvNames = Object.keys(incomingFingerprints).sort();

    if (
      existingEnvNames.length !== incomingEnvNames.length ||
      existingEnvNames.some((name, i) => name !== incomingEnvNames[i])
    ) {
      log.info('Environment names have changed');
      return true;
    }

    // Compare variable fingerprints per environment
    for (const envName of existingEnvNames) {
      const existingVars = existingFingerprints[envName];
      const incomingVars = incomingFingerprints[envName];

      const existingKeys = Object.keys(existingVars).sort();
      const incomingKeys = Object.keys(incomingVars).sort();

      if (existingKeys.length !== incomingKeys.length || existingKeys.some((key, i) => key !== incomingKeys[i])) {
        log.info(`Environment "${envName}" variable names have changed`);
        return true;
      }

      for (const varName of existingKeys) {
        if (existingVars[varName] !== incomingVars[varName]) {
          log.info(`Environment "${envName}" variable "${varName}" metadata has changed`);
          return true;
        }
      }
    }
  } catch (_error) {
    return true;
  }

  return false;
}

function buildExistingFingerprints(envs: EnvironmentMap): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const [envName, vars] of Object.entries(envs)) {
    result[envName] = {};
    for (const [varName, varData] of Object.entries(vars)) {
      result[envName][varName] = envVarFingerprint(varData.isSecret);
    }
  }
  return result;
}

function buildIncomingFingerprints(
  newData: SyncData,
  existingEnvs: EnvironmentMap,
): Record<string, Record<string, string>> | null {
  if (newData.environments && typeof newData.environments === 'object' && !newData.environmentSchema) {
    // Direct environments — check isSecret and non-empty remote values
    const result: Record<string, Record<string, string>> = {};
    for (const [envName, vars] of Object.entries(newData.environments)) {
      result[envName] = {};
      for (const [varName, varData] of Object.entries(vars)) {
        const existingVar = existingEnvs[envName]?.[varName];
        const existingValue = existingVar?.value;
        // Only include the remote value in the fingerprint when it would
        // actually change the local value during merge
        const remoteValueIfDifferent = varData.value && varData.value !== existingValue ? varData.value : undefined;
        result[envName][varName] = envVarFingerprint(varData.isSecret, remoteValueIfDifferent);
      }
    }
    return result;
  }

  if (newData.environmentSchema?.environments) {
    // Schema-based — only variable names + isSecret
    const result: Record<string, Record<string, string>> = {};
    for (const [envName, envSchema] of Object.entries(newData.environmentSchema.environments)) {
      result[envName] = {};
      if (envSchema.variables && Array.isArray(envSchema.variables)) {
        for (const varDef of envSchema.variables) {
          if (!varDef.name) continue;
          result[envName][varDef.name] = envVarFingerprint(varDef.isSecret ?? false);
        }
      }
    }
    return result;
  }

  return null;
}

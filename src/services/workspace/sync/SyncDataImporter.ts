/**
 * SyncDataImporter — writes synced Git data to the workspace directory on disk.
 *
 * Handles:
 *  - Source merging (preserves local execution data like sourceContent)
 *  - Rules import with proper storage format
 *  - Proxy rules import
 *  - Environment import with safety guards (backup, validation, value preservation)
 *
 * After writing, notifies WorkspaceStateService via the onSyncDataChanged callback
 * so it can reload in-memory state and broadcast to WS/proxy/renderer.
 */

import electron from 'electron';
import fs from 'fs';
import path from 'path';
import mainLogger from '../../../utils/mainLogger';
import atomicWriter from '../../../utils/atomicFileWriter';
import { DATA_FORMAT_VERSION } from '../../../config/version';
import {
    countNonEmptyEnvValues,
    readFileWithAtomicWriter,
    createBackupIfNeeded,
    cleanupOldBackups,
    validateEnvironmentWrite,
    ENV_FILE_READ_MAX_RETRIES
} from '../git/utils/EnvironmentSyncUtils';
import { broadcastToRenderers } from './SyncBroadcaster';
import type { Source } from '../../../types/source';
import type { EnvironmentMap, EnvironmentsFile } from '../../../types/environment';
import type { SyncData, BroadcasterFn } from './types';

const { createLogger } = mainLogger;
const log = createLogger('SyncDataImporter');

interface ImportOptions {
    broadcastToExtensions?: boolean;
}

/**
 * Import synced configuration data into a workspace directory on disk.
 *
 * @param workspaceId  Target workspace
 * @param data         Synced data from Git
 * @param options      Import options
 * @param broadcaster  Optional broadcaster for IPC events (testing)
 * @param onSyncDataChanged  Callback to notify WorkspaceStateService after write
 */
export async function importSyncedData(
    workspaceId: string,
    data: SyncData,
    options: ImportOptions = {},
    broadcaster: BroadcasterFn | null = null,
    onSyncDataChanged: ((workspaceId: string) => Promise<void>) | null = null
): Promise<void> {
    const { broadcastToExtensions = true } = options;

    try {
        const userDataPath = electron.app.getPath('userData');
        const workspacePath = path.join(userDataPath, 'workspaces', workspaceId);

        await fs.promises.mkdir(workspacePath, { recursive: true });

        await importSources(workspacePath, workspaceId, data);
        await importRules(workspacePath, workspaceId, data);
        await importProxyRules(workspacePath, workspaceId, data);
        await importEnvironments(workspacePath, workspaceId, data, broadcaster);

        // Notify WorkspaceStateService to reload from disk and broadcast to WS/proxy/renderer.
        if (broadcastToExtensions && onSyncDataChanged) {
            await onSyncDataChanged(workspaceId);
        }
    } catch (error) {
        log.error(`Failed to import synced data for workspace ${workspaceId}:`, error);
        throw error;
    }
}

// ── Sources ──────────────────────────────────────────────────────

async function importSources(workspacePath: string, workspaceId: string, data: SyncData): Promise<void> {
    if (!data.sources || !Array.isArray(data.sources)) return;

    const sourcesPath = path.join(workspacePath, 'sources.json');

    // Load existing sources to preserve local execution data
    let existingSources: Source[] = [];
    try {
        const existingData = await fs.promises.readFile(sourcesPath, 'utf8');
        existingSources = JSON.parse(existingData);
    } catch (_error) {
        // No existing sources, that's fine
    }

    const existingSourcesMap = new Map<string, Source>();
    for (const source of existingSources) {
        if (source.sourceId) {
            existingSourcesMap.set(source.sourceId, source);
        }
    }

    // Merge: use remote config but preserve local execution state
    const mergedSources = data.sources.map((remoteSource): Source => {
        const existingSource = existingSourcesMap.get(remoteSource.sourceId);

        if (existingSource) {
            return {
                ...remoteSource,
                sourceContent: existingSource.sourceContent ?? null,
                originalResponse: existingSource.originalResponse ?? null,
                isFiltered: existingSource.isFiltered,
                filteredWith: existingSource.filteredWith,
                activationState: existingSource.activationState ?? remoteSource.activationState,
                missingDependencies: existingSource.missingDependencies ?? [],
                refreshOptions: remoteSource.refreshOptions
                    ? {
                        ...remoteSource.refreshOptions,
                        lastRefresh: existingSource.refreshOptions?.lastRefresh ?? null,
                        nextRefresh: existingSource.refreshOptions?.nextRefresh ?? null
                    }
                    : existingSource.refreshOptions,
                createdAt: existingSource.createdAt ?? remoteSource.createdAt,
                updatedAt: existingSource.updatedAt ?? remoteSource.updatedAt
            };
        }

        return remoteSource;
    });

    await atomicWriter.writeJson(sourcesPath, mergedSources, { pretty: true });
    log.info(`Imported ${data.sources.length} sources for workspace ${workspaceId} (preserved local execution data)`);
}

// ── Rules ────────────────────────────────────────────────────────

async function importRules(workspacePath: string, workspaceId: string, data: SyncData): Promise<void> {
    if (!data.rules) return;

    const rulesStorage = {
        version: DATA_FORMAT_VERSION,
        rules: data.rules,
        metadata: {
            lastUpdated: new Date().toISOString(),
            totalRules: (data.rules.header?.length ?? 0) + (data.rules.request?.length ?? 0) + (data.rules.response?.length ?? 0)
        }
    };

    const rulesPath = path.join(workspacePath, 'rules.json');
    await atomicWriter.writeJson(rulesPath, rulesStorage, { pretty: true });
    log.info(`Imported ${rulesStorage.metadata.totalRules} rules for workspace ${workspaceId}`);
}

// ── Proxy rules ──────────────────────────────────────────────────

async function importProxyRules(workspacePath: string, workspaceId: string, data: SyncData): Promise<void> {
    if (!data.proxyRules || !Array.isArray(data.proxyRules)) return;

    const proxyPath = path.join(workspacePath, 'proxy-rules.json');
    await atomicWriter.writeJson(proxyPath, data.proxyRules, { pretty: true });
    log.info(`Imported ${data.proxyRules.length} proxy rules for workspace ${workspaceId}`);
}

// ── Environments ─────────────────────────────────────────────────

async function importEnvironments(
    workspacePath: string,
    workspaceId: string,
    data: SyncData,
    broadcaster: BroadcasterFn | null
): Promise<void> {
    const envPath = path.join(workspacePath, 'environments.json');

    // Load existing environments
    const existing = await loadExistingEnvironments(envPath, workspaceId, broadcaster);
    if (existing.loadFailed) return; // Abort — can't risk data loss

    // Merge synced data with existing
    const environmentsToImport = mergeEnvironments(data, existing.environments);
    if (!environmentsToImport) return; // Nothing to import

    // Validate write safety
    const newValueCount = countNonEmptyEnvValues(environmentsToImport);
    const validation = validateEnvironmentWrite(existing.valueCount, newValueCount);

    if (!validation.safe || validation.shouldBackup) {
        log.warn(`Potential data loss detected for workspace ${workspaceId}:`, {
            existingValues: existing.valueCount,
            newValues: newValueCount,
            lossPercentage: `${validation.lossPercentage}%`,
            shouldBackup: validation.shouldBackup,
            shouldBlock: validation.shouldBlock
        });
    }

    if (validation.shouldBackup && existing.fileExists) {
        log.warn(`Creating backup before potentially destructive environment sync (${validation.lossPercentage}% value loss)`);
        await createBackupIfNeeded(fs.promises, envPath);
    }

    if (validation.shouldBlock) {
        log.error(`BLOCKED: Refusing to write environments with 0 values when existing file had ${existing.valueCount} values`);
        broadcastToRenderers('workspace-sync-warning', {
            workspaceId,
            warning: 'Environment sync blocked: Would have deleted all values. Your local data is preserved.',
            timestamp: Date.now()
        }, broadcaster);
        return;
    }

    // Write
    const environmentsData = {
        environments: environmentsToImport,
        activeEnvironment: existing.activeEnvironment || Object.keys(environmentsToImport)[0] || 'Default'
    };

    await atomicWriter.writeJson(envPath, environmentsData, { pretty: true });
    await cleanupOldBackups(fs.promises, workspacePath, path, 3);

    const envCount = Object.keys(environmentsToImport).length;
    let varCount = 0;
    for (const env of Object.values(environmentsToImport)) {
        varCount += Object.keys(env).length;
    }
    log.info(`Imported ${envCount} environment(s) with ${varCount} variables for workspace ${workspaceId}`);

    broadcastToRenderers('environments-structure-changed', {
        workspaceId,
        timestamp: Date.now()
    }, broadcaster);
}

// ── Environment helpers ──────────────────────────────────────────

interface ExistingEnvResult {
    environments: EnvironmentMap;
    activeEnvironment: string | null;
    fileExists: boolean;
    loadFailed: boolean;
    valueCount: number;
}

async function loadExistingEnvironments(
    envPath: string,
    workspaceId: string,
    broadcaster: BroadcasterFn | null
): Promise<ExistingEnvResult> {
    const result: ExistingEnvResult = {
        environments: {},
        activeEnvironment: null,
        fileExists: false,
        loadFailed: false,
        valueCount: 0
    };

    try {
        const readResult = await readFileWithAtomicWriter(envPath);
        result.fileExists = readResult.exists;

        if (readResult.exists && readResult.content) {
            const parsed: Partial<EnvironmentsFile> = JSON.parse(readResult.content);
            if (parsed.environments) {
                result.environments = parsed.environments;
                result.valueCount = countNonEmptyEnvValues(result.environments);
            }
            if (parsed.activeEnvironment) {
                result.activeEnvironment = parsed.activeEnvironment;
            }
            log.info(`Loaded existing environments for workspace ${workspaceId}:`, {
                environmentCount: Object.keys(result.environments).length,
                variablesWithValues: result.valueCount,
                activeEnvironment: result.activeEnvironment
            });
        } else {
            log.info(`No existing environments file for workspace ${workspaceId}, will create new one`);
        }
    } catch (readError: unknown) {
        result.loadFailed = true;
        result.fileExists = true;
        const errMsg = readError instanceof Error ? readError.message : String(readError);
        log.error(`CRITICAL: Failed to read existing environments for workspace ${workspaceId} after ${ENV_FILE_READ_MAX_RETRIES} retries: ${errMsg}`);

        broadcastToRenderers('workspace-sync-warning', {
            workspaceId,
            warning: 'Environment sync skipped due to file read error. Your local environment values are preserved.',
            timestamp: Date.now()
        }, broadcaster);
    }

    return result;
}

function mergeEnvironments(data: SyncData, existing: EnvironmentMap): EnvironmentMap | null {
    if (data.environments && typeof data.environments === 'object' && !data.environmentSchema) {
        return mergeDirectEnvironments(data.environments, existing);
    }

    if (data.environmentSchema?.environments) {
        return mergeSchemaEnvironments(data, existing);
    }

    return null;
}

function mergeDirectEnvironments(remoteEnvs: EnvironmentMap, existing: EnvironmentMap): EnvironmentMap {
    const merged: EnvironmentMap = { ...existing };

    for (const [envName, envVars] of Object.entries(remoteEnvs)) {
        if (!merged[envName]) merged[envName] = {};

        for (const [varName, varData] of Object.entries(envVars)) {
            if (varData.value) {
                merged[envName][varName] = varData;
            } else if (!merged[envName][varName]) {
                merged[envName][varName] = { value: '', isSecret: varData.isSecret };
            }
        }
    }

    return merged;
}

function mergeSchemaEnvironments(data: SyncData, existing: EnvironmentMap): EnvironmentMap {
    const merged: EnvironmentMap = { ...existing };
    const schema = data.environmentSchema!;

    for (const [envName, envSchema] of Object.entries(schema.environments)) {
        if (!merged[envName]) merged[envName] = {};

        if (envSchema.variables && Array.isArray(envSchema.variables)) {
            for (const varDef of envSchema.variables) {
                if (!varDef.name) continue;

                if (!merged[envName][varDef.name]) {
                    merged[envName][varDef.name] = { value: '', isSecret: varDef.isSecret ?? false };
                } else {
                    const existingVar = merged[envName][varDef.name];
                    merged[envName][varDef.name] = {
                        value: existingVar.value,
                        isSecret: varDef.isSecret !== undefined ? varDef.isSecret : existingVar.isSecret
                    };
                }
            }
        }
    }

    // Also merge actual values if present alongside schema
    if (data.environments) {
        for (const [envName, envVars] of Object.entries(data.environments)) {
            if (!merged[envName]) {
                merged[envName] = envVars;
            } else {
                for (const [varName, varData] of Object.entries(envVars)) {
                    if (varData.value) {
                        merged[envName][varName] = varData;
                    } else if (!merged[envName][varName]) {
                        merged[envName][varName] = { value: '', isSecret: varData.isSecret };
                    }
                }
            }
        }
    }

    return merged;
}

/**
 * SyncChangeDetector — compares synced data against existing workspace files
 * to determine whether anything actually changed.
 *
 * This avoids redundant broadcasts and UI refreshes on periodic syncs
 * where the remote config hasn't changed.
 */

import electron from 'electron';
import fs from 'fs';
import path from 'path';
import mainLogger from '../../../utils/mainLogger';
import type { Source } from '../../../types/source';
import type { ProxyRule } from '../../../types/proxy';
import type { RulesStorage } from '../../../types/rules';
import type { EnvironmentMap, EnvironmentsFile } from '../../../types/environment';
import type { SyncData } from './types';

const { createLogger } = mainLogger;
const log = createLogger('SyncChangeDetector');

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
        if (await hasEnvironmentChanges(workspacePath, newData)) return true;

        return false;
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
            sourceType: source.sourceType,
            sourcePath: source.sourcePath,
            sourceMethod: source.sourceMethod,
            sourceTag: source.sourceTag,
            requestOptions: source.requestOptions,
            jsonFilter: source.jsonFilter,
            refreshOptions: source.refreshOptions ? {
                enabled: source.refreshOptions.enabled,
                type: source.refreshOptions.type,
                interval: source.refreshOptions.interval
            } : undefined,
            sourceId: source.sourceId
        });

        const normalizedExisting = existingSources.map(normalizeSource);
        const normalizedNew = newData.sources.map(normalizeSource);

        if (JSON.stringify(normalizedExisting) !== JSON.stringify(normalizedNew)) {
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

        if (JSON.stringify(existingRules.rules) !== JSON.stringify(newData.rules)) {
            log.info('Rules have changed');
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

        if (JSON.stringify(existingProxy) !== JSON.stringify(newData.proxyRules)) {
            log.info('Proxy rules have changed');
            return true;
        }
    } catch (_error) {
        return true;
    }

    return false;
}

async function hasEnvironmentChanges(workspacePath: string, newData: SyncData): Promise<boolean> {
    if (!newData.environments && !newData.environmentSchema) return false;

    try {
        const envPath = path.join(workspacePath, 'environments.json');
        const existingData = await fs.promises.readFile(envPath, 'utf8');
        const existingEnv: Partial<EnvironmentsFile> = JSON.parse(existingData);

        const getEnvStructure = (envData: EnvironmentMap): Record<string, string[]> => {
            const structure: Record<string, string[]> = {};
            for (const [envName, vars] of Object.entries(envData)) {
                structure[envName] = Object.keys(vars).sort();
            }
            return structure;
        };

        const existingStructure = getEnvStructure(existingEnv.environments ?? {});

        let newStructure: Record<string, string[]> | undefined;
        if (newData.environments) {
            newStructure = getEnvStructure(newData.environments);
        } else if (newData.environmentSchema?.environments) {
            newStructure = {};
            for (const [envName, envSchema] of Object.entries(newData.environmentSchema.environments)) {
                const varNames: string[] = [];
                if (envSchema.variables && Array.isArray(envSchema.variables)) {
                    for (const varDef of envSchema.variables) {
                        if (varDef.name) varNames.push(varDef.name);
                    }
                }
                newStructure[envName] = varNames.sort();
            }
        }

        if (JSON.stringify(existingStructure) !== JSON.stringify(newStructure)) {
            log.info('Environment structure has changed');
            return true;
        }
    } catch (_error) {
        return true;
    }

    return false;
}

/**
 * WebSocket Environment Handler
 * Manages environment variable resolution and template substitution.
 *
 * Variable sources (in priority order):
 *  1. In-memory cache — set explicitly via setVariables() when env vars change.
 *     This avoids racing with async disk writes.
 *  2. Disk fallback — reads environments.json on cold start or after workspace switch
 *     when no cache exists yet.
 *
 * All consumers (SourceDependencyEvaluator, SourceFetcher, ws-rule-handler) call
 * loadEnvironmentVariables(), which returns the cache or falls back to disk.
 */

import fs from 'fs';
import path from 'path';
import mainLogger from '../../utils/mainLogger';
import type { Source } from '../../types/source';
import type { RulesCollection } from '../../types/rules';

const { createLogger } = mainLogger;
const log = createLogger('WSEnvironmentHandler');

interface WSServiceLike {
    appDataPath: string | null;
    rules: RulesCollection;
    sources: Source[];
    ruleHandler: { broadcastRules(): void };
}

class WSEnvironmentHandler {
    wsService: WSServiceLike;

    /** In-memory variable cache. When set, loadEnvironmentVariables() returns this
     *  instead of reading from disk. Cleared on workspace switch. */
    private variableCache: Record<string, string> | null = null;

    constructor(wsService: WSServiceLike) {
        this.wsService = wsService;
    }

    /**
     * Update the in-memory variable cache. Called by WorkspaceStateService when
     * environment variables change (switch, edit, import). All subsequent calls
     * to loadEnvironmentVariables() return this cache until cleared.
     */
    setVariables(variables: Record<string, string>): void {
        this.variableCache = variables;
    }

    /**
     * Clear the in-memory cache. Called on workspace switch so the next
     * loadEnvironmentVariables() reads from the new workspace's disk file.
     */
    clearVariableCache(): void {
        this.variableCache = null;
    }

    /**
     * Load environment variables. Returns in-memory cache if available,
     * otherwise reads from the active workspace's environments.json on disk.
     */
    loadEnvironmentVariables(): Record<string, string> {
        if (this.variableCache) {
            return this.variableCache;
        }

        return this.loadVariablesFromDisk();
    }

    /**
     * Resolve template with environment variables
     */
    resolveTemplate(template: string, variables: Record<string, string>): string {
        if (!template) {
            return template;
        }

        return template.replace(/\{\{([^}]+)\}\}/g, (match: string, varName: string) => {
            const trimmedVarName = varName.trim();
            const value = variables[trimmedVarName];

            if (value !== undefined && value !== null && value !== '') {
                return value;
            }

            return match;
        });
    }

    /**
     * Setup environment change listener.
     *
     * Environment changes are now handled by WorkspaceStateService which calls
     * broadcastToServices() after env var changes. That pushes updated rules
     * to the WS service directly. This method is kept as a no-op for backward
     * compatibility with callers.
     */
    setupEnvironmentListener(): void {
        log.info('Environment change listener: no-op (handled by WorkspaceStateService.broadcastToServices)');
    }

    // ── Private ──────────────────────────────────────────────────

    private loadVariablesFromDisk(): Record<string, string> {
        try {
            const workspacesPath = path.join(this.wsService.appDataPath!, 'workspaces.json');
            let activeWorkspaceId = 'default-personal';

            if (fs.existsSync(workspacesPath)) {
                const workspacesData = fs.readFileSync(workspacesPath, 'utf8');
                const workspaces = JSON.parse(workspacesData);
                if (workspaces.activeWorkspaceId) {
                    activeWorkspaceId = workspaces.activeWorkspaceId;
                }

                const environmentsPath = path.join(this.wsService.appDataPath!, 'workspaces', activeWorkspaceId, 'environments.json');

                if (fs.existsSync(environmentsPath)) {
                    const envData = fs.readFileSync(environmentsPath, 'utf8');
                    const environmentsData = JSON.parse(envData);

                    const activeEnvironment = environmentsData.activeEnvironment || 'Default';
                    const environments = environmentsData.environments || {};

                    if (environments[activeEnvironment]) {
                        const variables: Record<string, string> = {};
                        Object.entries(environments[activeEnvironment]).forEach(([key, data]: [string, unknown]) => {
                            variables[key] = typeof data === 'object' && data !== null ? (data as Record<string, string>).value : String(data);
                        });

                        // Warm the cache for future calls within the same workspace
                        this.variableCache = variables;
                        return variables;
                    } else {
                        log.warn(`Active environment '${activeEnvironment}' not found in environments data`);
                    }
                }
            }

            return {};
        } catch (error) {
            log.error('Error loading environment variables:', error);
            return {};
        }
    }
}

export { WSEnvironmentHandler };
export default WSEnvironmentHandler;

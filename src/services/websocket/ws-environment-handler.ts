/**
 * WebSocket Environment Handler
 * Manages environment variable loading, template resolution, and proxy sync
 */

import fs from 'fs';
import path from 'path';
import mainLogger from '../../utils/mainLogger';

const { createLogger } = mainLogger;
const log = createLogger('WSEnvironmentHandler');

interface WSServiceLike {
    appDataPath: string | null;
    rules: any;
    sources: any[];
    ruleHandler: { broadcastRules(): void };
}

class WSEnvironmentHandler {
    wsService: WSServiceLike;

    constructor(wsService: WSServiceLike) {
        this.wsService = wsService;
    }

    /**
     * Load environment variables from workspace files
     */
    loadEnvironmentVariables(): Record<string, string> {
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
                        Object.entries(environments[activeEnvironment]).forEach(([key, data]: [string, any]) => {
                            variables[key] = typeof data === 'object' ? data.value : data;
                        });
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

    /**
     * Resolve template with environment variables
     */
    resolveTemplate(template: string, variables: Record<string, string>): string {
        if (!template || typeof template !== 'string') {
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
     * Setup environment change listener
     */
    setupEnvironmentListener(): void {
        try {
            const electron = require('electron');
            const { ipcMain } = electron;

            const broadcastIfEnvVars = () => {
                if (this.wsService.rules && this.wsService.rules.header) {
                    const hasEnvVars = this.wsService.rules.header.some((rule: any) => rule.hasEnvVars);
                    if (hasEnvVars) {
                        this.wsService.ruleHandler.broadcastRules();
                    }
                }
            };

            // Proxy updates are handled by main.js IPC handlers;
            // here we only re-broadcast rules to WebSocket clients when env vars affect them
            ipcMain.on('environment-variables-changed', broadcastIfEnvVars);
            ipcMain.on('environment-switched', broadcastIfEnvVars);
            // workspace-switched is handled by sourceHandler.onWorkspaceSwitch()
            // which loads fresh rules/sources and broadcasts — no need to duplicate here

            log.info('Environment change listener setup for WebSocket service');
        } catch (error: any) {
            log.warn('Could not setup environment listener:', error.message);
        }
    }

    /**
     * Synchronize proxy service with current state (env vars, rules, sources)
     */
    syncProxyService(): void {
        try {
            const proxyService = require('../proxy/ProxyService').default;

            const envVars = this.loadEnvironmentVariables();
            if (envVars) {
                proxyService.updateEnvironmentVariables(envVars);
            }

            if (this.wsService.rules && this.wsService.rules.header) {
                proxyService.updateHeaderRules(this.wsService.rules.header);
            }

            if (this.wsService.sources && this.wsService.sources.length > 0) {
                proxyService.updateSources(this.wsService.sources);
            }
        } catch (error) {
            log.error('Failed to sync proxy service:', error);
        }
    }
}

export { WSEnvironmentHandler };
export default WSEnvironmentHandler;

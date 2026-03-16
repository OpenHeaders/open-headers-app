/**
 * WebSocket Environment Handler
 * Manages environment variable loading, template resolution, and proxy sync
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../../utils/mainLogger');

const log = createLogger('WSEnvironmentHandler');

class WSEnvironmentHandler {
    constructor(wsService) {
        this.wsService = wsService;
    }

    /**
     * Load environment variables from workspace files
     * @returns {Object}
     */
    loadEnvironmentVariables() {
        try {
            const workspacesPath = path.join(this.wsService.appDataPath, 'workspaces.json');
            let activeWorkspaceId = 'default-personal';

            if (fs.existsSync(workspacesPath)) {
                const workspacesData = fs.readFileSync(workspacesPath, 'utf8');
                const workspaces = JSON.parse(workspacesData);
                if (workspaces.activeWorkspaceId) {
                    activeWorkspaceId = workspaces.activeWorkspaceId;
                }

                const environmentsPath = path.join(this.wsService.appDataPath, 'workspaces', activeWorkspaceId, 'environments.json');

                if (fs.existsSync(environmentsPath)) {
                    const envData = fs.readFileSync(environmentsPath, 'utf8');
                    const environmentsData = JSON.parse(envData);

                    const activeEnvironment = environmentsData.activeEnvironment || 'Default';
                    const environments = environmentsData.environments || {};

                    if (environments[activeEnvironment]) {
                        const variables = {};
                        Object.entries(environments[activeEnvironment]).forEach(([key, data]) => {
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
     * @param {string} template
     * @param {Object} variables
     * @returns {string}
     */
    resolveTemplate(template, variables) {
        if (!template || typeof template !== 'string') {
            return template;
        }

        return template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
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
    setupEnvironmentListener() {
        try {
            const { ipcMain } = require('electron');

            const handleEnvChange = () => {
                try {
                    this.loadEnvironmentVariables();
                } catch (error) {
                    log.warn('Failed to reload environment variables:', error);
                }

                if (this.wsService.rules && this.wsService.rules.header) {
                    const hasEnvVars = this.wsService.rules.header.some(rule => rule.hasEnvVars);
                    if (hasEnvVars) {
                        this.wsService.ruleHandler.broadcastRules();
                    }
                }
            };

            ipcMain.on('environment-variables-changed', () => {
                this.syncProxyService();
                handleEnvChange();
            });
            ipcMain.on('environment-switched', handleEnvChange);
            ipcMain.on('workspace-switched', handleEnvChange);

            log.info('Environment change listener setup for WebSocket service');
        } catch (error) {
            log.warn('Could not setup environment listener:', error.message);
        }
    }

    /**
     * Synchronize proxy service with current state (env vars, rules, sources)
     */
    syncProxyService() {
        try {
            const proxyService = require('../proxy/ProxyService');

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

module.exports = WSEnvironmentHandler;

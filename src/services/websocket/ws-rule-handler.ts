/**
 * WebSocket Rule Handler
 * Manages rule broadcasting, dynamic value population, and toggle from extensions
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import type { BrowserWindow as BrowserWindowType } from 'electron';
import mainLogger from '../../utils/mainLogger';
import { errorMessage } from '../../types/common';
import type { Source } from '../../types/source';
import type { HeaderRule, RulesCollection, RulesStorage } from '../../types/rules';
import atomicWriter from '../../utils/atomicFileWriter';
import { DATA_FORMAT_VERSION } from '../../config/version';

const { createLogger } = mainLogger;
const log = createLogger('WSRuleHandler');

/** HeaderRule with extra fields for extension broadcast (env vars resolved, activation state added). */
interface ProcessedHeaderRule extends Omit<HeaderRule, 'hasEnvVars' | 'envVars'> {
    activationState?: string;
    missingDependencies?: string[];
    hasEnvVars?: boolean;
    envVars?: string[];
}

interface WSServiceLike {
    rules: RulesCollection;
    sources: Source[];
    appDataPath: string | null;
    environmentHandler: {
        loadEnvironmentVariables(): Record<string, string>;
        resolveTemplate(template: string, variables: Record<string, string>): string;
    };
    _broadcastToAll(message: string): number;
}

class WSRuleHandler {
    wsService: WSServiceLike;

    constructor(wsService: WSServiceLike) {
        this.wsService = wsService;
    }

    /**
     * Update rules and broadcast to all clients
     */
    updateRules(rules: RulesCollection): void {
        this.wsService.rules = rules;
        this.broadcastRules();
    }

    /**
     * Send rules to a specific client
     */
    async sendRulesToClient(ws: WebSocket): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not in OPEN state'));
                return;
            }

            try {
                const populatedRulesCollection = this._populateDynamicHeaderValues(this.wsService.rules);

                const message = JSON.stringify({
                    type: 'rules-update',
                    data: {
                        rules: populatedRulesCollection,
                        version: DATA_FORMAT_VERSION
                    }
                });

                ws.send(message, (error: Error | undefined) => {
                    if (error) {
                        log.error('Error sending rules to client:', error);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Broadcast rules to all connected clients
     */
    broadcastRules(): void {
        const populatedRulesCollection = this._populateDynamicHeaderValues(this.wsService.rules);

        const message = JSON.stringify({
            type: 'rules-update',
            data: {
                rules: populatedRulesCollection,
                version: DATA_FORMAT_VERSION
            }
        });

        this.wsService._broadcastToAll(message);
    }

    /**
     * Populate dynamic header values from sources and resolve environment variables
     */
    _populateDynamicHeaderValues(rules: RulesCollection): { header: ProcessedHeaderRule[]; request: RulesCollection['request']; response: RulesCollection['response'] } {
        const clonedRules: RulesCollection = JSON.parse(JSON.stringify(rules));
        const envHandler = this.wsService.environmentHandler;

        let environmentVariables: Record<string, string> | null = null;
        try {
            environmentVariables = envHandler.loadEnvironmentVariables();
        } catch (error: unknown) {
            log.warn('Failed to load environment variables:', errorMessage(error));
        }

        const processedHeaders: ProcessedHeaderRule[] = clonedRules.header
            .map((rule): ProcessedHeaderRule | null => {
                const processed: ProcessedHeaderRule = { ...rule };

                if (rule.hasEnvVars && environmentVariables) {
                    try {
                        const missingVars = rule.envVars.filter(varName => {
                            const value = environmentVariables![varName];
                            return value === undefined || value === null || value === '';
                        });

                        if (missingVars.length > 0) {
                            processed.activationState = 'waiting_for_deps';
                            processed.missingDependencies = missingVars;
                            return null;
                        }

                        if (rule.headerName.includes('{{')) {
                            processed.headerName = envHandler.resolveTemplate(rule.headerName, environmentVariables);
                        }

                        if (!rule.isDynamic && rule.headerValue.includes('{{')) {
                            processed.headerValue = envHandler.resolveTemplate(rule.headerValue, environmentVariables);
                        }

                        if (rule.isDynamic) {
                            if (rule.prefix.includes('{{')) {
                                processed.prefix = envHandler.resolveTemplate(rule.prefix, environmentVariables);
                            }
                            if (rule.suffix.includes('{{')) {
                                processed.suffix = envHandler.resolveTemplate(rule.suffix, environmentVariables);
                            }
                        }

                        if (rule.domains.length > 0) {
                            processed.domains = rule.domains.flatMap(domain => {
                                if (domain.includes('{{')) {
                                    const resolved = envHandler.resolveTemplate(domain, environmentVariables!);
                                    if (resolved.includes(',')) {
                                        return resolved.split(',').map(d => d.trim()).filter(d => d);
                                    }
                                    return resolved;
                                }
                                return domain;
                            });
                        }

                        delete processed.hasEnvVars;
                        delete processed.envVars;
                        processed.activationState = 'active';
                    } catch (error) {
                        log.error(`Error resolving env vars for rule "${rule.headerName}":`, error);
                        processed.activationState = 'error';
                    }
                }

                if (processed.isDynamic && processed.sourceId) {
                    const source = this.wsService.sources.find(s => s.sourceId === processed.sourceId!.toString());
                    if (source && source.sourceContent) {
                        processed.headerValue = (processed.prefix || '') + source.sourceContent + (processed.suffix || '');
                    }
                }

                return processed;
            })
            .filter((rule): rule is ProcessedHeaderRule => rule !== null);

        return { header: processedHeaders, request: clonedRules.request, response: clonedRules.response };
    }

    // ──────────────────────────────────────────────
    // Rule toggling (from browser extension)
    // ──────────────────────────────────────────────

    /**
     * Handle toggle rule request from extension
     */
    async handleToggleRule(ruleId: string | number, enabled: boolean): Promise<void> {
        try {
            if (!this.wsService.rules || !this.wsService.rules.header) {
                log.error('No header rules available to toggle');
                return;
            }

            let ruleFound = false;
            const updatedHeaderRulesCollection = this.wsService.rules.header.map((rule: HeaderRule) => {
                if (String(rule.id) === String(ruleId)) {
                    ruleFound = true;
                    return { ...rule, isEnabled: enabled, updatedAt: new Date().toISOString() };
                }
                return rule;
            });

            if (!ruleFound) {
                log.error(`Rule ${ruleId} not found`);
                return;
            }

            this.wsService.rules.header = updatedHeaderRulesCollection;
            await this._persistAndNotify();
            log.info(`Successfully toggled rule ${ruleId} to ${enabled}`);
        } catch (error) {
            log.error('Error handling toggle rule:', error);
        }
    }

    /**
     * Handle toggle all rules request from extension
     */
    async handleToggleAllRules(ruleIds: string[], enabled: boolean): Promise<void> {
        try {
            log.info(`Handling toggle all rules request: ${ruleIds.length} rules -> ${enabled}`);

            if (!this.wsService.rules || !this.wsService.rules.header) {
                log.error('No header rules available to toggle');
                return;
            }

            let rulesUpdated = 0;
            const updatedHeaderRulesCollection = this.wsService.rules.header.map((rule: HeaderRule) => {
                if (ruleIds.includes(String(rule.id))) {
                    rulesUpdated++;
                    return { ...rule, isEnabled: enabled, updatedAt: new Date().toISOString() };
                }
                return rule;
            });

            if (rulesUpdated === 0) {
                log.warn('No rules were updated');
                return;
            }

            this.wsService.rules.header = updatedHeaderRulesCollection;
            await this._persistAndNotify();
            log.info(`Successfully toggled ${rulesUpdated} rules to ${enabled}`);
        } catch (error) {
            log.error('Error handling toggle all rules:', error);
        }
    }

    /**
     * Persist rules to disk, broadcast to extensions, and notify desktop UI
     */
    async _persistAndNotify(): Promise<void> {
        if (this.wsService.appDataPath) {
            try {
                const workspacesPath = path.join(this.wsService.appDataPath, 'workspaces.json');
                let activeWorkspaceId = 'default-personal';

                if (fs.existsSync(workspacesPath)) {
                    const workspacesData = await fs.promises.readFile(workspacesPath, 'utf8');
                    const workspaces = JSON.parse(workspacesData);
                    if (workspaces.activeWorkspaceId) {
                        activeWorkspaceId = workspaces.activeWorkspaceId;
                    }
                }

                const rulesPath = path.join(this.wsService.appDataPath, 'workspaces', activeWorkspaceId, 'rules.json');

                let rulesStorage: RulesStorage;
                try {
                    const existingData = await fs.promises.readFile(rulesPath, 'utf8');
                    rulesStorage = JSON.parse(existingData) as RulesStorage;
                } catch (e) {
                    rulesStorage = {
                        version: DATA_FORMAT_VERSION,
                        rules: this.wsService.rules,
                        metadata: {
                            totalRules: this.wsService.rules.header.length + this.wsService.rules.request.length + this.wsService.rules.response.length,
                            lastUpdated: new Date().toISOString()
                        }
                    };
                }

                rulesStorage.rules = this.wsService.rules;
                rulesStorage.metadata = {
                    totalRules: this.wsService.rules.header.length + this.wsService.rules.request.length + this.wsService.rules.response.length,
                    lastUpdated: new Date().toISOString()
                };

                await atomicWriter.writeJson(rulesPath, rulesStorage, { pretty: true });
                log.info(`Rules persisted to disk for workspace ${activeWorkspaceId}`);
            } catch (error) {
                log.error('Failed to persist rules to disk:', error);
            }
        }

        this.broadcastRules();

        try {
            const { BrowserWindow } = await import('electron');
            const windows = BrowserWindow.getAllWindows();
            windows.forEach((window: BrowserWindowType) => {
                if (window && !window.isDestroyed()) {
                    const rulesData = {
                        rules: { header: this.wsService.rules.header },
                        metadata: {
                            totalRules: this.wsService.rules.header.length,
                            lastUpdated: new Date().toISOString()
                        },
                        version: DATA_FORMAT_VERSION
                    };

                    window.webContents.executeJavaScript(`
                        window.dispatchEvent(new CustomEvent('rules-updated', {
                            detail: { rules: ${JSON.stringify(rulesData)} }
                        }));
                    `).catch((err: Error) => {
                        log.error('Failed to dispatch rules-updated event:', err);
                    });
                }
            });
        } catch (error) {
            log.error('Failed to notify main window:', error);
        }
    }
}

export { WSRuleHandler };
export default WSRuleHandler;

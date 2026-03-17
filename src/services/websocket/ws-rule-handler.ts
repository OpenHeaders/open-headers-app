/**
 * WebSocket Rule Handler
 * Manages rule broadcasting, dynamic value population, and toggle from extensions
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocket = require('ws');
import fs from 'fs';
import path from 'path';
import mainLogger from '../../utils/mainLogger';
import atomicWriter from '../../utils/atomicFileWriter';
import { DATA_FORMAT_VERSION } from '../../config/version';

const { createLogger } = mainLogger;
const log = createLogger('WSRuleHandler');

interface HeaderRule {
    id: string | number;
    headerName?: string;
    headerValue?: string;
    isEnabled?: boolean;
    isDynamic?: boolean;
    sourceId?: string | number;
    prefix?: string;
    suffix?: string;
    domains?: string[];
    hasEnvVars?: boolean;
    envVars?: string[];
    activationState?: string;
    missingDependencies?: string[];
    updatedAt?: string;
    [key: string]: any;
}

interface Rules {
    header?: HeaderRule[];
    [key: string]: any;
}

interface Source {
    sourceId: string;
    sourceContent?: string;
}

interface WSServiceLike {
    rules: Rules;
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
    updateRules(rules: Rules): void {
        this.wsService.rules = rules;
        this.broadcastRules();
    }

    /**
     * Send rules to a specific client
     */
    async sendRulesToClient(ws: any): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not in OPEN state'));
                return;
            }

            try {
                const populatedRules = this._populateDynamicHeaderValues(this.wsService.rules);

                const message = JSON.stringify({
                    type: 'rules-update',
                    data: {
                        rules: populatedRules,
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
        const populatedRules = this._populateDynamicHeaderValues(this.wsService.rules);

        const message = JSON.stringify({
            type: 'rules-update',
            data: {
                rules: populatedRules,
                version: DATA_FORMAT_VERSION
            }
        });

        this.wsService._broadcastToAll(message);
    }

    /**
     * Populate dynamic header values from sources and resolve environment variables
     */
    _populateDynamicHeaderValues(rules: Rules): Rules {
        const populatedRules: Rules = JSON.parse(JSON.stringify(rules));
        const envHandler = this.wsService.environmentHandler;

        let environmentVariables: Record<string, string> | null = null;
        try {
            environmentVariables = envHandler.loadEnvironmentVariables();
        } catch (error: any) {
            log.warn('Failed to load environment variables:', error.message);
        }

        if (populatedRules.header && Array.isArray(populatedRules.header)) {
            populatedRules.header = populatedRules.header.map((rule: HeaderRule) => {
                let processedRule: HeaderRule = { ...rule };

                if (rule.hasEnvVars && environmentVariables) {
                    try {
                        const missingVars = rule.envVars ? rule.envVars.filter((varName: string) => {
                            const value = environmentVariables![varName];
                            return value === undefined || value === null || value === '';
                        }) : [];

                        if (missingVars.length > 0) {
                            processedRule.activationState = 'waiting_for_deps';
                            processedRule.missingDependencies = missingVars;
                            return null;
                        }

                        if (rule.headerName && rule.headerName.includes('{{')) {
                            processedRule.headerName = envHandler.resolveTemplate(rule.headerName, environmentVariables);
                        }

                        if (!rule.isDynamic && rule.headerValue && rule.headerValue.includes('{{')) {
                            processedRule.headerValue = envHandler.resolveTemplate(rule.headerValue, environmentVariables);
                        }

                        if (rule.isDynamic) {
                            if (rule.prefix && rule.prefix.includes('{{')) {
                                processedRule.prefix = envHandler.resolveTemplate(rule.prefix, environmentVariables);
                            }
                            if (rule.suffix && rule.suffix.includes('{{')) {
                                processedRule.suffix = envHandler.resolveTemplate(rule.suffix, environmentVariables);
                            }
                        }

                        if (rule.domains && Array.isArray(rule.domains)) {
                            processedRule.domains = rule.domains.flatMap((domain: string) => {
                                if (domain && domain.includes('{{')) {
                                    const resolved = envHandler.resolveTemplate(domain, environmentVariables!);
                                    if (resolved && resolved.includes(',')) {
                                        return resolved.split(',').map((d: string) => d.trim()).filter((d: string) => d);
                                    }
                                    return resolved;
                                }
                                return domain;
                            });
                        }

                        delete processedRule.hasEnvVars;
                        delete processedRule.envVars;
                        processedRule.activationState = 'active';
                    } catch (error) {
                        log.error(`Error resolving env vars for rule "${rule.headerName}":`, error);
                        processedRule.activationState = 'error';
                    }
                }

                if (processedRule.isDynamic && processedRule.sourceId) {
                    const source = this.wsService.sources.find((s: Source) => s.sourceId === processedRule.sourceId!.toString());
                    if (source && source.sourceContent) {
                        const prefix = processedRule.prefix || '';
                        const suffix = processedRule.suffix || '';
                        processedRule.headerValue = prefix + source.sourceContent + suffix;
                    }
                }

                return processedRule;
            }).filter((rule: HeaderRule | null) => rule !== null) as HeaderRule[];
        }

        return populatedRules;
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
            const updatedHeaderRules = this.wsService.rules.header.map((rule: HeaderRule) => {
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

            this.wsService.rules.header = updatedHeaderRules;
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
            const updatedHeaderRules = this.wsService.rules.header.map((rule: HeaderRule) => {
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

            this.wsService.rules.header = updatedHeaderRules;
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

                let rulesStorage: any;
                try {
                    const existingData = await fs.promises.readFile(rulesPath, 'utf8');
                    rulesStorage = JSON.parse(existingData);
                } catch (e) {
                    rulesStorage = { version: DATA_FORMAT_VERSION, rules: this.wsService.rules, metadata: {} };
                }

                rulesStorage.rules = this.wsService.rules;
                rulesStorage.metadata = rulesStorage.metadata || {};
                rulesStorage.metadata.totalRules = Object.values(this.wsService.rules)
                    .reduce((sum: number, rules: any) => sum + (Array.isArray(rules) ? rules.length : 0), 0);
                rulesStorage.metadata.lastUpdated = new Date().toISOString();

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
            windows.forEach((window: any) => {
                if (window && !window.isDestroyed()) {
                    const rulesData = {
                        rules: { header: this.wsService.rules.header || [] },
                        metadata: {
                            totalRules: this.wsService.rules.header ? this.wsService.rules.header.length : 0,
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

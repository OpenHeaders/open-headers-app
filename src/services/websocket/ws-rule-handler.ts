/**
 * WebSocket Rule Handler
 * Manages rule broadcasting, dynamic value population, and toggle from extensions.
 *
 * Rule toggling is delegated to WorkspaceStateService (the single state owner)
 * via the onRuleToggle callback, which handles persistence, broadcasting, and
 * renderer notification. This avoids dual-state ownership between the WS service
 * and WorkspaceStateService.
 */

import WebSocket from 'ws';
import mainLogger from '../../utils/mainLogger';
import { errorMessage } from '../../types/common';
import type { Source } from '../../types/source';
import type { HeaderRule, RulesCollection } from '../../types/rules';
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

interface RuleHandlerDeps {
    rules: RulesCollection;
    sources: Source[];
    environmentHandler: {
        loadEnvironmentVariables(): Record<string, string>;
        resolveTemplate(template: string, variables: Record<string, string>): string;
    };
    _broadcastToAll(message: string): number;
}

class WSRuleHandler {
    wsService: RuleHandlerDeps;

    /**
     * Callback to delegate a single rule toggle to WorkspaceStateService.
     * Set by lifecycle.ts after WorkspaceStateService is configured.
     * When null, toggle requests are logged as warnings and ignored.
     */
    onRuleToggle: ((ruleId: string, updates: Partial<HeaderRule>) => Promise<void>) | null = null;

    /**
     * Callback to delegate a batch of rule updates to WorkspaceStateService.
     * Mutates all rules and broadcasts once (instead of N times).
     * Set by lifecycle.ts after WorkspaceStateService is configured.
     */
    onRuleToggleBatch: ((updates: Array<{ ruleId: string; changes: Partial<HeaderRule> }>) => Promise<void>) | null = null;

    constructor(wsService: RuleHandlerDeps) {
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
                    if (source && source.activationState !== 'waiting_for_deps'
                        && source.sourceContent !== null && source.sourceContent !== undefined) {
                        // Content is available (including empty string) and source deps are met — populate header value
                        processed.headerValue = (processed.prefix || '') + source.sourceContent + (processed.suffix || '');
                    } else if (source) {
                        // Source exists but either has unresolved deps or content not yet fetched — exclude rule
                        log.debug(`Rule "${rule.headerName}" pending — source ${processed.sourceId} ${source.activationState === 'waiting_for_deps' ? 'has unresolved dependencies' : 'content not yet fetched'}`);
                        return null;
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
     * Handle toggle rule request from extension.
     * Delegates to WorkspaceStateService via onRuleToggle callback,
     * which handles persistence, WS broadcast, proxy update, and renderer notification.
     */
    async handleToggleRule(ruleId: string | number, enabled: boolean): Promise<void> {
        if (!this.onRuleToggle) {
            log.warn(`Cannot toggle rule ${ruleId} — onRuleToggle not wired yet`);
            return;
        }

        try {
            await this.onRuleToggle(String(ruleId), { isEnabled: enabled });
            log.info(`Successfully toggled rule ${ruleId} to ${enabled}`);
        } catch (error) {
            log.error('Error handling toggle rule:', errorMessage(error));
        }
    }

    /**
     * Handle toggle all rules request from extension.
     * Uses batch callback to mutate all rules and broadcast once.
     * Falls back to individual toggles if batch callback is not wired.
     */
    async handleToggleAllRules(ruleIds: string[], enabled: boolean): Promise<void> {
        log.info(`Handling toggle all rules request: ${ruleIds.length} rules -> ${enabled}`);

        if (this.onRuleToggleBatch) {
            try {
                await this.onRuleToggleBatch(
                    ruleIds.map(id => ({ ruleId: String(id), changes: { isEnabled: enabled } }))
                );
                log.info(`Successfully toggled ${ruleIds.length} rules to ${enabled}`);
            } catch (error) {
                log.error('Error handling batch toggle all rules:', errorMessage(error));
            }
            return;
        }

        if (!this.onRuleToggle) {
            log.warn('Cannot toggle rules — onRuleToggle not wired yet');
            return;
        }

        // Fallback: toggle individually, continue on error
        let succeeded = 0;
        for (const ruleId of ruleIds) {
            try {
                await this.onRuleToggle(String(ruleId), { isEnabled: enabled });
                succeeded++;
            } catch (error) {
                log.error(`Error toggling rule ${ruleId}:`, errorMessage(error));
            }
        }
        log.info(`Toggled ${succeeded}/${ruleIds.length} rules to ${enabled}`);
    }
}

export { WSRuleHandler };
export default WSRuleHandler;

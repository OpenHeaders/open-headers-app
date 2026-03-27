/**
 * WebSocket Source Handler
 * Manages source broadcasting to connected browser extension clients.
 *
 * State ownership: WorkspaceStateService owns all source/rule state and
 * pushes updates to the WS service via broadcastToServices(). This handler
 * simply serialises and sends that in-memory state to clients.
 */

import WebSocket from 'ws';
import mainLogger from '../../utils/mainLogger';
import type { Source } from '../../types/source';

const { createLogger } = mainLogger;
const log = createLogger('WSSourceHandler');

interface SourceHandlerDeps {
    sources: Source[];
    ruleHandler: { broadcastRules(): void };
    _broadcastToAll(message: string): number;
}

class WSSourceHandler {
    wsService: SourceHandlerDeps;

    constructor(wsService: SourceHandlerDeps) {
        this.wsService = wsService;
    }

    /**
     * Update sources and broadcast to all clients.
     * Called by StateBroadcaster.broadcastToServices() when WorkspaceStateService
     * state changes — sources are already fully populated in memory.
     */
    updateSources(sources: Source[]): void {
        log.info(`Sources updated: ${sources.length} sources received`);

        const contentChanged = this._hasSourceContentChanged(sources);
        this.wsService.sources = sources;

        if (!contentChanged) {
            log.info('Source content unchanged, skipping broadcast');
            return;
        }

        this.broadcastSources();
        this.wsService.ruleHandler.broadcastRules();
    }

    /**
     * Send sources to a specific client.
     * Uses in-memory state — WorkspaceStateService is the authoritative source.
     */
    async sendSourcesToClient(ws: WebSocket): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not in OPEN state'));
                return;
            }

            try {
                const message = JSON.stringify({
                    type: 'sourcesInitial',
                    sources: this.wsService.sources
                });

                ws.send(message, (error: Error | undefined) => {
                    if (error) {
                        log.error('Error sending sources to client:', error);
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
     * Check whether any source's content has changed
     */
    _hasSourceContentChanged(newSources: Source[]): boolean {
        const current = this.wsService.sources;
        if (!current || current.length !== newSources.length) return true;

        const oldMap = new Map<string, string>();
        for (const s of current) {
            oldMap.set(s.sourceId, s.sourceContent || '');
        }

        for (const s of newSources) {
            const oldContent = oldMap.get(s.sourceId);
            if (oldContent === undefined || oldContent !== (s.sourceContent || '')) return true;
        }

        return false;
    }

    /**
     * Broadcast sources to all connected clients
     */
    broadcastSources(): void {
        const message = JSON.stringify({
            type: 'sourcesUpdated',
            sources: this.wsService.sources
        });
        this.wsService._broadcastToAll(message);
    }
}

export { WSSourceHandler };
export default WSSourceHandler;

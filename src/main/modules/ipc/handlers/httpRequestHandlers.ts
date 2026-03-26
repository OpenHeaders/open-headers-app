/**
 * IPC handlers for HttpRequestService — lets the renderer execute HTTP
 * requests, query TOTP cooldowns, and generate TOTP previews.
 * All template resolution, TOTP generation, and HTTP execution happen in main.
 */

import mainLogger from '../../../../utils/mainLogger';
import type { HttpRequestService } from '../../../../services/http/HttpRequestService';
import type { TotpCooldownTracker } from '../../../../services/http/TotpCooldownTracker';
import type { IpcInvokeEvent } from '../../../../types/common';
import type { HttpRequestSpec, HttpRequestResult, TotpCooldownInfo } from '../../../../types/http';

const { createLogger } = mainLogger;
const log = createLogger('HttpRequestHandlers');

class HttpRequestHandlers {
    private service: HttpRequestService | null = null;
    private totpTracker: TotpCooldownTracker | null = null;

    handleExecuteRequest: (event: IpcInvokeEvent, spec: HttpRequestSpec) => Promise<HttpRequestResult>;
    handleGetTotpCooldown: (event: IpcInvokeEvent, sourceId: string) => TotpCooldownInfo;
    handleGenerateTotpPreview: (event: IpcInvokeEvent, secret: string) => Promise<string>;

    constructor() {
        this.handleExecuteRequest = this._handleExecuteRequest.bind(this);
        this.handleGetTotpCooldown = this._handleGetTotpCooldown.bind(this);
        this.handleGenerateTotpPreview = this._handleGenerateTotpPreview.bind(this);
    }

    /**
     * Wire dependencies. Called from lifecycle.ts after HttpRequestService is created.
     * Receives the shared instance — does NOT create its own.
     */
    configure(httpRequestService: HttpRequestService, totpTracker: TotpCooldownTracker): void {
        this.service = httpRequestService;
        this.totpTracker = totpTracker;
        log.info('HttpRequestHandlers configured');
    }

    async _handleExecuteRequest(_: IpcInvokeEvent, spec: HttpRequestSpec): Promise<HttpRequestResult> {
        if (!this.service) {
            throw new Error('HttpRequestService not configured yet. Please wait for app initialization.');
        }

        log.info(`Execute request: ${spec.method} ${spec.url} (source: ${spec.sourceId})`);
        return this.service.execute(spec);
    }

    _handleGetTotpCooldown(_: IpcInvokeEvent, sourceId: string): TotpCooldownInfo {
        if (!this.totpTracker) {
            return { inCooldown: false, remainingSeconds: 0, lastUsedTime: null };
        }

        return this.totpTracker.checkCooldown(sourceId);
    }

    async _handleGenerateTotpPreview(_: IpcInvokeEvent, secret: string): Promise<string> {
        if (!this.service) {
            throw new Error('HttpRequestService not configured yet. Please wait for app initialization.');
        }

        return this.service.generateTotpPreview(secret);
    }
}

const httpRequestHandlers = new HttpRequestHandlers();
export { HttpRequestHandlers };
export default httpRequestHandlers;

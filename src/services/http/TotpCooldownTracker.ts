/**
 * TotpCooldownTracker — main-process owner of TOTP cooldown state.
 *
 * Prevents TOTP codes from being reused within their validity period (30 seconds)
 * by tracking when each code was last used per workspace+source pair. Source IDs
 * are workspace-scoped (e.g., both workspaces may have source "1" with different
 * TOTP secrets), so cooldowns are keyed by `workspaceId:sourceId`.
 *
 * Shared between SourceRefreshService (scheduled refreshes) and HttpRequestService
 * (test/initial requests).
 */

import mainLogger from '../../utils/mainLogger';
import timeManager from '../core/TimeManager';
import type { TotpCooldownInfo } from '../../types/http';

const { createLogger } = mainLogger;
const log = createLogger('TotpCooldownTracker');

interface UsageEntry {
    lastCode: string;
    lastUsedTime: number;
    cooldownUntil: number;
    secret: string;
}

class TotpCooldownTracker {
    private usageMap: Map<string, UsageEntry>;
    private readonly TOTP_PERIOD = 30000; // 30 seconds
    private readonly CLEANUP_INTERVAL = 60000; // 1 minute
    private cleanupInterval: ReturnType<typeof setInterval> | null;

    constructor() {
        this.usageMap = new Map();
        this.cleanupInterval = null;
    }

    /** Build the composite key that scopes cooldowns per workspace+source. */
    private key(workspaceId: string, sourceId: string): string {
        return `${workspaceId}:${sourceId}`;
    }

    recordUsage(workspaceId: string, sourceId: string, secret: string, code: string): void {
        if (!sourceId || !code) return;

        const now = timeManager.now();
        const cooldownUntil = now + this.TOTP_PERIOD;
        const k = this.key(workspaceId, sourceId);

        this.usageMap.set(k, {
            lastCode: code,
            lastUsedTime: now,
            cooldownUntil,
            secret
        });

        log.debug(`Recorded TOTP usage for source: ${sourceId} (workspace: ${workspaceId}), cooldown until: ${timeManager.formatTimestamp(cooldownUntil)}`);

        if (!this.cleanupInterval && this.usageMap.size > 0) {
            this.cleanupInterval = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
        }
    }

    checkCooldown(workspaceId: string, sourceId: string): TotpCooldownInfo {
        if (!sourceId) {
            return { inCooldown: false, remainingSeconds: 0, lastUsedTime: null };
        }

        const usage = this.usageMap.get(this.key(workspaceId, sourceId));
        if (!usage) {
            return { inCooldown: false, remainingSeconds: 0, lastUsedTime: null };
        }

        const now = timeManager.now();

        if (now < usage.cooldownUntil) {
            const remainingMs = usage.cooldownUntil - now;
            const remainingSeconds = Math.ceil(remainingMs / 1000);
            return { inCooldown: true, remainingSeconds, lastUsedTime: usage.lastUsedTime };
        }

        return { inCooldown: false, remainingSeconds: 0, lastUsedTime: usage.lastUsedTime };
    }

    getCooldownSeconds(workspaceId: string, sourceId: string): number {
        return this.checkCooldown(workspaceId, sourceId).remainingSeconds;
    }

    getAllActiveCooldowns(): string[] {
        const now = timeManager.now();
        const active: string[] = [];

        for (const [compositeKey, usage] of this.usageMap.entries()) {
            if (now < usage.cooldownUntil) {
                active.push(compositeKey);
            }
        }

        return active;
    }

    private cleanup(): void {
        if (this.usageMap.size === 0) return;

        const now = timeManager.now();
        let cleaned = 0;

        for (const [compositeKey, usage] of this.usageMap.entries()) {
            if (now >= usage.cooldownUntil) {
                this.usageMap.delete(compositeKey);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            log.debug(`Cleaned up ${cleaned} expired TOTP cooldown entries`);
        }

        if (this.usageMap.size === 0 && this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.usageMap.clear();
    }
}

const totpCooldownTracker = new TotpCooldownTracker();
export { TotpCooldownTracker };
export default totpCooldownTracker;

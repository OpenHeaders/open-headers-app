const { createLogger } = require('../utils/error-handling/logger');
const timeManager = require('./TimeManager');

const log = createLogger('TotpUsageTracker');

/**
 * TotpUsageTracker - Service to track TOTP code usage and enforce cooldown periods
 * 
 * Prevents TOTP codes from being reused within their validity period (30 seconds)
 * by tracking when each code was last used for each source.
 */
class TotpUsageTracker {
  constructor() {
    // Map of sourceId -> { lastCode, lastUsedTime, cooldownUntil, secret }
    this.usageMap = new Map();
    
    // Constants
    this.TOTP_PERIOD = 30000; // 30 seconds in milliseconds
    this.CLEANUP_INTERVAL = 60000; // Clean up old entries every minute
    
    // Don't start cleanup interval until we have entries
    this.cleanupInterval = null;
  }
  
  /**
   * Record that a TOTP code was used for a source
   * @param {string} sourceId - The source ID
   * @param {string} secret - The TOTP secret (for reference)
   * @param {string} code - The TOTP code that was used
   * @returns {void}
   */
  recordUsage(sourceId, secret, code) {
    if (!sourceId || !code) return;
    
    const now = timeManager.now();
    const cooldownUntil = now + this.TOTP_PERIOD;
    
    this.usageMap.set(sourceId, {
      lastCode: code,
      lastUsedTime: now,
      cooldownUntil: cooldownUntil,
      secret: secret
    });
    
    log.debug(`Recorded TOTP usage for source: ${sourceId}, cooldown until: ${new Date(cooldownUntil).toISOString()}`);
    
    // Start cleanup interval if not already running
    if (!this.cleanupInterval && this.usageMap.size > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
      log.debug('Started TOTP cleanup interval');
    }
  }
  
  /**
   * Check if a source is currently in TOTP cooldown
   * @param {string} sourceId - The source ID
   * @returns {{ inCooldown: boolean, remainingSeconds: number, lastUsedTime: number | null }}
   */
  checkCooldown(sourceId) {
    if (!sourceId) {
      return { inCooldown: false, remainingSeconds: 0, lastUsedTime: null };
    }
    
    const usage = this.usageMap.get(sourceId);
    if (!usage) {
      return { inCooldown: false, remainingSeconds: 0, lastUsedTime: null };
    }
    
    const now = timeManager.now();
    
    if (now < usage.cooldownUntil) {
      const remainingMs = usage.cooldownUntil - now;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      
      return {
        inCooldown: true,
        remainingSeconds: remainingSeconds,
        lastUsedTime: usage.lastUsedTime
      };
    }
    
    return { inCooldown: false, remainingSeconds: 0, lastUsedTime: usage.lastUsedTime };
  }
  
  /**
   * Clean up expired entries
   */
  cleanup() {
    // Skip if map is empty
    if (this.usageMap.size === 0) {
      return;
    }
    
    const now = timeManager.now();
    let cleaned = 0;
    
    for (const [sourceId, usage] of this.usageMap.entries()) {
      if (now >= usage.cooldownUntil) {
        this.usageMap.delete(sourceId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      log.debug(`Cleaned up ${cleaned} expired TOTP usage entries`);
    }
    
    // Stop cleanup interval if map is now empty
    if (this.usageMap.size === 0 && this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      log.debug('Stopped TOTP cleanup interval - no more entries');
    }
  }
  
  /**
   * Get all source IDs that have active cooldowns
   * @returns {Array<string>} Array of source IDs
   */
  getAllActiveCooldowns() {
    const now = timeManager.now();
    const activeSourceIds = [];
    
    for (const [sourceId, usage] of this.usageMap.entries()) {
      if (now < usage.cooldownUntil) {
        activeSourceIds.push(sourceId);
      }
    }
    
    return activeSourceIds;
  }
  
  /**
   * Destroy the tracker and clean up
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.usageMap.clear();
  }
}

// Export singleton instance
module.exports = new TotpUsageTracker();
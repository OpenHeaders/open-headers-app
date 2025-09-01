/**
 * GitAuthenticator - Main authentication orchestrator
 * Handles different authentication strategies for Git operations
 */

const { createLogger } = require('../../../../utils/mainLogger');
const TokenAuthStrategy = require('./TokenAuthStrategy');
const SSHAuthStrategy = require('./SSHAuthStrategy');
const BasicAuthStrategy = require('./BasicAuthStrategy');

const log = createLogger('GitAuthenticator');

class GitAuthenticator {
  constructor(sshDir) {
    this.strategies = {
      token: new TokenAuthStrategy(),
      'ssh-key': new SSHAuthStrategy(sshDir),
      basic: new BasicAuthStrategy(),
      none: null
    };
  }

  /**
   * Setup authentication for Git operation
   * @param {string} url - Repository URL
   * @param {string} authType - Authentication type
   * @param {Object} authData - Authentication data
   * @returns {Promise<Object>} - Auth result with effectiveUrl and env
   */
  async setupAuth(url, authType = 'none', authData = {}) {
    log.debug(`Setting up ${authType} authentication`);

    if (authType === 'none' || !authType) {
      return {
        effectiveUrl: url,
        env: process.env,
        type: 'none'
      };
    }

    const strategy = this.strategies[authType];
    if (!strategy) {
      throw new Error(`Unknown authentication type: ${authType}`);
    }

    try {
      const result = await strategy.setup(url, authData);
      return {
        ...result,
        type: authType
      };
    } catch (error) {
      log.error(`${authType} authentication setup failed:`, error);
      throw new Error(`${authType} authentication setup failed: ${error.message}`);
    }
  }

  /**
   * Cleanup authentication resources
   * @param {string} authType - Authentication type
   * @param {Object} authResult - Result from setupAuth
   */
  async cleanup(authType, authResult) {
    if (authType === 'none' || !authType) {
      return;
    }

    const strategy = this.strategies[authType];
    if (strategy && strategy.cleanup) {
      await strategy.cleanup(authResult);
    }
  }

  /**
   * Validate authentication data
   * @param {string} authType - Authentication type
   * @param {Object} authData - Authentication data
   * @returns {Object} - Validation result
   */
  validateAuthData(authType, authData) {
    if (authType === 'none' || !authType) {
      return { valid: true };
    }

    const strategy = this.strategies[authType];
    if (!strategy) {
      return { 
        valid: false, 
        error: `Unknown authentication type: ${authType}` 
      };
    }

    if (strategy.validate) {
      return strategy.validate(authData);
    }

    return { valid: true };
  }

  /**
   * Get authentication URL for display (without sensitive data)
   * @param {string} url - Repository URL
   * @param {string} authType - Authentication type
   * @returns {string} - Safe display URL
   */
  getSafeDisplayUrl(url, authType) {
    if (authType === 'token') {
      return `${url} (with token authentication)`;
    } else if (authType === 'basic') {
      return `${url} (with username/password)`;
    } else if (authType === 'ssh-key') {
      return `${url} (with SSH key)`;
    }
    return url;
  }
}

module.exports = GitAuthenticator;
/**
 * TokenAuthStrategy - Handles token-based authentication for various Git providers
 */

const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('TokenAuthStrategy');

class TokenAuthStrategy {
  /**
   * Setup token authentication
   * @param {string} url - Repository URL
   * @param {Object} authData - Authentication data
   * @returns {Promise<Object>} - Result with effectiveUrl and env
   */
  async setup(url, authData) {
    const { token, tokenType = 'auto' } = authData;

    if (!token) {
      throw new Error('Access token is required for token authentication');
    }

    const effectiveUrl = this.getAuthUrl(url, token, tokenType);
    
    return {
      effectiveUrl,
      env: process.env
    };
  }

  /**
   * Validate token authentication data
   * @param {Object} authData - Authentication data
   * @returns {Object} - Validation result
   */
  validate(authData) {
    if (!authData.token) {
      return {
        valid: false,
        error: 'Access token is required'
      };
    }
    return { valid: true };
  }

  /**
   * Get authenticated URL for token-based auth
   * @param {string} url - Repository URL
   * @param {string} token - Access token
   * @param {string} tokenType - Token type (auto, github, gitlab, etc.)
   * @returns {string} - Authenticated URL
   */
  getAuthUrl(url, token, tokenType = 'auto') {
    try {
      const urlObj = new URL(url);
      
      // Auto-detect token type based on hostname
      if (tokenType === 'auto') {
        tokenType = this.detectTokenType(urlObj.hostname);
      }

      // Apply token based on provider
      switch (tokenType) {
        case 'github':
          // GitHub: use token as username with x-oauth-basic password
          urlObj.username = token;
          urlObj.password = 'x-oauth-basic';
          break;
          
        case 'gitlab':
          // GitLab: use oauth2 as username and token as password
          urlObj.username = 'oauth2';
          urlObj.password = token;
          break;
          
        case 'bitbucket':
          // Bitbucket: use x-token-auth as username
          urlObj.username = 'x-token-auth';
          urlObj.password = token;
          break;
          
        case 'azure':
          // Azure DevOps: use token as password with any username
          urlObj.username = 'token';
          urlObj.password = token;
          break;
          
        case 'generic':
        default:
          // Generic: use token as password
          urlObj.username = 'token';
          urlObj.password = token;
          break;
      }

      return urlObj.toString();
    } catch (error) {
      throw new Error(`Failed to parse Git URL: ${error.message}`);
    }
  }

  /**
   * Detect token type based on hostname
   * @param {string} hostname - Repository hostname
   * @returns {string} - Detected token type
   */
  detectTokenType(hostname) {
    if (hostname === 'github.com' || hostname.includes('github')) {
      return 'github';
    } else if (hostname.includes('gitlab')) {
      return 'gitlab';
    } else if (hostname.includes('bitbucket')) {
      return 'bitbucket';
    } else if (hostname.includes('azure') || hostname.includes('visualstudio')) {
      return 'azure';
    }
    return 'generic';
  }
}

module.exports = TokenAuthStrategy;
/**
 * BasicAuthStrategy - Handles basic username/password authentication for Git operations
 */

const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('BasicAuthStrategy');

class BasicAuthStrategy {
  /**
   * Setup basic authentication
   * @param {string} url - Repository URL
   * @param {Object} authData - Authentication data
   * @returns {Promise<Object>} - Result with effectiveUrl and env
   */
  async setup(url, authData) {
    const { username, password } = authData;

    if (!username || !password) {
      throw new Error('Username and password are required for basic authentication');
    }

    // Embed credentials in URL
    const effectiveUrl = this.embedCredentials(url, username, password);

    return {
      effectiveUrl,
      env: process.env
    };
  }

  /**
   * Validate basic authentication data
   * @param {Object} authData - Authentication data
   * @returns {Object} - Validation result
   */
  validate(authData) {
    if (!authData.username) {
      return {
        valid: false,
        error: 'Username is required'
      };
    }

    if (!authData.password) {
      return {
        valid: false,
        error: 'Password is required'
      };
    }

    return { valid: true };
  }

  /**
   * Embed credentials into Git URL
   * @param {string} url - Repository URL
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {string} - URL with embedded credentials
   */
  embedCredentials(url, username, password) {
    try {
      const urlObj = new URL(url);
      
      // URL encode credentials to handle special characters
      urlObj.username = encodeURIComponent(username);
      urlObj.password = encodeURIComponent(password);
      
      return urlObj.toString();
    } catch (error) {
      throw new Error(`Failed to parse Git URL: ${error.message}`);
    }
  }

  /**
   * Get safe display URL (without password)
   * @param {string} url - Repository URL
   * @param {string} username - Username
   * @returns {string} - Safe display URL
   */
  getSafeDisplayUrl(url, username) {
    try {
      const urlObj = new URL(url);
      urlObj.username = username;
      urlObj.password = '***';
      return urlObj.toString();
    } catch (error) {
      return `${url} (with credentials)`;
    }
  }
}

module.exports = BasicAuthStrategy;
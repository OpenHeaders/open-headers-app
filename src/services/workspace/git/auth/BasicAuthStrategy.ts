/**
 * BasicAuthStrategy - Handles basic username/password authentication for Git operations
 */

import mainLogger from '../../../../utils/mainLogger';

const { createLogger } = mainLogger;

const log = createLogger('BasicAuthStrategy');

interface AuthData {
  username?: string;
  password?: string;
}

interface AuthResult {
  effectiveUrl: string;
  env: NodeJS.ProcessEnv;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

class BasicAuthStrategy {
  /**
   * Setup basic authentication
   */
  async setup(url: string, authData: AuthData): Promise<AuthResult> {
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
   */
  validate(authData: AuthData): ValidationResult {
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
   */
  embedCredentials(url: string, username: string, password: string): string {
    try {
      const urlObj = new URL(url);

      // URL encode credentials to handle special characters
      urlObj.username = encodeURIComponent(username);
      urlObj.password = encodeURIComponent(password);

      return urlObj.toString();
    } catch (error) {
      throw new Error(`Failed to parse Git URL: ${(error as Error).message}`);
    }
  }

  /**
   * Get safe display URL (without password)
   */
  getSafeDisplayUrl(url: string, username: string): string {
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

export { BasicAuthStrategy };
export type { AuthData, AuthResult, ValidationResult };
export default BasicAuthStrategy;

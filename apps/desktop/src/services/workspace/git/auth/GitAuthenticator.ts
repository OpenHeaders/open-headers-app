/**
 * GitAuthenticator - Main authentication orchestrator
 * Handles different authentication strategies for Git operations
 */

import { errorMessage } from '../../../../types/common';
import type { WorkspaceAuthData } from '../../../../types/workspace';
import mainLogger from '../../../../utils/mainLogger';
import BasicAuthStrategy from './BasicAuthStrategy';
import SSHAuthStrategy from './SSHAuthStrategy';
import TokenAuthStrategy from './TokenAuthStrategy';

const { createLogger } = mainLogger;

const log = createLogger('GitAuthenticator');

interface AuthStrategy {
  setup: (
    url: string,
    authData: WorkspaceAuthData,
  ) => Promise<{ effectiveUrl: string; env: NodeJS.ProcessEnv; cleanup?: () => Promise<void>; keyHash?: string }>;
  validate?: (authData: WorkspaceAuthData) => { valid: boolean; error?: string };
  cleanup?: (authResult: { cleanup?: () => Promise<void> } | null) => Promise<void>;
}

interface SetupAuthResult {
  effectiveUrl: string;
  env: NodeJS.ProcessEnv;
  type: string;
  cleanup?: () => Promise<void>;
  keyHash?: string;
}

class GitAuthenticator {
  private strategies: Record<string, AuthStrategy | null>;

  constructor(sshDir: string) {
    this.strategies = {
      token: new TokenAuthStrategy(),
      'ssh-key': new SSHAuthStrategy(sshDir),
      basic: new BasicAuthStrategy(),
      none: null,
    };
  }

  /**
   * Setup authentication for Git operation
   */
  async setupAuth(url: string, authType = 'none', authData: WorkspaceAuthData = {}): Promise<SetupAuthResult> {
    log.debug(`Setting up ${authType} authentication`);

    if (authType === 'none' || !authType) {
      return {
        effectiveUrl: url,
        env: process.env,
        type: 'none',
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
        type: authType,
      };
    } catch (error) {
      log.error(`${authType} authentication setup failed:`, error);
      throw new Error(`${authType} authentication setup failed: ${errorMessage(error)}`);
    }
  }

  /**
   * Cleanup authentication resources
   */
  async cleanup(authType: string, authResult: SetupAuthResult): Promise<void> {
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
   */
  validateAuthData(authType: string, authData: WorkspaceAuthData): { valid: boolean; error?: string } {
    if (authType === 'none' || !authType) {
      return { valid: true };
    }

    const strategy = this.strategies[authType];
    if (!strategy) {
      return {
        valid: false,
        error: `Unknown authentication type: ${authType}`,
      };
    }

    if (strategy.validate) {
      return strategy.validate(authData);
    }

    return { valid: true };
  }

  /**
   * Get authentication URL for display (without sensitive data)
   */
  getSafeDisplayUrl(url: string, authType: string): string {
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

export type { AuthStrategy, SetupAuthResult };
export { GitAuthenticator };
export default GitAuthenticator;

/**
 * SSHAuthStrategy - Handles SSH key-based authentication for Git operations
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { errorMessage } from '@openheaders/core';
import mainLogger from '@/utils/mainLogger';

const fsPromises = fs.promises;
const { createLogger } = mainLogger;

const log = createLogger('SSHAuthStrategy');

interface SSHAuthData {
  privateKey?: string;
  publicKey?: string;
  passphrase?: string;
}

interface SSHAuthResult {
  effectiveUrl: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => Promise<void>;
  keyHash: string;
}

interface SSHValidationResult {
  valid: boolean;
  error?: string;
}

class SSHAuthStrategy {
  private readonly sshDir: string;

  constructor(sshDir: string) {
    this.sshDir = sshDir;
  }

  /**
   * Setup SSH authentication
   */
  async setup(url: string, authData: SSHAuthData): Promise<SSHAuthResult> {
    const { privateKey, publicKey, passphrase = '' } = authData;

    if (!privateKey) {
      throw new Error('SSH private key is required');
    }

    // Generate unique name for this SSH key
    const keyHash = crypto.createHash('md5').update(privateKey).digest('hex');
    const keyName = `git-ssh-key-${keyHash}`;
    const keyPath = path.join(this.sshDir, keyName);
    const pubKeyPath = `${keyPath}.pub`;
    const sshConfigPath = path.join(this.sshDir, `config-${keyHash}`);

    // Write SSH keys
    await fsPromises.writeFile(keyPath, privateKey, { mode: 0o600 });
    if (publicKey) {
      await fsPromises.writeFile(pubKeyPath, publicKey, { mode: 0o644 });
    }

    // Create SSH config for this specific key
    const sshConfig = `Host ${keyHash}.git
  HostName ${this.extractHostname(url)}
  User git
  IdentityFile ${keyPath}
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null`;

    await fsPromises.writeFile(sshConfigPath, sshConfig, { mode: 0o600 });

    // Convert URL to use SSH
    const sshUrl = this.convertToSshUrl(url, keyHash);

    // Set up SSH environment
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_SSH_COMMAND: `ssh -F ${sshConfigPath} -o BatchMode=yes`,
    };

    if (passphrase) {
      // For passphrases, we need SSH_ASKPASS
      env.SSH_ASKPASS_REQUIRE = 'force';
      env.SSH_ASKPASS = this.createAskpassScript(passphrase);
    }

    return {
      effectiveUrl: sshUrl,
      env,
      cleanup: async () => {
        // Cleanup function to remove SSH keys after use
        try {
          await fsPromises.unlink(keyPath).catch(() => {});
          await fsPromises.unlink(pubKeyPath).catch(() => {});
          await fsPromises.unlink(sshConfigPath).catch(() => {});
        } catch (error) {
          log.error('Failed to cleanup SSH keys:', error);
        }
      },
      keyHash,
    };
  }

  /**
   * Validate SSH authentication data
   */
  validate(authData: SSHAuthData): SSHValidationResult {
    if (!authData.privateKey) {
      return {
        valid: false,
        error: 'SSH private key is required',
      };
    }

    // Basic validation of key format
    const key = authData.privateKey.trim();
    if (!key.includes('-----BEGIN') || !key.includes('-----END')) {
      return {
        valid: false,
        error: 'Invalid SSH key format',
      };
    }

    return { valid: true };
  }

  /**
   * Extract hostname from Git URL
   */
  extractHostname(url: string): string {
    try {
      if (url.startsWith('git@')) {
        return url.split(':')[0].replace('git@', '');
      }
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (_error) {
      throw new Error(`Failed to extract hostname from URL: ${url}`);
    }
  }

  /**
   * Convert HTTPS URL to SSH URL
   */
  convertToSshUrl(url: string, keyHash: string): string {
    if (url.startsWith('git@')) {
      // Already SSH URL, update to use custom host
      return url.replace(/^git@[^:]+:/, `git@${keyHash}.git:`);
    }

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch (error) {
      throw new Error(`Failed to convert URL to SSH format: ${errorMessage(error)}`);
    }

    const pathParts = urlObj.pathname.split('/').filter((p) => p);

    if (pathParts.length < 2) {
      throw new Error('Failed to convert URL to SSH format: Invalid repository URL');
    }

    const owner = pathParts[0];
    const repo = pathParts[1].replace(/\.git$/, '');

    return `git@${keyHash}.git:${owner}/${repo}.git`;
  }

  /**
   * Create askpass script for SSH passphrase
   */
  createAskpassScript(_passphrase: string): string {
    // This is a placeholder - in production, you'd create a proper script
    // that returns the passphrase when called
    log.warn('SSH passphrase support not fully implemented');
    return '';
  }

  /**
   * Cleanup any remaining SSH resources
   */
  async cleanup(authResult: { cleanup?: () => Promise<void> } | null): Promise<void> {
    if (authResult?.cleanup) {
      await authResult.cleanup();
    }
  }
}

export type { SSHAuthData, SSHAuthResult, SSHValidationResult };
export { SSHAuthStrategy };
export default SSHAuthStrategy;

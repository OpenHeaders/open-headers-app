/**
 * SSHAuthStrategy - Handles SSH key-based authentication for Git operations
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('SSHAuthStrategy');

class SSHAuthStrategy {
  constructor(sshDir) {
    this.sshDir = sshDir;
  }

  /**
   * Setup SSH authentication
   * @param {string} url - Repository URL
   * @param {Object} authData - Authentication data
   * @returns {Promise<Object>} - Result with effectiveUrl and env
   */
  async setup(url, authData) {
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
    await fs.writeFile(keyPath, privateKey, { mode: 0o600 });
    if (publicKey) {
      await fs.writeFile(pubKeyPath, publicKey, { mode: 0o644 });
    }

    // Create SSH config for this specific key
    const sshConfig = `Host ${keyHash}.git
  HostName ${this.extractHostname(url)}
  User git
  IdentityFile ${keyPath}
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null`;

    await fs.writeFile(sshConfigPath, sshConfig, { mode: 0o600 });

    // Convert URL to use SSH
    const sshUrl = this.convertToSshUrl(url, keyHash);

    // Set up SSH environment
    const env = {
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
          await fs.unlink(keyPath).catch(() => {});
          await fs.unlink(pubKeyPath).catch(() => {});
          await fs.unlink(sshConfigPath).catch(() => {});
        } catch (error) {
          log.error('Failed to cleanup SSH keys:', error);
        }
      },
      keyHash
    };
  }

  /**
   * Validate SSH authentication data
   * @param {Object} authData - Authentication data
   * @returns {Object} - Validation result
   */
  validate(authData) {
    if (!authData.privateKey) {
      return {
        valid: false,
        error: 'SSH private key is required'
      };
    }

    // Basic validation of key format
    const key = authData.privateKey.trim();
    if (!key.includes('-----BEGIN') || !key.includes('-----END')) {
      return {
        valid: false,
        error: 'Invalid SSH key format'
      };
    }

    return { valid: true };
  }

  /**
   * Extract hostname from Git URL
   * @param {string} url - Git URL
   * @returns {string} - Hostname
   */
  extractHostname(url) {
    try {
      if (url.startsWith('git@')) {
        return url.split(':')[0].replace('git@', '');
      }
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      throw new Error(`Failed to extract hostname from URL: ${url}`);
    }
  }

  /**
   * Convert HTTPS URL to SSH URL
   * @param {string} url - Original URL
   * @param {string} keyHash - Key hash for custom host
   * @returns {string} - SSH URL
   */
  convertToSshUrl(url, keyHash) {
    if (url.startsWith('git@')) {
      // Already SSH URL, update to use custom host
      return url.replace(/^git@[^:]+:/, `git@${keyHash}.git:`);
    }

    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      
      if (pathParts.length < 2) {
        throw new Error('Invalid repository URL');
      }

      const owner = pathParts[0];
      const repo = pathParts[1].replace(/\.git$/, '');
      
      return `git@${keyHash}.git:${owner}/${repo}.git`;
    } catch (error) {
      throw new Error(`Failed to convert URL to SSH format: ${error.message}`);
    }
  }

  /**
   * Create askpass script for SSH passphrase
   * @param {string} passphrase - SSH key passphrase
   * @returns {string} - Path to askpass script
   */
  createAskpassScript(passphrase) {
    // This is a placeholder - in production, you'd create a proper script
    // that returns the passphrase when called
    log.warn('SSH passphrase support not fully implemented');
    return '';
  }

  /**
   * Cleanup any remaining SSH resources
   */
  async cleanup(authResult) {
    if (authResult && authResult.cleanup) {
      await authResult.cleanup();
    }
  }
}

module.exports = SSHAuthStrategy;
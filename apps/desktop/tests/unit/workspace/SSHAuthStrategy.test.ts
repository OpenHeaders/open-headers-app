import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SSHAuthStrategy } from '../../../src/services/workspace/git/auth/SSHAuthStrategy';

// Realistic SSH key material
const RSA_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWep4PAtGoGHdTGnT6KBFRnIDGfaEaq
Nc4WAhXoMa8Kk0hMIiLXwAGfI7HBGKA7GSjY8F3JQdRfEsDQ6I1sp7VOBQ2La4A
5ahNdGz7r9IDGK3WUwIDAQABFAKECAQBjT9xD+mN1234567890abcdefghijklmn
-----END RSA PRIVATE KEY-----`;

const OPENSSH_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACDcFkfhA1234567890abcdefghijklmnopqrstuvwxyz012345
-----END OPENSSH PRIVATE KEY-----`;

const RSA_PUBLIC_KEY =
  'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDRndVLkklx2zfF+f/KBZ6ng8C0agYd1MadPooEVGcgMZ9oRqo1zhYCFegxrwqTSEwiItfAAZ8jscEYoDsZKNjwXclB1F8SwNDojWyntU4FDYtrgDlqE10bPuv0gMYrdZTAgMBAAE= deploy@openheaders.io';

describe('SSHAuthStrategy', () => {
  const SSH_DIR = '/Users/jane.doe/.openheaders/ssh-keys';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validate()', () => {
    const strategy = new SSHAuthStrategy(SSH_DIR);

    it('returns valid for RSA PEM key', () => {
      expect(strategy.validate({ privateKey: RSA_PRIVATE_KEY })).toEqual({
        valid: true,
      });
    });

    it('returns valid for OpenSSH format key', () => {
      expect(strategy.validate({ privateKey: OPENSSH_PRIVATE_KEY })).toEqual({
        valid: true,
      });
    });

    it('returns error when private key is undefined', () => {
      expect(strategy.validate({})).toEqual({
        valid: false,
        error: 'SSH private key is required',
      });
    });

    it('returns error when private key is empty string', () => {
      expect(strategy.validate({ privateKey: '' })).toEqual({
        valid: false,
        error: 'SSH private key is required',
      });
    });

    it('returns error for key without PEM markers', () => {
      expect(strategy.validate({ privateKey: 'just some random text' })).toEqual({
        valid: false,
        error: 'Invalid SSH key format',
      });
    });

    it('returns error for key with only BEGIN marker', () => {
      expect(
        strategy.validate({
          privateKey: '-----BEGIN RSA PRIVATE KEY-----\nsome-data-no-end',
        }),
      ).toEqual({
        valid: false,
        error: 'Invalid SSH key format',
      });
    });

    it('accepts key with leading/trailing whitespace (trimmed internally)', () => {
      expect(
        strategy.validate({
          privateKey: `  \n${RSA_PRIVATE_KEY}\n  `,
        }),
      ).toEqual({ valid: true });
    });
  });

  describe('extractHostname()', () => {
    const strategy = new SSHAuthStrategy(SSH_DIR);

    it('extracts hostname from git@github.com URL', () => {
      expect(strategy.extractHostname('git@github.com:OpenHeaders/open-headers-app.git')).toBe('github.com');
    });

    it('extracts hostname from git@gitlab.openheaders.io URL', () => {
      expect(strategy.extractHostname('git@gitlab.openheaders.io:platform/shared-headers.git')).toBe(
        'gitlab.openheaders.io',
      );
    });

    it('extracts hostname from HTTPS URL', () => {
      expect(strategy.extractHostname('https://github.com/OpenHeaders/open-headers-app.git')).toBe('github.com');
    });

    it('extracts hostname from HTTPS URL with port', () => {
      expect(strategy.extractHostname('https://gitlab.openheaders.io:8443/repo.git')).toBe('gitlab.openheaders.io');
    });

    it('throws for completely invalid URL', () => {
      expect(() => strategy.extractHostname('???')).toThrow('Failed to extract hostname');
    });
  });

  describe('convertToSshUrl()', () => {
    const strategy = new SSHAuthStrategy(SSH_DIR);
    const keyHash = 'a1b2c3d4e5f67890abcdef1234567890';

    it('converts HTTPS GitHub URL to SSH with custom host', () => {
      const result = strategy.convertToSshUrl('https://github.com/OpenHeaders/open-headers-app.git', keyHash);
      expect(result).toBe(`git@${keyHash}.git:OpenHeaders/open-headers-app.git`);
    });

    it('converts HTTPS GitLab URL (strips .git suffix before re-adding)', () => {
      const result = strategy.convertToSshUrl('https://gitlab.openheaders.io/platform/shared-headers.git', keyHash);
      expect(result).toBe(`git@${keyHash}.git:platform/shared-headers.git`);
    });

    it('converts HTTPS URL without .git suffix', () => {
      const result = strategy.convertToSshUrl('https://github.com/OpenHeaders/open-headers-app', keyHash);
      expect(result).toBe(`git@${keyHash}.git:OpenHeaders/open-headers-app.git`);
    });

    it('updates existing SSH URL with custom host', () => {
      const result = strategy.convertToSshUrl('git@github.com:OpenHeaders/open-headers-app.git', keyHash);
      expect(result).toBe(`git@${keyHash}.git:OpenHeaders/open-headers-app.git`);
    });

    it('throws for URL with insufficient path parts (no owner/repo)', () => {
      expect(() => strategy.convertToSshUrl('https://github.com/only-one', keyHash)).toThrow('Invalid repository URL');
    });
  });

  describe('setup()', () => {
    it('writes key files and returns SSH URL with cleanup function', async () => {
      const fs = await import('fs');
      const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

      const strategy = new SSHAuthStrategy(SSH_DIR);
      const result = await strategy.setup('https://github.com/OpenHeaders/open-headers-app.git', {
        privateKey: RSA_PRIVATE_KEY,
        publicKey: RSA_PUBLIC_KEY,
      });

      // Should have written private key, public key, and SSH config
      expect(writeFileSpy).toHaveBeenCalledTimes(3);

      // Private key should be written with mode 0o600
      const [privKeyPath, , privKeyOpts] = writeFileSpy.mock.calls[0];
      expect(privKeyPath).toContain('git-ssh-key-');
      expect((privKeyOpts as { mode: number }).mode).toBe(0o600);

      // Public key should be written with mode 0o644
      const [pubKeyPath, , pubKeyOpts] = writeFileSpy.mock.calls[1];
      expect(pubKeyPath).toContain('.pub');
      expect((pubKeyOpts as { mode: number }).mode).toBe(0o644);

      // SSH config should be written
      const sshConfigContent = writeFileSpy.mock.calls[2][1] as string;
      expect(sshConfigContent).toContain('HostName github.com');
      expect(sshConfigContent).toContain('StrictHostKeyChecking no');

      // Effective URL should be SSH format with keyHash
      expect(result.effectiveUrl).toContain('.git:OpenHeaders/open-headers-app.git');

      // Env should include GIT_SSH_COMMAND
      expect(result.env.GIT_SSH_COMMAND).toContain('-F ');

      // Should have cleanup function and keyHash
      expect(typeof result.cleanup).toBe('function');
      expect(result.keyHash).toBeTruthy();

      writeFileSpy.mockRestore();
    });

    it('throws when private key is missing', async () => {
      const strategy = new SSHAuthStrategy(SSH_DIR);
      await expect(strategy.setup('https://github.com/OpenHeaders/open-headers-app.git', {})).rejects.toThrow(
        'SSH private key is required',
      );
    });

    it('sets SSH_ASKPASS_REQUIRE when passphrase is provided', async () => {
      const fs = await import('fs');
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

      const strategy = new SSHAuthStrategy(SSH_DIR);
      const result = await strategy.setup('https://github.com/OpenHeaders/open-headers-app.git', {
        privateKey: RSA_PRIVATE_KEY,
        passphrase: 'my-secure-passphrase',
      });

      expect(result.env.SSH_ASKPASS_REQUIRE).toBe('force');

      vi.restoreAllMocks();
    });
  });

  describe('cleanup()', () => {
    it('calls the cleanup function on auth result', async () => {
      const cleanupFn = vi.fn().mockResolvedValue(undefined);
      const strategy = new SSHAuthStrategy(SSH_DIR);
      await strategy.cleanup({ cleanup: cleanupFn });
      expect(cleanupFn).toHaveBeenCalledOnce();
    });

    it('does nothing when auth result is null', async () => {
      const strategy = new SSHAuthStrategy(SSH_DIR);
      await expect(strategy.cleanup(null)).resolves.toBeUndefined();
    });

    it('does nothing when auth result cleanup is undefined', async () => {
      const strategy = new SSHAuthStrategy(SSH_DIR);
      await expect(strategy.cleanup({})).resolves.toBeUndefined();
    });
  });
});

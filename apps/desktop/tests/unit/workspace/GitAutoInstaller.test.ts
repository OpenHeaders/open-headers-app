import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for pure logic in GitAutoInstaller.
 *
 * We test:
 * - Linux distro detection parsing (os-release file parsing)
 * - sendProgress callback mechanism
 * - Platform-specific git command selection (which vs where)
 * - Install command determination based on distro
 * - Progress callback management
 */

// ---------- detectLinuxDistro parsing ----------
// Mirrors GitAutoInstaller.detectLinuxDistro() — the pure parsing portion
function parseOsRelease(content: string): Record<string, string | undefined> {
  const lines = content.split('\n');
  const distroInfo: Record<string, string | undefined> = {};

  lines.forEach((line) => {
    const [key, value] = line.split('=');
    if (key && value) {
      distroInfo[key.toLowerCase()] = value.replace(/"/g, '');
    }
  });

  return distroInfo;
}

// ---------- git check command selection ----------
// Mirrors the platform check in isGitInstalled()
function getGitCheckCommand(platform: string): string {
  return platform === 'win32' ? 'where git' : 'which git';
}

// ---------- git path extraction ----------
// Mirrors the stdout parsing in isGitInstalled()
function extractGitPath(stdout: string): string {
  return stdout.trim().split('\n')[0];
}

// ---------- install command for distro ----------
// Mirrors the switch statement in installGitLinux()
function getLinuxInstallCommand(
  distroId: string,
  hasDnf: boolean = false,
): {
  packageManager: string;
  installCommand: string;
} | null {
  switch (distroId) {
    case 'ubuntu':
    case 'debian':
    case 'linuxmint':
    case 'pop':
      return {
        packageManager: 'apt-get',
        installCommand: 'apt-get update && apt-get install -y git',
      };

    case 'fedora':
    case 'rhel':
    case 'centos':
    case 'rocky':
    case 'almalinux':
      if (hasDnf) {
        return {
          packageManager: 'dnf',
          installCommand: 'dnf install -y git',
        };
      } else {
        return {
          packageManager: 'yum',
          installCommand: 'yum install -y git',
        };
      }

    case 'opensuse':
    case 'suse':
      return {
        packageManager: 'zypper',
        installCommand: 'zypper install -y git',
      };

    case 'arch':
    case 'manjaro':
      return {
        packageManager: 'pacman',
        installCommand: 'pacman -S --noconfirm git',
      };

    case 'alpine':
      return {
        packageManager: 'apk',
        installCommand: 'apk add git',
      };

    default:
      return null;
  }
}

// ---------- Windows portable git path ----------
// Mirrors the path construction in installGitWindows()
function getWindowsPortableGitPath(resourcesPath: string): string {
  const path = require('node:path');
  return path.join(resourcesPath, 'git', 'bin', 'git.exe');
}

// ---------- permission error detection ----------
// Mirrors the error check in installGitLinux() catch block
function isPermissionError(errorMessage: string): boolean {
  return errorMessage.includes('sudo') || errorMessage.includes('permission');
}

// ---------- sendProgress callback ----------
// Mirrors the progress callback pattern
class ProgressTracker {
  private callback: ((msg: string) => void) | null = null;
  messages: string[] = [];

  setProgressCallback(cb: (msg: string) => void): void {
    this.callback = cb;
  }

  sendProgress(message: string): void {
    this.messages.push(message);
    if (this.callback) {
      this.callback(message);
    }
  }
}

// ==================== Tests ====================

describe('GitAutoInstaller — pure logic', () => {
  describe('parseOsRelease()', () => {
    it('parses Ubuntu os-release', () => {
      const content = [
        'NAME="Ubuntu"',
        'VERSION="22.04.3 LTS (Jammy Jellyfish)"',
        'ID=ubuntu',
        'ID_LIKE=debian',
        'PRETTY_NAME="Ubuntu 22.04.3 LTS"',
      ].join('\n');
      const result = parseOsRelease(content);
      expect(result.name).toBe('Ubuntu');
      expect(result.id).toBe('ubuntu');
      expect(result.id_like).toBe('debian');
    });

    it('parses Fedora os-release', () => {
      const content = ['NAME="Fedora Linux"', 'ID=fedora', 'VERSION_ID=39'].join('\n');
      const result = parseOsRelease(content);
      expect(result.id).toBe('fedora');
      expect(result.version_id).toBe('39');
    });

    it('parses Arch Linux os-release', () => {
      const content = 'NAME="Arch Linux"\nID=arch';
      const result = parseOsRelease(content);
      expect(result.id).toBe('arch');
    });

    it('strips quotes from values', () => {
      const content = 'NAME="Quoted Value"';
      const result = parseOsRelease(content);
      expect(result.name).toBe('Quoted Value');
    });

    it('handles lowercase keys', () => {
      const content = 'ID=alpine\nVERSION_ID=3.18';
      const result = parseOsRelease(content);
      expect(result.id).toBe('alpine');
      expect(result.version_id).toBe('3.18');
    });

    it('handles empty content', () => {
      const result = parseOsRelease('');
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('ignores lines without key=value format', () => {
      const content = 'ID=ubuntu\nsome random line\nNAME=test';
      const result = parseOsRelease(content);
      expect(result.id).toBe('ubuntu');
      expect(result.name).toBe('test');
    });

    it('parses openSUSE os-release', () => {
      const content = 'NAME="openSUSE Leap"\nID="opensuse-leap"\nID_LIKE="suse opensuse"';
      const result = parseOsRelease(content);
      expect(result.id).toBe('opensuse-leap');
    });
  });

  describe('getGitCheckCommand()', () => {
    it('uses "where" on Windows', () => {
      expect(getGitCheckCommand('win32')).toBe('where git');
    });

    it('uses "which" on macOS', () => {
      expect(getGitCheckCommand('darwin')).toBe('which git');
    });

    it('uses "which" on Linux', () => {
      expect(getGitCheckCommand('linux')).toBe('which git');
    });
  });

  describe('extractGitPath()', () => {
    it('extracts first line from single-line output', () => {
      expect(extractGitPath('/usr/bin/git')).toBe('/usr/bin/git');
    });

    it('extracts first line from multi-line output (Windows "where")', () => {
      expect(extractGitPath('C:\\Program Files\\Git\\cmd\\git.exe\nC:\\Git\\bin\\git.exe')).toBe(
        'C:\\Program Files\\Git\\cmd\\git.exe',
      );
    });

    it('trims whitespace', () => {
      expect(extractGitPath('  /usr/bin/git  \n')).toBe('/usr/bin/git');
    });
  });

  describe('getLinuxInstallCommand()', () => {
    it('uses apt-get for Ubuntu', () => {
      const result = getLinuxInstallCommand('ubuntu');
      expect(result!.packageManager).toBe('apt-get');
      expect(result!.installCommand).toContain('apt-get');
    });

    it('uses apt-get for Debian', () => {
      const result = getLinuxInstallCommand('debian');
      expect(result!.packageManager).toBe('apt-get');
    });

    it('uses apt-get for Linux Mint', () => {
      const result = getLinuxInstallCommand('linuxmint');
      expect(result!.packageManager).toBe('apt-get');
    });

    it('uses apt-get for Pop!_OS', () => {
      const result = getLinuxInstallCommand('pop');
      expect(result!.packageManager).toBe('apt-get');
    });

    it('uses dnf for Fedora when dnf is available', () => {
      const result = getLinuxInstallCommand('fedora', true);
      expect(result!.packageManager).toBe('dnf');
      expect(result!.installCommand).toContain('dnf install');
    });

    it('falls back to yum for Fedora when dnf is not available', () => {
      const result = getLinuxInstallCommand('fedora', false);
      expect(result!.packageManager).toBe('yum');
    });

    it('uses dnf/yum for RHEL', () => {
      expect(getLinuxInstallCommand('rhel', true)!.packageManager).toBe('dnf');
      expect(getLinuxInstallCommand('rhel', false)!.packageManager).toBe('yum');
    });

    it('uses dnf/yum for CentOS', () => {
      expect(getLinuxInstallCommand('centos', true)!.packageManager).toBe('dnf');
    });

    it('uses dnf/yum for Rocky Linux', () => {
      expect(getLinuxInstallCommand('rocky', true)!.packageManager).toBe('dnf');
    });

    it('uses dnf/yum for AlmaLinux', () => {
      expect(getLinuxInstallCommand('almalinux', false)!.packageManager).toBe('yum');
    });

    it('uses zypper for openSUSE', () => {
      const result = getLinuxInstallCommand('opensuse');
      expect(result!.packageManager).toBe('zypper');
      expect(result!.installCommand).toContain('zypper install');
    });

    it('uses zypper for SUSE', () => {
      const result = getLinuxInstallCommand('suse');
      expect(result!.packageManager).toBe('zypper');
    });

    it('uses pacman for Arch', () => {
      const result = getLinuxInstallCommand('arch');
      expect(result!.packageManager).toBe('pacman');
      expect(result!.installCommand).toContain('pacman -S');
    });

    it('uses pacman for Manjaro', () => {
      const result = getLinuxInstallCommand('manjaro');
      expect(result!.packageManager).toBe('pacman');
    });

    it('uses apk for Alpine', () => {
      const result = getLinuxInstallCommand('alpine');
      expect(result!.packageManager).toBe('apk');
      expect(result!.installCommand).toBe('apk add git');
    });

    it('returns null for unsupported distros', () => {
      expect(getLinuxInstallCommand('unknown')).toBeNull();
      expect(getLinuxInstallCommand('gentoo')).toBeNull();
    });
  });

  describe('getWindowsPortableGitPath()', () => {
    it('constructs path under resources', () => {
      const result = getWindowsPortableGitPath('/app/resources');
      expect(result).toMatch(/resources.*git.*bin.*git\.exe/);
    });
  });

  describe('isPermissionError()', () => {
    it('detects sudo-related errors', () => {
      expect(isPermissionError('sudo: command not found')).toBe(true);
    });

    it('detects permission-related errors', () => {
      expect(isPermissionError('permission denied')).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(isPermissionError('command not found')).toBe(false);
      expect(isPermissionError('network error')).toBe(false);
    });
  });

  describe('ProgressTracker (sendProgress pattern)', () => {
    let tracker: ProgressTracker;

    beforeEach(() => {
      tracker = new ProgressTracker();
    });

    it('records messages internally', () => {
      tracker.sendProgress('Step 1');
      tracker.sendProgress('Step 2');
      expect(tracker.messages).toEqual(['Step 1', 'Step 2']);
    });

    it('calls callback when set', () => {
      const cb = vi.fn();
      tracker.setProgressCallback(cb);
      tracker.sendProgress('Hello');
      expect(cb).toHaveBeenCalledWith('Hello');
    });

    it('does not throw when callback is not set', () => {
      expect(() => tracker.sendProgress('No callback')).not.toThrow();
    });

    it('uses the latest callback', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      tracker.setProgressCallback(cb1);
      tracker.sendProgress('First');
      tracker.setProgressCallback(cb2);
      tracker.sendProgress('Second');
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledWith('Second');
    });
  });
});

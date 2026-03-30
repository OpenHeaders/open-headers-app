import { exec } from 'node:child_process';
import electron from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import mainLogger from '../../utils/mainLogger';

const { app } = electron;
const { createLogger } = mainLogger;

const execAsync = promisify(exec);

// Utility to execute commands
const runCommand = (command: string, options: { timeout?: number; env?: NodeJS.ProcessEnv; cwd?: string } = {}) => {
  return execAsync(command, { ...options, encoding: 'utf8' });
};

// Type definitions
interface InstallResult {
  success: boolean;
  error?: string;
}

interface GitCheckResult {
  installed: boolean;
  path: string | null;
}

interface DistroInfo {
  id?: string;
  [key: string]: string | undefined;
}

type ProgressCallback = (message: string) => void;

class GitAutoInstaller {
  private log: ReturnType<typeof createLogger>;
  private progressCallback: ProgressCallback | null;

  constructor() {
    this.log = createLogger('GitAutoInstaller');
    this.progressCallback = null;
  }

  setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  sendProgress(message: string): void {
    this.log.info(message);
    if (this.progressCallback) {
      this.progressCallback(message);
    }
  }

  async isGitInstalled(): Promise<GitCheckResult> {
    try {
      const command = process.platform === 'win32' ? 'where git' : 'which git';
      const { stdout } = await runCommand(command);
      return { installed: true, path: stdout.trim().split('\n')[0] };
    } catch (error) {
      return { installed: false, path: null };
    }
  }

  async installGitWindows(): Promise<InstallResult> {
    this.sendProgress('Checking for bundled Git on Windows...');

    // In production, portable Git should be bundled
    if (app.isPackaged) {
      const portableGitPath = path.join(process.resourcesPath, 'git', 'bin', 'git.exe');
      try {
        await fs.promises.access(portableGitPath, fs.constants.X_OK);
        this.sendProgress('Portable Git is bundled with the application');
        return { success: true };
      } catch (error) {
        this.log.error('Portable Git not found in production build');
        return {
          success: false,
          error: 'Portable Git not found. Please reinstall the application.',
        };
      }
    }

    // In development, check if portable Git was downloaded for testing
    const devPortableGitPath = path.join(__dirname, '..', '..', 'build', 'portable', 'PortableGit', 'bin', 'git.exe');
    try {
      await fs.promises.access(devPortableGitPath, fs.constants.X_OK);
      this.sendProgress('Using development portable Git');
      return { success: true };
    } catch (error) {
      // In development, portable Git might not be downloaded
      this.log.error('Portable Git not found in development. Run: npm run download-portable-git');
      return {
        success: false,
        error: 'Portable Git not found. Run: npm run download-portable-git',
      };
    }
  }

  async installGitMac(): Promise<InstallResult> {
    this.sendProgress('Installing Git on macOS...');

    try {
      // First check if Homebrew is installed
      let hasHomebrew = false;
      try {
        await runCommand('which brew');
        hasHomebrew = true;
      } catch (e) {
        // Homebrew not found
      }

      if (hasHomebrew) {
        // Install Git via Homebrew
        this.sendProgress('Installing Git via Homebrew...');
        await runCommand('brew install git', { timeout: 300000 });
      } else {
        // Install Xcode Command Line Tools (includes Git)
        this.sendProgress('Installing Xcode Command Line Tools (includes Git)...');
        this.sendProgress('This may take several minutes and may show a system dialog...');

        // Touch the file that triggers the installer
        await runCommand('touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress');

        // Find the Command Line Tools package
        const { stdout } = await runCommand(
          "softwareupdate -l | grep \"\\*.*Command Line\" | tail -n 1 | awk -F\"*\" '{print $2}' | sed -e 's/^ *//' | tr -d '\\n'",
        );

        if (stdout) {
          // Install the package
          this.sendProgress('Installing Command Line Tools package...');
          await runCommand(`softwareupdate -i "${stdout}"`, { timeout: 600000 }); // 10 minute timeout
        } else {
          // Fallback to manual trigger
          await runCommand('xcode-select --install', { timeout: 600000 });
        }

        // Clean up
        await runCommand('rm -f /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress');
      }

      this.sendProgress('Git installed successfully on macOS');
      return { success: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to install Git on macOS:', error);
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  async installGitLinux(): Promise<InstallResult> {
    this.sendProgress('Installing Git on Linux...');

    // Declare installCommand at function scope so it's accessible in catch block
    let installCommand: string | undefined;

    try {
      // Detect distribution
      this.sendProgress('Detecting Linux distribution...');
      const distro = await this.detectLinuxDistro();

      // Determine the install command based on distro
      let packageManager: string;

      switch (distro.id) {
        case 'ubuntu':
        case 'debian':
        case 'linuxmint':
        case 'pop':
          packageManager = 'apt-get';
          installCommand = 'apt-get update && apt-get install -y git';
          break;

        case 'fedora':
        case 'rhel':
        case 'centos':
        case 'rocky':
        case 'almalinux':
          if (await this.commandExists('dnf')) {
            packageManager = 'dnf';
            installCommand = 'dnf install -y git';
          } else {
            packageManager = 'yum';
            installCommand = 'yum install -y git';
          }
          break;

        case 'opensuse':
        case 'suse':
          packageManager = 'zypper';
          installCommand = 'zypper install -y git';
          break;

        case 'arch':
        case 'manjaro':
          packageManager = 'pacman';
          installCommand = 'pacman -S --noconfirm git';
          break;

        case 'alpine':
          packageManager = 'apk';
          installCommand = 'apk add git';
          break;

        default:
          return {
            success: false,
            error: `Unsupported Linux distribution: ${distro.id}`,
          };
      }

      this.sendProgress(`Installing Git via ${packageManager}...`);
      this.sendProgress('You may be prompted for your administrator password...');

      // Try to use pkexec for GUI sudo prompt
      const usePkexec = await this.commandExists('pkexec');

      if (usePkexec) {
        // Create a temporary script to run with pkexec
        let scriptPath: string;
        try {
          scriptPath = path.join(app.getPath('temp'), 'install-git.sh');
        } catch {
          scriptPath = path.join('/tmp', 'install-git.sh');
        }
        const scriptContent = `#!/bin/bash\n${installCommand}`;
        await fs.promises.writeFile(scriptPath, scriptContent, { mode: 0o755 });

        try {
          await runCommand(`pkexec bash ${scriptPath}`, { timeout: 300000 });
        } finally {
          // Clean up script
          try {
            await fs.promises.unlink(scriptPath);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      } else {
        // Fallback to sudo (will fail if not in terminal)
        await runCommand(`sudo sh -c "${installCommand}"`, { timeout: 300000 });
      }

      this.sendProgress('Git installed successfully on Linux');
      return { success: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to install Git on Linux:', error);

      // If it failed due to permissions, provide helpful message
      if (errMsg.includes('sudo') || errMsg.includes('permission')) {
        return {
          success: false,
          error: 'Git installation requires administrator privileges. Please run: sudo ' + installCommand,
        };
      }

      return {
        success: false,
        error: errMsg,
      };
    }
  }

  async detectLinuxDistro(): Promise<DistroInfo> {
    try {
      const { stdout } = await runCommand('cat /etc/os-release');
      const lines = stdout.split('\n');
      const distroInfo: DistroInfo = {};

      lines.forEach((line) => {
        const [key, value] = line.split('=');
        if (key && value) {
          distroInfo[key.toLowerCase()] = value.replace(/"/g, '');
        }
      });

      return distroInfo;
    } catch (error) {
      // Fallback detection
      try {
        if (await this.fileExists('/etc/debian_version')) return { id: 'debian' };
        if (await this.fileExists('/etc/redhat-release')) return { id: 'rhel' };
        if (await this.fileExists('/etc/arch-release')) return { id: 'arch' };
        if (await this.fileExists('/etc/alpine-release')) return { id: 'alpine' };
      } catch (e) {
        // Ignore
      }

      return { id: 'unknown' };
    }
  }

  async commandExists(command: string): Promise<boolean> {
    try {
      await runCommand(`which ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async autoInstallGit(): Promise<boolean> {
    // Check if Git is already installed
    const { installed } = await this.isGitInstalled();
    if (installed) {
      this.log.info('Git is already installed');
      return true;
    }

    this.log.info('Git not found, attempting automatic installation...');

    let result: InstallResult;

    switch (process.platform) {
      case 'win32':
        result = await this.installGitWindows();
        break;

      case 'darwin':
        result = await this.installGitMac();
        break;

      case 'linux':
        result = await this.installGitLinux();
        break;

      default:
        result = {
          success: false,
          error: `Unsupported platform: ${process.platform}`,
        };
    }

    // Handle the result
    if (result.success) {
      return true;
    } else {
      this.log.error('Automatic Git installation failed:', result.error);

      // Check one more time in case it was partially installed
      const { installed: nowInstalled } = await this.isGitInstalled();
      if (nowInstalled) {
        this.log.info('Git appears to be installed despite errors');
        return true;
      }

      return false;
    }
  }

  async ensureGitInstalled(): Promise<boolean> {
    const { installed } = await this.isGitInstalled();
    if (installed) {
      return true;
    }

    this.log.info('Git is required but not installed. Installing automatically...');

    try {
      const success = await this.autoInstallGit();

      if (success) {
        // Verify installation
        const { installed: verified } = await this.isGitInstalled();
        if (verified) {
          this.log.info('Git installation verified successfully');
          return true;
        }
      }

      this.log.error('Git installation could not be verified');
      return false;
    } catch (error) {
      this.log.error('Failed to ensure Git installation:', error);
      return false;
    }
  }
}

export { type DistroInfo, GitAutoInstaller, type GitCheckResult, type InstallResult };
export default GitAutoInstaller;

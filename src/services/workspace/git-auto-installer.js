const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');

const execAsync = promisify(exec);

// Utility to execute commands with proper type handling
const runCommand = (command, options = {}) => {
  // Type assertion to handle IDE false positive about execAsync signature
  const exec = /** @type {function(string, object): Promise<{stdout: string, stderr: string}>} */ (execAsync);
  return exec(command, options);
};

class GitAutoInstaller {
  constructor() {
    this.log = require('../../utils/mainLogger').createLogger('GitAutoInstaller');
    this.progressCallback = null;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  sendProgress(message) {
    this.log.info(message);
    if (this.progressCallback) {
      this.progressCallback(message);
    }
  }

  async isGitInstalled() {
    try {
      const command = process.platform === 'win32' ? 'where git' : 'which git';
      const { stdout } = await runCommand(command);
      return { installed: true, path: stdout.trim().split('\n')[0] };
    } catch (error) {
      return { installed: false, path: null };
    }
  }


  async installGitWindows() {
    this.sendProgress('Checking for bundled Git on Windows...');
    
    // In production, portable Git should be bundled
    if (app.isPackaged) {
      const portableGitPath = path.join(process.resourcesPath, 'git', 'bin', 'git.exe');
      try {
        await fs.access(portableGitPath, fs.constants.X_OK);
        this.sendProgress('Portable Git is bundled with the application');
        return { success: true };
      } catch (error) {
        this.log.error('Portable Git not found in production build');
        return { 
          success: false, 
          error: 'Portable Git not found. Please reinstall the application.' 
        };
      }
    }
    
    // In development, check if portable Git was downloaded for testing
    const devPortableGitPath = path.join(__dirname, '..', '..', 'build', 'portable', 'PortableGit', 'bin', 'git.exe');
    try {
      await fs.access(devPortableGitPath, fs.constants.X_OK);
      this.sendProgress('Using development portable Git');
      return { success: true };
    } catch (error) {
      // In development, portable Git might not be downloaded
      this.log.error('Portable Git not found in development. Run: npm run download-portable-git');
      return { 
        success: false, 
        error: 'Portable Git not found. Run: npm run download-portable-git' 
      };
    }
  }

  async installGitMac() {
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
        const { stdout } = await runCommand('softwareupdate -l | grep "\\*.*Command Line" | tail -n 1 | awk -F"*" \'{print $2}\' | sed -e \'s/^ *//\' | tr -d \'\\n\'');
        
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
    } catch (error) {
      this.log.error('Failed to install Git on macOS:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async installGitLinux() {
    this.sendProgress('Installing Git on Linux...');
    
    // Declare installCommand at function scope so it's accessible in catch block
    let installCommand;
    
    try {
      // Detect distribution
      this.sendProgress('Detecting Linux distribution...');
      const distro = await this.detectLinuxDistro();
      
      // Determine the install command based on distro
      let packageManager;
      
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
            error: `Unsupported Linux distribution: ${distro.id}`
          };
      }
      
      this.sendProgress(`Installing Git via ${packageManager}...`);
      this.sendProgress('You may be prompted for your administrator password...');
      
      // Try to use pkexec for GUI sudo prompt
      const usePkexec = await this.commandExists('pkexec');
      
      if (usePkexec) {
        // Create a temporary script to run with pkexec
        const scriptPath = path.join(app.getPath('temp'), 'install-git.sh');
        const scriptContent = `#!/bin/bash\n${installCommand}`;
        await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });
        
        try {
          await runCommand(`pkexec bash ${scriptPath}`, { timeout: 300000 });
        } finally {
          // Clean up script
          try {
            await fs.unlink(scriptPath);
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
    } catch (error) {
      this.log.error('Failed to install Git on Linux:', error);
      
      // If it failed due to permissions, provide helpful message
      if (error.message.includes('sudo') || error.message.includes('permission')) {
        return {
          success: false,
          error: 'Git installation requires administrator privileges. Please run: sudo ' + installCommand
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async detectLinuxDistro() {
    try {
      const { stdout } = await runCommand('cat /etc/os-release');
      const lines = stdout.split('\n');
      const distroInfo = {};
      
      lines.forEach(line => {
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

  async commandExists(command) {
    try {
      await runCommand(`which ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async autoInstallGit() {
    // Check if Git is already installed
    const { installed } = await this.isGitInstalled();
    if (installed) {
      this.log.info('Git is already installed');
      return true;
    }

    this.log.info('Git not found, attempting automatic installation...');
    
    let result;
    
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
          error: `Unsupported platform: ${process.platform}`
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

  async ensureGitInstalled() {
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

module.exports = GitAutoInstaller;
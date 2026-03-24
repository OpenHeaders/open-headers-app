const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORTABLE_GIT = {
  windows: {
    url: 'https://github.com/git-for-windows/git/releases/download/v2.53.0.windows.2/PortableGit-2.53.0.2-64-bit.7z.exe',
    filename: 'PortableGit-2.53.0.2-64-bit.7z.exe',
    extractedName: 'PortableGit'
  }
};

function downloadAndExtractPortableGit() {
  console.log(`Running on ${process.platform}, downloading Portable Git for Windows builds...`);

  const gitInfo = PORTABLE_GIT.windows;
  const downloadDir = path.join(__dirname, 'portable');
  const downloadPath = path.join(downloadDir, gitInfo.filename);
  const extractPath = path.join(downloadDir, gitInfo.extractedName);

  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  // Check if already extracted
  if (fs.existsSync(extractPath)) {
    console.log('Portable Git already extracted at:', extractPath);
    return;
  }

  // Download using curl (handles redirects properly)
  console.log('Downloading Portable Git...');
  console.log(`URL: ${gitInfo.url}`);
  execSync(`curl -L -o "${downloadPath}" "${gitInfo.url}"`, {
    stdio: 'inherit',
    timeout: 5 * 60 * 1000
  });

  // Verify download
  const stats = fs.statSync(downloadPath);
  if (stats.size === 0) {
    fs.unlinkSync(downloadPath);
    throw new Error('Download failed: file is 0 bytes');
  }
  console.log(`Downloaded ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

  // Extract
  if (process.platform === 'win32') {
    console.log('Extracting with self-extractor...');
    execSync(`"${downloadPath}" -y -o"${extractPath}"`, {
      stdio: 'inherit',
      maxBuffer: 1024 * 1024 * 10
    });
  } else {
    // On macOS/Linux, use 7z to extract
    try {
      execSync('which 7z', { stdio: 'ignore' });
    } catch {
      console.error('7z not found. Install with:');
      console.error('  macOS: brew install p7zip');
      console.error('  Ubuntu/Debian: sudo apt-get install p7zip-full');
      throw new Error('7z not found');
    }

    console.log('Extracting with 7z...');
    const parentDir = path.dirname(extractPath);

    // The .7z.exe is a self-extracting archive. On macOS, 7z extracts it in one step
    // but we need to check if contents land in parentDir or a subdirectory.
    execSync(`7z x "${downloadPath}" -o"${parentDir}" -y`, {
      stdio: 'inherit',
      maxBuffer: 1024 * 1024 * 50
    });

    // If files extracted directly to parentDir instead of a PortableGit subdirectory
    if (fs.existsSync(path.join(parentDir, 'bin', 'git.exe')) && !fs.existsSync(extractPath)) {
      console.log('Moving extracted files to PortableGit directory...');
      fs.mkdirSync(extractPath, { recursive: true });

      const itemsToMove = ['bin', 'cmd', 'dev', 'etc', 'mingw64', 'tmp', 'usr',
        'git-bash.exe', 'git-cmd.exe', 'LICENSE.txt',
        'README.portable', 'post-install.bat'];

      for (const item of itemsToMove) {
        const src = path.join(parentDir, item);
        const dest = path.join(extractPath, item);
        if (fs.existsSync(src)) {
          fs.renameSync(src, dest);
        }
      }
    }

    // Verify file contents are not empty (previous 7z versions produced 0-byte files)
    const gitExePath = path.join(extractPath, 'bin', 'git.exe');
    if (fs.existsSync(gitExePath) && fs.statSync(gitExePath).size === 0) {
      console.error('ERROR: Extracted files are 0 bytes. Your 7z may not handle .7z.exe self-extractors correctly.');
      console.error('Try updating 7z: brew upgrade p7zip');
      console.error('Or download MinGit .zip instead of PortableGit .7z.exe');
      fs.rmSync(extractPath, { recursive: true, force: true });
      throw new Error('Extraction produced empty files');
    }
  }

  // Verify extraction
  if (!fs.existsSync(path.join(extractPath, 'bin', 'git.exe'))) {
    throw new Error('Git executable not found after extraction');
  }

  // Clean up archive
  try {
    fs.unlinkSync(downloadPath);
  } catch (e) {
    console.warn('Could not delete archive:', e.message);
  }

  console.log('Portable Git extracted successfully to:', extractPath);
}

if (require.main === module) {
  downloadAndExtractPortableGit();
}

module.exports = { downloadAndExtractPortableGit };

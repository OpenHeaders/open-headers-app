const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { exec } = require('child_process');

const streamPipeline = promisify(pipeline);

const PORTABLE_GIT = {
  windows: {
    url: 'https://github.com/git-for-windows/git/releases/download/v2.50.1.windows.1/PortableGit-2.50.1-64-bit.7z.exe',
    filename: 'PortableGit-2.50.1-64-bit.7z.exe',
    extractedName: 'PortableGit'
  }
};

async function downloadAndExtractPortableGit() {
  // Allow downloading on any platform for cross-platform builds
  console.log(`Running on ${process.platform}, downloading Portable Git for Windows builds...`);

  const gitInfo = PORTABLE_GIT.windows;
  const downloadDir = path.join(__dirname, 'portable');
  const downloadPath = path.join(downloadDir, gitInfo.filename);
  const extractPath = path.join(downloadDir, gitInfo.extractedName);

  // Create directory
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  // Check if already extracted
  if (fs.existsSync(extractPath)) {
    console.log('Portable Git already extracted at:', extractPath);
    return;
  }

  console.log('Downloading Portable Git...');
  
  // Download
  const file = fs.createWriteStream(downloadPath);
  
  return new Promise((resolve, reject) => {
    https.get(gitInfo.url, { 
      headers: { 'User-Agent': 'OpenHeaders' }
    }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        https.get(response.headers.location, {
          headers: { 'User-Agent': 'OpenHeaders' }
        }, (redirectResponse) => {
          streamPipeline(redirectResponse, file)
            .then(async () => {
              console.log('Download complete. Extracting...');
              
              // PortableGit is a self-extracting archive
              const { exec } = require('child_process');
              
              // Create extract directory first
              if (!fs.existsSync(path.dirname(extractPath))) {
                fs.mkdirSync(path.dirname(extractPath), { recursive: true });
              }
              
              // Extract based on platform
              if (process.platform === 'win32') {
                // On Windows, use the self-extracting exe
                // The 7z.exe self-extractor uses different parameters
                const extractCmd = `"${downloadPath}" -y -o"${extractPath}"`;
                console.log('Extracting with command:', extractCmd);
                
                exec(extractCmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                  if (error && !fs.existsSync(path.join(extractPath, 'bin', 'git.exe'))) {
                    console.error('Extraction error:', error);
                    console.error('stderr:', stderr);
                    reject(error);
                    return;
                  }
                  
                  // Verify extraction
                  if (!fs.existsSync(path.join(extractPath, 'bin', 'git.exe'))) {
                    reject(new Error('Git executable not found after extraction'));
                    return;
                  }
                  
                  // Clean up installer
                  try {
                    fs.unlinkSync(downloadPath);
                  } catch (e) {
                    console.warn('Could not delete installer:', e.message);
                  }
                  
                  console.log('Portable Git extracted successfully to:', extractPath);
                  console.log('Git executable at:', path.join(extractPath, 'bin', 'git.exe'));
                  resolve();
                });
              } else {
                // On Mac/Linux, we need 7z to extract
                console.log('Note: On macOS/Linux, you need 7z installed to extract the portable Git archive.');
                console.log('Install with: brew install p7zip (macOS) or apt-get install p7zip-full (Linux)');
                console.log('');
                console.log('Trying to extract with 7z...');
                
                // Try using 7z command
                exec('which 7z', (whichError) => {
                  if (whichError) {
                    console.error('7z not found. Please install it first.');
                    console.error('macOS: brew install p7zip');
                    console.error('Ubuntu/Debian: sudo apt-get install p7zip-full');
                    console.error('');
                    console.error('Alternatively, you can:');
                    console.error('1. Download and extract on a Windows machine');
                    console.error('2. Copy the extracted PortableGit folder here');
                    reject(new Error('7z not found'));
                    return;
                  }
                  
                  // First extract to the parent directory
                  const extractCmd = `7z x "${downloadPath}" -o"${path.dirname(extractPath)}" -y`;
                  console.log('Extracting with 7z...');
                  
                  exec(extractCmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                    if (error) {
                      console.error('Extraction error:', error);
                      reject(error);
                      return;
                    }
                    
                    // Check if files were extracted directly to the parent directory
                    // (this happens with the PortableGit 7z.exe on macOS/Linux)
                    const parentDir = path.dirname(extractPath);
                    const gitBinPath = path.join(parentDir, 'bin', 'git.exe');
                    
                    if (fs.existsSync(gitBinPath)) {
                      // Files were extracted directly, need to move them to PortableGit subdirectory
                      console.log('Moving extracted files to PortableGit directory...');
                      
                      // Create PortableGit directory
                      if (!fs.existsSync(extractPath)) {
                        fs.mkdirSync(extractPath, { recursive: true });
                      }
                      
                      // Move all extracted items to PortableGit directory
                      const itemsToMove = ['bin', 'cmd', 'dev', 'etc', 'mingw64', 'tmp', 'usr', 
                                          'git-bash.exe', 'git-cmd.exe', 'LICENSE.txt', 
                                          'README.portable', 'post-install.bat'];
                      
                      for (const item of itemsToMove) {
                        const sourcePath = path.join(parentDir, item);
                        const destPath = path.join(extractPath, item);
                        if (fs.existsSync(sourcePath)) {
                          fs.renameSync(sourcePath, destPath);
                        }
                      }
                    }
                    
                    // Verify extraction was successful
                    if (!fs.existsSync(path.join(extractPath, 'bin', 'git.exe'))) {
                      reject(new Error('Git executable not found after extraction'));
                      return;
                    }
                    
                    // Clean up installer
                    try {
                      fs.unlinkSync(downloadPath);
                    } catch (e) {
                      console.warn('Could not delete installer:', e.message);
                    }
                    
                    console.log('Portable Git extracted successfully to:', extractPath);
                    resolve();
                  });
                });
              }
            })
            .catch(reject);
        });
      } else {
        reject(new Error(`Failed to download: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

// Run if called directly
if (require.main === module) {
  downloadAndExtractPortableGit().catch(console.error);
}

module.exports = { downloadAndExtractPortableGit };
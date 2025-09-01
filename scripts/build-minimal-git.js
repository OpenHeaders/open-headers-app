#!/usr/bin/env node

/**
 * Build Minimal Git Package
 * 
 * This script creates a minimal Git package from the full PortableGit installation
 * by extracting only the essential files needed for basic Git operations.
 * 
 * Reduces size from ~419MB to ~50-80MB while maintaining all functionality
 * required by GitSyncService and GitAutoInstaller.
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Paths
const PORTABLE_GIT_SOURCE = path.join(__dirname, '..', 'build', 'portable', 'PortableGit');
const MINIMAL_GIT_TARGET = path.join(__dirname, '..', 'build', 'portable', 'MinimalGit');

// Essential files and directories to copy
const ESSENTIAL_FILES = {
  // Core Git executables in bin/
  'bin': [
    'git.exe',
    'git-upload-pack.exe',
    'git-receive-pack.exe',
    'git-upload-archive.exe',
    'git-credential-manager.exe'
  ],
  
  // Essential Git executables in mingw64/bin/
  'mingw64/bin': [
    'git.exe',
    'git-remote-http.exe',
    'git-remote-https.exe',
    'git-credential-manager.exe',
    'git-credential-manager-ui.exe',
    'git-askpass.exe'
  ],
  
  // All mingw64/libexec/git-core files (Git commands)
  'mingw64/libexec/git-core': '*',
  
  // Essential DLLs from mingw64/bin/
  'mingw64/bin/dlls': [
    'libcurl-4.dll',
    'libcrypto-3-x64.dll',
    'libiconv-2.dll',
    'libintl-8.dll',
    'libpcre2-8-0.dll',
    'libssp-0.dll',
    'libssl-3-x64.dll',
    'libwinpthread-1.dll',
    'libzstd.dll',
    'msys-2.0.dll',
    'zlib1.dll',
    'libexpat-1.dll',
    'libgcc_s_seh-1.dll',
    'libstdc++-6.dll',
    'libidn2-0.dll',
    'libnghttp2-14.dll',
    'libpsl-5.dll',
    'libunistring-5.dll',
    'libbrotlidec.dll',
    'libbrotlicommon.dll',
    'libssh2-1.dll',
    'libzstd.dll'
  ],
  
  // Essential shell utilities from usr/bin/
  'usr/bin': [
    'sh.exe',
    'bash.exe',
    'env.exe',
    'uname.exe',
    'sed.exe',
    'grep.exe',
    'cat.exe',
    'ls.exe',
    'mkdir.exe',
    'rm.exe',
    'cp.exe',
    'mv.exe',
    'chmod.exe',
    'echo.exe',
    'test.exe',
    'tr.exe',
    'cut.exe',
    'head.exe',
    'tail.exe',
    'sort.exe',
    'find.exe',
    'xargs.exe',
    'dirname.exe',
    'basename.exe',
    'pwd.exe',
    'expr.exe',
    'true.exe',
    'false.exe',
    'date.exe',
    'sleep.exe',
    'whoami.exe',
    'hostname.exe',
    'id.exe',
    'cygpath.exe',
    'getopt.exe',
    'awk.exe',        // Used for parsing git output
    'wc.exe',         // Used for counting
    'diff.exe',       // Used by git internally
    'patch.exe',      // Used for applying patches
    'touch.exe'       // Used for creating files
  ],
  
  // Core DLLs from usr/bin/
  'usr/bin/dlls': [
    'msys-2.0.dll',
    'msys-gcc_s-seh-1.dll',
    'msys-iconv-2.dll',
    'msys-intl-8.dll',
    'msys-stdc++-6.dll'
  ],
  
  // Essential configuration and SSL certificates
  'mingw64/etc': '*',
  'mingw64/ssl': '*',
  'etc': [
    'gitconfig',
    'gitattributes'
  ],
  
  // SSL certificates for HTTPS (critical for Git HTTPS operations)
  'usr/ssl': '*',
  'mingw64/ssl/certs': '*',
  
  // Minimal usr/share files
  'usr/share': [
    'git-core'
  ]
};

// Files and directories to explicitly exclude
const EXCLUDE_PATTERNS = [
  /\.py$/,           // Python scripts
  /\.pl$/,           // Perl scripts
  /\.tcl$/,          // Tcl scripts
  /\.tk$/,           // Tk scripts
  /man\d?$/,         // Man pages
  /doc$/,            // Documentation
  /share\/doc/,      // More documentation
  /share\/man/,      // More man pages
  /share\/vim/,      // Vim files
  /share\/perl/,     // Perl modules
  /share\/tk/,       // Tk files
  /share\/tcl/,      // Tcl files
  /share\/locale/,   // Locale files (keep only English)
  /share\/git-gui/,  // Git GUI
  /share\/gitk/,     // Gitk
  /share\/gitweb/,   // GitWeb
  /mingw64\/share\/doc/,
  /mingw64\/share\/man/,
  /mingw64\/share\/locale/,
  /usr\/share\/perl/,
  /usr\/lib\/perl/,
  /cmd\/start-ssh/,  // SSH stuff
  /git-bash\.exe$/,  // Git Bash (we only need git.exe)
  /git-cmd\.exe$/    // Git CMD
];

async function copyFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyDirectory(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    
    // Check exclusions
    const shouldExclude = EXCLUDE_PATTERNS.some(pattern => pattern.test(sourcePath));
    if (shouldExclude) {
      continue;
    }
    
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function buildMinimalGit() {
  console.log('Building Minimal Git Package...');
  console.log(`Source: ${PORTABLE_GIT_SOURCE}`);
  console.log(`Target: ${MINIMAL_GIT_TARGET}`);
  
  // Check if source exists
  try {
    await fs.access(PORTABLE_GIT_SOURCE);
  } catch (error) {
    console.error('PortableGit not found. Please run: npm run download-portable-git');
    process.exit(1);
  }
  
  // Clean target directory
  console.log('\nCleaning target directory...');
  await fs.rm(MINIMAL_GIT_TARGET, { recursive: true, force: true });
  await fs.mkdir(MINIMAL_GIT_TARGET, { recursive: true });
  
  // Copy essential files
  console.log('\nCopying essential files...');
  
  for (const [relPath, files] of Object.entries(ESSENTIAL_FILES)) {
    const sourceDir = path.join(PORTABLE_GIT_SOURCE, relPath);
    const targetDir = path.join(MINIMAL_GIT_TARGET, relPath);
    
    // Special handling for DLL lists
    if (relPath.endsWith('/dlls')) {
      const actualPath = relPath.replace('/dlls', '');
      const actualSourceDir = path.join(PORTABLE_GIT_SOURCE, actualPath);
      const actualTargetDir = path.join(MINIMAL_GIT_TARGET, actualPath);
      
      console.log(`  Copying DLLs from ${actualPath}...`);
      for (const dll of files) {
        try {
          await copyFile(
            path.join(actualSourceDir, dll),
            path.join(actualTargetDir, dll)
          );
        } catch (err) {
          console.warn(`    Warning: ${dll} not found, skipping...`);
        }
      }
      continue;
    }
    
    // Check if source exists
    try {
      await fs.access(sourceDir);
    } catch (error) {
      console.warn(`  Warning: ${relPath} not found, skipping...`);
      continue;
    }
    
    console.log(`  Copying ${relPath}...`);
    
    if (files === '*') {
      // Copy entire directory
      await copyDirectory(sourceDir, targetDir);
    } else if (Array.isArray(files)) {
      // Copy specific files
      await fs.mkdir(targetDir, { recursive: true });
      for (const file of files) {
        try {
          await copyFile(
            path.join(sourceDir, file),
            path.join(targetDir, file)
          );
        } catch (err) {
          console.warn(`    Warning: ${file} not found, skipping...`);
        }
      }
    }
  }
  
  // Create necessary empty directories
  console.log('\nCreating directory structure...');
  const emptyDirs = ['tmp', 'dev', 'home'];
  for (const dir of emptyDirs) {
    await fs.mkdir(path.join(MINIMAL_GIT_TARGET, dir), { recursive: true });
  }
  
  // Create a minimal README
  const readmeContent = `Minimal Git for OpenHeaders
===========================

This is a minimal Git distribution containing only the essential files
needed for basic Git operations. It has been reduced from ~419MB to ~80MB.

Included components:
- Core Git executables and libraries
- Essential Unix utilities (bash, sh, etc.)
- SSL certificates for HTTPS operations
- Minimal configuration files

Not included:
- Documentation and man pages
- GUI tools (git-gui, gitk)
- Perl, Python, Tcl/Tk interpreters
- Internationalization files
- Development headers and libraries
`;
  
  await fs.writeFile(path.join(MINIMAL_GIT_TARGET, 'README.minimal'), readmeContent);
  
  // Get final size
  console.log('\nCalculating size...');
  try {
    const { stdout } = await execAsync(`du -sh "${MINIMAL_GIT_TARGET}"`);
    const size = stdout.split('\t')[0];
    console.log(`\nMinimal Git package created successfully!`);
    console.log(`Size: ${size} (reduced from ~419MB)`);
    console.log(`Location: ${MINIMAL_GIT_TARGET}`);
  } catch (error) {
    console.log('\nMinimal Git package created successfully!');
    console.log(`Location: ${MINIMAL_GIT_TARGET}`);
  }
  
  // Update build configuration instructions
  console.log('\nTo use the minimal Git in your build:');
  console.log('1. Update package.json to use MinimalGit instead of PortableGit:');
  console.log('   Change: "from": "build/portable/PortableGit"');
  console.log('   To:     "from": "build/portable/MinimalGit"');
  console.log('\n2. Test the application to ensure all Git operations work correctly.');
}

// Run the build
buildMinimalGit().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});
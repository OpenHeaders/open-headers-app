const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
    const { appOutDir, electronPlatformName } = context;

    // Only apply for Linux builds
    if (electronPlatformName !== 'linux') {
        return;
    }

    console.log('Running afterPack hook for Linux build...');

    // Path to the source file in dist-webpack
    const sourceFile = path.join(process.cwd(), 'dist-webpack', 'install-open-headers.sh');

    // Path where we want to copy the file
    const destDir = path.dirname(appOutDir);
    const destFile = path.join(destDir, 'install-open-headers.sh');

    try {
        if (fs.existsSync(sourceFile)) {
            // Copy the file to the dist directory (alongside the AppImage)
            fs.copyFileSync(sourceFile, destFile);
            // Make it executable
            fs.chmodSync(destFile, 0o755);
            console.log(`Successfully copied ${sourceFile} to ${destFile}`);
        } else {
            console.error(`Source file not found: ${sourceFile}`);
        }
    } catch (error) {
        console.error('Error copying install script:', error);
    }
};
const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
    const { appOutDir, electronPlatformName } = context;

    // Windows builds - verify native module is included
    if (electronPlatformName === 'win32') {
        console.log('Running afterPack hook for Windows build...');
        console.log('App output directory:', appOutDir);
        
        // Debug: Check various possible locations for the module
        const possiblePaths = [
            path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', '@openheaders', 'windows-foreground'),
            path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', '@openheaders'),
            path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules'),
            path.join(process.cwd(), 'node_modules', '@openheaders', 'windows-foreground'),
            path.join(process.cwd(), 'node_modules', '@openheaders')
        ];
        
        console.log('DEBUG: Checking for module in various locations...');
        for (const checkPath of possiblePaths) {
            if (fs.existsSync(checkPath)) {
                console.log(`  ✓ Path exists: ${checkPath}`);
                // List contents if it's a directory
                if (fs.statSync(checkPath).isDirectory()) {
                    const contents = fs.readdirSync(checkPath);
                    console.log(`    Contents: ${contents.join(', ')}`);
                }
            } else {
                console.log(`  ✗ Path not found: ${checkPath}`);
            }
        }
        
        // Check if @openheaders/windows-foreground is in the unpacked resources
        const nativeModulePath = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', '@openheaders', 'windows-foreground');
        
        if (fs.existsSync(nativeModulePath)) {
            console.log('✓ @openheaders/windows-foreground module found in unpacked resources');
            
            // List all files in the module directory
            console.log('Module directory contents:');
            const listFiles = (dir, prefix = '  ') => {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) {
                        console.log(`${prefix}📁 ${file}/`);
                        if (file !== 'node_modules') { // Avoid recursing into node_modules
                            listFiles(filePath, prefix + '  ');
                        }
                    } else {
                        console.log(`${prefix}📄 ${file} (${stat.size} bytes)`);
                    }
                });
            };
            listFiles(nativeModulePath);
            
            // Check for the native binding (multiple possible locations)
            const possibleBindings = [
                path.join(nativeModulePath, 'build', 'Release', 'foreground.node'),
                path.join(nativeModulePath, 'prebuilds', `win32-${process.arch}`, `node-${process.versions.modules}.node`),
                path.join(nativeModulePath, 'prebuilds', `win32-x64`, 'node.napi.node'),
                path.join(nativeModulePath, 'binding.node')
            ];
            
            console.log('Checking for native bindings...');
            let bindingFound = false;
            for (const bindingPath of possibleBindings) {
                if (fs.existsSync(bindingPath)) {
                    const stat = fs.statSync(bindingPath);
                    console.log(`  ✓ Native binding found: ${bindingPath} (${stat.size} bytes)`);
                    bindingFound = true;
                    break;
                } else {
                    console.log(`  ✗ Not found: ${bindingPath}`);
                }
            }
            
            if (!bindingFound) {
                console.warn('⚠ Native binding not found at expected locations');
                console.warn('  The module may not have been rebuilt for Electron');
            }
        } else {
            console.warn('⚠ @openheaders/windows-foreground module not found in unpacked resources');
            console.warn('  Expected path:', nativeModulePath);
            console.warn('  Windows focus enhancement will use fallback methods');
            
            // Check if it's in the source node_modules
            const sourceModulePath = path.join(process.cwd(), 'node_modules', '@openheaders', 'windows-foreground');
            if (fs.existsSync(sourceModulePath)) {
                console.log('  Note: Module exists in source node_modules at:', sourceModulePath);
                console.log('  It may not have been included in the asar.unpacked configuration');
            }
        }
        
        return;
    }

    // Handle Linux builds
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
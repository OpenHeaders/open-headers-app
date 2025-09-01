const { exec } = require('child_process');
const path = require('path');

console.log('Checking Windows protocol registration for openheaders://\n');

// Check HKEY_CLASSES_ROOT\openheaders
exec('reg query HKCR\\openheaders /s', (error, stdout, stderr) => {
    if (error) {
        console.error('Error querying registry:', error.message);
        console.error('Make sure you run this script as Administrator');
        return;
    }
    
    console.log('=== Registry entries for openheaders:// protocol ===\n');
    console.log(stdout);
    
    // Extract the command path
    const commandMatch = stdout.match(/openheaders\\shell\\open\\command[^"]*"([^"]+)"/);
    if (commandMatch) {
        console.log('\n=== Registered executable path ===');
        console.log(commandMatch[1]);
        
        // Check if the file exists
        const fs = require('fs');
        if (fs.existsSync(commandMatch[1])) {
            console.log('✓ Executable exists');
            
            // Get file info
            const stats = fs.statSync(commandMatch[1]);
            console.log(`  Size: ${stats.size} bytes`);
            console.log(`  Modified: ${stats.mtime}`);
        } else {
            console.log('✗ Executable NOT FOUND - This is likely the problem!');
        }
    }
    
    console.log('\n=== Current OpenHeaders.exe location ===');
    const currentExe = process.execPath;
    console.log(currentExe);
    
    if (commandMatch && commandMatch[1] !== currentExe) {
        console.log('\n⚠️  WARNING: Registry points to different executable!');
        console.log('Registry:', commandMatch[1]);
        console.log('Current:', currentExe);
        console.log('\nThis mismatch is causing the protocol handler to fail.');
        console.log('Solution: Reinstall the app or manually update the registry.');
    }
});

// Also check if there are multiple registrations
exec('reg query HKCR /f openheaders /k', (error, stdout, stderr) => {
    if (!error && stdout) {
        const lines = stdout.split('\n').filter(line => line.includes('openheaders'));
        if (lines.length > 1) {
            console.log('\n⚠️  WARNING: Multiple protocol registrations found:');
            lines.forEach(line => console.log('  ', line.trim()));
        }
    }
});
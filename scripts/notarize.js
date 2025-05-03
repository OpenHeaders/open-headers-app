const { notarize } = require('@electron/notarize');
const path = require('path');
const fs = require('fs');

// This function will be called by electron-builder after signing
async function notarizeApp(context) {
    // Check if we're building for macOS
    // The packager.platform can be 'darwin', 'mac', 'win32', 'win', 'linux'
    const isMacOS = context.packager.platform === 'darwin' ||
        context.packager.platform === 'mac';

    if (!isMacOS) {
        console.log(`⏭️ Skipping notarization for non-macOS platform: ${context.packager.platform}`);
        return;
    }

    // First, check if notarization should be skipped
    if (process.env.SKIP_NOTARIZATION === 'true') {
        console.log('⏭️ Skipping notarization as requested by SKIP_NOTARIZATION=true');
        return;
    }

    // Only notarize on MacOS
    if (process.platform !== 'darwin') {
        console.log('Skipping notarization: Build not running on macOS');
        return;
    }

    // Check for all required environment variables
    const requiredEnvVars = {
        APPLE_ID: process.env.APPLE_ID,
        APPLE_APP_SPECIFIC_PASSWORD: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        APPLE_TEAM_ID: process.env.APPLE_TEAM_ID
    };

    // Check if any required variables are missing
    const missingVars = Object.entries(requiredEnvVars)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

    if (missingVars.length > 0) {
        console.log(`⚠️ Skipping notarization: Missing required environment variables: ${missingVars.join(', ')}`);
        return;
    }

    // Prepare for notarization
    const appBundleId = context.packager.appInfo.info._configuration.appId;
    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(context.appOutDir, `${appName}.app`);

    // Check if the .app bundle exists
    if (!fs.existsSync(appPath)) {
        console.log(`⚠️ Skipping notarization: App bundle not found at ${appPath}`);
        return;
    }

    console.log(`📝 Notarizing ${appName} (${appBundleId}) at: ${appPath}`);

    try {
        await notarize({
            tool: 'notarytool',
            appPath,
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID
        });

        console.log(`✅ Successfully notarized ${appName}`);
    } catch (error) {
        console.error('❌ Notarization failed:', error);
        throw error;
    }
}

module.exports = notarizeApp;
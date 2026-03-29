const { notarize } = require('@electron/notarize');
const path = require('path');
const fs = require('fs');

// This function will be called by electron-builder after signing
async function notarizeApp(context) {
    // More reliable macOS detection
    const isMacOS =
        String(context.packager.platform).toLowerCase().includes('mac') ||
        String(context.packager.platform).toLowerCase().includes('darwin') ||
        process.platform === 'darwin';

    if (!isMacOS) {
        console.log(`⏭️ Skipping notarization for non-macOS platform: ${context.packager.platform}`);
        return;
    }

    // Check if code signing is disabled (local unsigned builds)
    if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
        console.log('⏭️ Skipping notarization for unsigned build (CSC_IDENTITY_AUTO_DISCOVERY=false)');
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
    console.log('This may take several minutes. Please be patient...');

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
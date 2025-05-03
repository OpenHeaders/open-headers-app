const { notarize } = require('@electron/notarize');
const path = require('path');

// This function will be called by electron-builder after signing
async function notarizeApp(context) {
    // First, check if notarization should be skipped
    if (process.env.SKIP_NOTARIZATION === 'true') {
        console.log('⏭️ Skipping notarization as requested by SKIP_NOTARIZATION=true');
        return;
    }

    // Only notarize on Mac OS
    if (process.platform !== 'darwin') {
        console.log('Skipping notarization: Not on macOS');
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
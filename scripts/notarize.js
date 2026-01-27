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

    // Check if notarization should be explicitly skipped
    // This allows CI to set SKIP_NOTARIZATION=true for PRs/non-tag builds
    if (process.env.SKIP_NOTARIZATION === 'true') {
        console.log('⏭️ Skipping notarization as requested by SKIP_NOTARIZATION=true');
        return;
    }

    // Skip notarization for RC/beta/alpha builds (faster CI for testing)
    const version = context.packager.appInfo.version;
    if (version && /-(rc|beta|alpha)[.\d]*$/i.test(version)) {
        console.log(`⏭️ Skipping notarization for pre-release version: ${version}`);
        console.log('   (RC/beta/alpha builds skip notarization to speed up CI)');
        return;
    }

    // Check if code signing is disabled (unsigned build)
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
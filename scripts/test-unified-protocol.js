/**
 * Test script to generate valid unified protocol URLs
 * Usage: node test-unified-protocol.js
 */

// Test data for environment import
const environmentImportData = {
    action: "environment-import",
    version: "3.0.0",
    data: {
        environmentSchema: {
            API_URL: {
                type: "string",
                description: "API base URL",
                required: true
            },
            API_KEY: {
                type: "string",
                description: "API authentication key",
                sensitive: true
            }
        },
        environments: {
            Development: {
                API_URL: "http://localhost:3000",
                API_KEY: "dev-key-123"
            },
            Production: {
                API_URL: "https://api.example.com",
                API_KEY: "prod-key-456"
            }
        }
    }
};

// Test data for team invite
const teamInviteData = {
    action: "team-invite",
    version: "3.0.0",
    data: {
        workspaceName: "Test Team Workspace",
        repoUrl: "https://github.com/example/config-repo.git",
        branch: "main",
        configPath: "config/",
        inviterName: "John Doe",
        inviteId: "invite-" + Date.now(),
        description: "Shared team configuration repository"
    }
};

// Function to generate URL
function generateUnifiedUrl(data) {
    const jsonString = JSON.stringify(data);
    const base64 = Buffer.from(jsonString).toString('base64');
    return `openheaders://open?payload=${base64}`;
}

// Generate URLs
console.log('=== Unified Protocol URL Test ===\n');

console.log('1. Environment Import URL:');
const envUrl = generateUnifiedUrl(environmentImportData);
console.log(envUrl);
console.log(`   Length: ${envUrl.length} characters`);
console.log('');

console.log('2. Team Invite URL:');
const inviteUrl = generateUnifiedUrl(teamInviteData);
console.log(inviteUrl);
console.log(`   Length: ${inviteUrl.length} characters`);
console.log('');

console.log('3. PowerShell Test Commands:');
console.log('');
console.log('# Test environment import:');
console.log(`Start-Process "${envUrl}"`);
console.log('');
console.log('# Test team invite:');
console.log(`Start-Process "${inviteUrl}"`);
console.log('');

console.log('4. Browser Test Links (save as HTML):');
console.log('');
console.log(`<a href="${envUrl}">Test Environment Import</a>`);
console.log(`<a href="${inviteUrl}">Test Team Invite</a>`);
console.log('');

// Validate that decoding works
console.log('5. Validation:');
try {
    const envPayload = envUrl.split('payload=')[1];
    const decodedEnv = JSON.parse(Buffer.from(envPayload, 'base64').toString());
    console.log('✓ Environment import URL decodes correctly');
    console.log(`  Action: ${decodedEnv.action}, Version: ${decodedEnv.version}`);
    
    const invitePayload = inviteUrl.split('payload=')[1];
    const decodedInvite = JSON.parse(Buffer.from(invitePayload, 'base64').toString());
    console.log('✓ Team invite URL decodes correctly');
    console.log(`  Action: ${decodedInvite.action}, Version: ${decodedInvite.version}`);
} catch (error) {
    console.error('✗ Validation failed:', error.message);
}
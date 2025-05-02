const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

// GitHub token should be set as an environment variable
const GITHUB_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const OWNER = 'OpenHeaders';
const REPO = 'open-headers-app';

async function publishToGitHub() {
    if (!GITHUB_TOKEN) {
        console.error('❌ No GitHub token found. Set GH_TOKEN or GITHUB_TOKEN environment variable.');
        process.exit(1);
    }

    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    const version = packageJson.version;
    const tagName = `v${version}`;

    try {
        console.log(`📦 Creating GitHub release for ${tagName}...`);

        // Check if release already exists
        let releaseId;
        try {
            const existingRelease = await octokit.repos.getReleaseByTag({
                owner: OWNER,
                repo: REPO,
                tag: tagName
            });
            releaseId = existingRelease.data.id;
            console.log(`ℹ️ Release ${tagName} already exists, will add artifacts to it.`);
        } catch (error) {
            // Release doesn't exist, create it
            const releaseResponse = await octokit.repos.createRelease({
                owner: OWNER,
                repo: REPO,
                tag_name: tagName,
                name: `Release ${tagName}`,
                body: `Release version ${version}`,
                draft: true,
                prerelease: false,
            });
            releaseId = releaseResponse.data.id;
            console.log(`✅ Created release ${tagName} with ID ${releaseId}`);
        }

        // Find all artifacts in dist directory
        const distDir = path.join(process.cwd(), 'dist');
        const artifacts = fs.readdirSync(distDir)
            .filter(file =>
                file.endsWith('.dmg') ||
                file.endsWith('.zip') ||
                file.endsWith('.deb') ||
                file.endsWith('.AppImage') ||
                file.endsWith('.exe') ||
                file.includes('latest-mac') ||
                file.includes('latest-linux') ||
                file.includes('latest')
            )
            .map(file => ({
                name: file,
                path: path.join(distDir, file)
            }));

        if (artifacts.length === 0) {
            console.error('❌ No artifacts found in dist directory');
            process.exit(1);
        }

        console.log(`🔎 Found ${artifacts.length} artifacts to upload:`);
        artifacts.forEach(file => console.log(`  - ${file.name}`));

        // Upload each artifact
        for (const artifact of artifacts) {
            console.log(`📤 Uploading ${artifact.name}...`);

            // Check if asset already exists
            try {
                const assets = await octokit.repos.listReleaseAssets({
                    owner: OWNER,
                    repo: REPO,
                    release_id: releaseId,
                    per_page: 100
                });

                const existingAsset = assets.data.find(asset => asset.name === artifact.name);
                if (existingAsset) {
                    console.log(`⚠️ Asset ${artifact.name} already exists, deleting it first...`);
                    await octokit.repos.deleteReleaseAsset({
                        owner: OWNER,
                        repo: REPO,
                        asset_id: existingAsset.id
                    });
                }
            } catch (error) {
                console.warn(`Warning when checking existing assets: ${error.message}`);
            }

            // Upload the asset
            const fileSize = fs.statSync(artifact.path).size;
            const fileData = fs.readFileSync(artifact.path);

            const contentType = artifact.name.endsWith('.yml') ? 'application/yaml' : 'application/octet-stream';

            await octokit.repos.uploadReleaseAsset({
                owner: OWNER,
                repo: REPO,
                release_id: releaseId,
                name: artifact.name,
                data: fileData,
                headers: {
                    'content-length': fileSize,
                    'content-type': contentType
                }
            });

            console.log(`✅ Uploaded ${artifact.name}`);
        }

        console.log('✅ All artifacts have been successfully published!');
    } catch (error) {
        console.error('❌ Publishing failed:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

publishToGitHub();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const buildDir = path.join(__dirname, '..', 'build');
const svgPath = path.join(buildDir, 'dmg-background.svg');
const pngPath = path.join(buildDir, 'dmg-background.png');

// Check if SVG exists
if (!fs.existsSync(svgPath)) {
    console.error('Error: dmg-background.svg not found in build directory');
    process.exit(1);
}

// Try different methods to convert SVG to PNG
function convertWithRsvg() {
    try {
        // Generate at 1x resolution to match DMG window size (540x380)
        execSync(`rsvg-convert -w 540 -h 380 "${svgPath}" -o "${pngPath}"`, { stdio: 'inherit' });
        return true;
    } catch {
        return false;
    }
}

function convertWithQlmanage() {
    try {
        // qlmanage is available on macOS
        const tempDir = path.join(buildDir, 'temp-ql');
        fs.mkdirSync(tempDir, { recursive: true });
        execSync(`qlmanage -t -s 540 -o "${tempDir}" "${svgPath}"`, { stdio: 'pipe' });

        // qlmanage creates file with .svg.png extension
        const generatedFile = path.join(tempDir, 'dmg-background.svg.png');
        if (fs.existsSync(generatedFile)) {
            fs.copyFileSync(generatedFile, pngPath);
            fs.rmSync(tempDir, { recursive: true, force: true });
            return true;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
        return false;
    } catch {
        return false;
    }
}

function convertWithSips() {
    try {
        // sips is available on macOS but has limited SVG support
        // First create a temporary PDF, then convert to PNG
        execSync(`sips -s format png "${svgPath}" --out "${pngPath}"`, { stdio: 'pipe' });
        return fs.existsSync(pngPath);
    } catch {
        return false;
    }
}

console.log('Converting DMG background from SVG to PNG...');

// Try methods in order of preference
if (convertWithRsvg()) {
    console.log('Successfully converted using rsvg-convert');
} else if (convertWithQlmanage()) {
    console.log('Successfully converted using qlmanage');
} else if (convertWithSips()) {
    console.log('Successfully converted using sips');
} else {
    console.log('\nCould not automatically convert SVG to PNG.');
    console.log('Please convert build/dmg-background.svg to build/dmg-background.png manually.');
    console.log('\nOptions:');
    console.log('  1. Install librsvg: brew install librsvg');
    console.log('  2. Use an online converter');
    console.log('  3. Open in a browser and export at 540x380');
    console.log('  4. Use Figma, Sketch, or similar tools');
    process.exit(1);
}

console.log(`Output: ${pngPath}`);

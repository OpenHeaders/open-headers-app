#!/bin/bash

# All-in-One FFmpeg Binary Packager
# Downloads and packages FFmpeg binaries for all platforms

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}All-in-One FFmpeg Binary Packager${NC}"
echo "=================================="

# Create working directory
WORK_DIR="ffmpeg_binaries"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# Clean up any previous runs
rm -rf ffmpeg-macos-arm64-bundle

# Function to download with progress
download_file() {
    local url=$1
    local output=$2

    if command -v wget &> /dev/null; then
        wget -q --show-progress "$url" -O "$output"
    else
        curl -L --progress-bar "$url" -o "$output"
    fi
}

# 1. Package macOS ARM64 from Homebrew with dylibbundler
echo -e "\n${YELLOW}1. Packaging macOS ARM64 (from Homebrew)...${NC}"
if command -v ffmpeg &> /dev/null && [[ $(uname -m) == "arm64" ]]; then
    # Check if dylibbundler is installed
    if ! command -v dylibbundler &> /dev/null; then
        echo -e "${YELLOW}dylibbundler not found. Installing...${NC}"
        brew install dylibbundler
    fi

    FFMPEG_PATH=$(which ffmpeg)
    if [[ -f "$FFMPEG_PATH" ]]; then
        echo "Creating portable bundle with dylibbundler..."

        # Create bundle directory
        BUNDLE_DIR="ffmpeg-macos-arm64-bundle"
        # Remove any existing directory first
        rm -rf "$BUNDLE_DIR"
        mkdir -p "$BUNDLE_DIR/libs"

        # Copy ffmpeg binary
        cp "$FFMPEG_PATH" "$BUNDLE_DIR/ffmpeg"
        chmod +x "$BUNDLE_DIR/ffmpeg"

        # Use dylibbundler to handle all dependencies
        echo "Bundling dependencies..."
        dylibbundler \
            -cd \
            -od \
            -b \
            -x "$BUNDLE_DIR/ffmpeg" \
            -d "$BUNDLE_DIR/libs" \
            -p "@executable_path/libs/"

        # Create a wrapper script
        cat > "$BUNDLE_DIR/ffmpeg-portable" << 'EOF'
#!/bin/bash
# Portable FFmpeg wrapper
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
"$DIR/ffmpeg" "$@"
EOF
        chmod +x "$BUNDLE_DIR/ffmpeg-portable"

        # Create README
        cat > "$BUNDLE_DIR/README.txt" << 'EOF'
FFmpeg Portable Bundle for macOS ARM64
======================================

This is a fully portable FFmpeg bundle with all dependencies included.

IMPORTANT: You must extract BOTH the 'ffmpeg' binary AND the 'libs' folder!

Usage:
  ./ffmpeg [arguments]

The 'libs' folder MUST be in the same directory as the ffmpeg binary.

Directory structure:
  ffmpeg          <- The main binary
  libs/           <- Required libraries (MUST BE PRESENT)
    *.dylib       <- All dependency libraries

If you get "Library not loaded" errors, it means the libs folder is missing.

Created with dylibbundler from Homebrew's ffmpeg.
EOF

        # Create a simpler archive structure
        echo "Creating archive..."

        # Method 1: Create a zip that preserves the exact structure
        zip -r ffmpeg-macos-arm64.zip "$BUNDLE_DIR"

        # Method 2: Also create a tarball for better preservation
        tar -czf ffmpeg-macos-arm64.tar.gz "$BUNDLE_DIR"

        # Method 3: Create a "flat" version where everything is in the root
        mkdir -p ffmpeg-arm64-flat
        cp "$BUNDLE_DIR/ffmpeg" ffmpeg-arm64-flat/
        cp -r "$BUNDLE_DIR/libs" ffmpeg-arm64-flat/
        cd ffmpeg-arm64-flat
        zip -r ../ffmpeg-macos-arm64-flat.zip ffmpeg libs
        cd ..
        rm -rf ffmpeg-arm64-flat

        # Verify the packages
        echo ""
        echo "Package contents:"
        echo "Main package (ffmpeg-macos-arm64.zip):"
        unzip -l ffmpeg-macos-arm64.zip | grep -E "(ffmpeg|\.dylib)" | head -5
        echo "..."

        echo ""
        echo "Flat package (ffmpeg-macos-arm64-flat.zip):"
        unzip -l ffmpeg-macos-arm64-flat.zip | head -10

        # Clean up
        rm -rf "$BUNDLE_DIR"

        echo -e "\n${GREEN}✓ Created multiple package formats:${NC}"
        echo "  - ffmpeg-macos-arm64.zip (with bundle directory)"
        echo "  - ffmpeg-macos-arm64.tar.gz (preserves permissions)"
        echo "  - ffmpeg-macos-arm64-flat.zip (ffmpeg + libs at root)"
        echo ""
        echo -e "${YELLOW}Note: Your app MUST extract both 'ffmpeg' and 'libs/'${NC}"
    fi
else
    echo -e "${RED}⚠ FFmpeg not found via Homebrew or not on ARM64 Mac${NC}"
fi

# 2. Download macOS Intel x64 from evermeet.cx
echo -e "\n${YELLOW}2. Downloading macOS Intel x64...${NC}"
download_file "https://evermeet.cx/ffmpeg/ffmpeg-7.1.1.zip" "ffmpeg-macos-x64-temp.zip"
unzip -q ffmpeg-macos-x64-temp.zip
mkdir -p macos-x64
mv ffmpeg macos-x64/
chmod +x macos-x64/ffmpeg
cd macos-x64
zip ../ffmpeg-macos-x64.zip ffmpeg
cd ..
rm -rf macos-x64 ffmpeg-macos-x64-temp.zip
echo -e "${GREEN}✓ Created: ffmpeg-macos-x64.zip${NC}"

# 3. Download Windows x64 from BtbN
echo -e "\n${YELLOW}3. Downloading Windows x64...${NC}"
download_file "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" "win64-temp.zip"
unzip -q win64-temp.zip "*/bin/ffmpeg.exe"
mkdir -p windows-x64
find . -name "ffmpeg.exe" -exec mv {} windows-x64/ \;
cd windows-x64
zip ../ffmpeg-windows-x64.zip ffmpeg.exe
cd ..
rm -rf ffmpeg-master-latest-win64-gpl win64-temp.zip windows-x64
echo -e "${GREEN}✓ Created: ffmpeg-windows-x64.zip${NC}"

# 4. Download Linux x64 from BtbN
echo -e "\n${YELLOW}4. Downloading Linux x64...${NC}"
download_file "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz" "linux64-temp.tar.xz"
tar -xf linux64-temp.tar.xz
mkdir -p linux-x64
# Extract the directory name and copy ffmpeg binary directly
LINUX64_DIR=$(tar -tf linux64-temp.tar.xz | head -1 | cut -d'/' -f1)
cp "$LINUX64_DIR/bin/ffmpeg" linux-x64/
chmod +x linux-x64/ffmpeg
cd linux-x64
tar -czf ../ffmpeg-linux-x64.tar.gz ffmpeg
cd ..
rm -rf "$LINUX64_DIR" linux64-temp.tar.xz linux-x64
echo -e "${GREEN}✓ Created: ffmpeg-linux-x64.tar.gz${NC}"

# 5. Download Linux ARM64 from BtbN
echo -e "\n${YELLOW}5. Downloading Linux ARM64...${NC}"
download_file "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz" "linuxarm64-temp.tar.xz"
tar -xf linuxarm64-temp.tar.xz
mkdir -p linux-arm64
# Extract the directory name and copy ffmpeg binary directly
LINUXARM64_DIR=$(tar -tf linuxarm64-temp.tar.xz | head -1 | cut -d'/' -f1)
cp "$LINUXARM64_DIR/bin/ffmpeg" linux-arm64/
chmod +x linux-arm64/ffmpeg
cd linux-arm64
tar -czf ../ffmpeg-linux-arm64.tar.gz ffmpeg
cd ..
rm -rf "$LINUXARM64_DIR" linuxarm64-temp.tar.xz linux-arm64
echo -e "${GREEN}✓ Created: ffmpeg-linux-arm64.tar.gz${NC}"

# 6. Create version info file
echo -e "\n${YELLOW}6. Creating version info...${NC}"
cat > versions.txt << EOF
FFmpeg Binary Versions
=====================

macOS ARM64: $(ffmpeg -version 2>/dev/null | head -n1 || echo "From Homebrew") - Portable bundle
macOS x64: FFmpeg 7.1.1 (from evermeet.cx) - Static build
Windows x64: Latest master (from BtbN/FFmpeg-Builds) - Static build
Linux x64: Latest master (from BtbN/FFmpeg-Builds) - Static build
Linux ARM64: Latest master (from BtbN/FFmpeg-Builds) - Static build

Package Date: $(date)
EOF

# 7. Create README
cat > README.md << 'EOF'
# FFmpeg Binaries

Pre-packaged FFmpeg binaries for multiple platforms.

## Files

### macOS ARM64 (Apple Silicon)
- `ffmpeg-macos-arm64.zip` - Bundle with directory structure
- `ffmpeg-macos-arm64-flat.zip` - Flat structure (ffmpeg + libs/)
- `ffmpeg-macos-arm64.tar.gz` - Preserves Unix permissions

**IMPORTANT for macOS ARM64**: These packages contain BOTH the ffmpeg binary AND a libs/ folder with dependencies. You MUST extract both!

### Other Platforms (Static builds - single file)
- `ffmpeg-macos-x64.zip` - macOS Intel 64-bit
- `ffmpeg-windows-x64.zip` - Windows 64-bit
- `ffmpeg-linux-x64.tar.gz` - Linux 64-bit
- `ffmpeg-linux-arm64.tar.gz` - Linux ARM64

## Usage for macOS ARM64

**Your extraction code must preserve the directory structure:**

```javascript
// WRONG - Only extracts ffmpeg binary
extractFile('ffmpeg-macos-arm64.zip', 'ffmpeg', targetDir);

// CORRECT - Extracts everything maintaining structure
extractAll('ffmpeg-macos-arm64.zip', targetDir);
// This creates:
//   targetDir/ffmpeg
//   targetDir/libs/*.dylib
```

The libs/ folder MUST be in the same directory as the ffmpeg binary!

## Integration Example

```javascript
const platform = process.platform;
const arch = process.arch;

if (platform === 'darwin' && arch === 'arm64') {
  // For macOS ARM64, extract the entire zip maintaining structure
  await extractZip('ffmpeg-macos-arm64.zip', targetDirectory);
  // Results in:
  // targetDirectory/ffmpeg
  // targetDirectory/libs/
} else {
  // Other platforms have single-file static builds
  await extractSingleFile(zipFile, 'ffmpeg', targetDirectory);
}
```

## License

FFmpeg is licensed under GPL/LGPL. See https://ffmpeg.org/legal.html
EOF

# 8. Show summary
echo -e "\n${GREEN}======== Summary ========${NC}"
echo "Files created in $PWD:"
echo ""
ls -lh *.zip *.tar.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
echo ""
echo -e "${BLUE}Total size:${NC}"
du -sh . | awk '{print "  " $1}'
echo ""
echo -e "${GREEN}All done!${NC} 🎉"
echo ""
echo -e "${RED}IMPORTANT for macOS ARM64:${NC}"
echo "The ffmpeg-macos-arm64 packages contain BOTH:"
echo "  - ffmpeg (the binary)"
echo "  - libs/ (folder with all .dylib dependencies)"
echo ""
echo "Your app MUST extract BOTH to the same directory!"
echo ""
echo "Recommended: Use ffmpeg-macos-arm64-flat.zip for easier extraction"
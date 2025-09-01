#!/bin/bash

# Script to generate all required icon formats from logo.svg

echo "Generating icons from logo.svg..."

# Source and destination paths
SOURCE_SVG="build/logo.svg"
BUILD_DIR="build"

# Check if source SVG exists
if [ ! -f "$SOURCE_SVG" ]; then
    echo "Error: $SOURCE_SVG not found!"
    exit 1
fi

# Create temporary directory for intermediate files
TEMP_DIR=$(mktemp -d)
echo "Using temp directory: $TEMP_DIR"

# Generate PNG files at different sizes
echo "Generating PNG files..."
for size in 16 32 48 64 128 256 512 1024; do
    # Use rsvg-convert if available for better SVG rendering, otherwise use ImageMagick
    if command -v rsvg-convert &> /dev/null; then
        rsvg-convert -w ${size} -h ${size} "$SOURCE_SVG" -o "$TEMP_DIR/icon_${size}.png"
    else
        # Use magick with better SVG rendering settings
        magick -background none -density 300 "$SOURCE_SVG" -resize ${size}x${size} -depth 8 -colorspace sRGB "$TEMP_DIR/icon_${size}.png"
    fi
    echo "  Created ${size}x${size} PNG"
done

# Generate main icon.png (512x512 for Linux)
echo "Creating icon.png (512x512)..."
cp "$TEMP_DIR/icon_512.png" "$BUILD_DIR/icon.png"

# Generate icon128.png for tray
echo "Creating icon128.png..."
cp "$TEMP_DIR/icon_128.png" "$BUILD_DIR/icon128.png"

# Generate icon32.png for smaller uses
echo "Creating icon32.png..."
cp "$TEMP_DIR/icon_32.png" "$BUILD_DIR/icon32.png"

# Generate icon64.png for Windows tray (high-DPI)
echo "Creating icon64.png..."
cp "$TEMP_DIR/icon_64.png" "$BUILD_DIR/icon64.png"

# Generate icon16.png 
echo "Creating icon16.png..."
cp "$TEMP_DIR/icon_16.png" "$BUILD_DIR/icon16.png"

# Generate icon48.png
echo "Creating icon48.png..."
cp "$TEMP_DIR/icon_48.png" "$BUILD_DIR/icon48.png"

# Generate template icons for macOS tray (monochrome)
echo "Creating macOS template icons..."
# Use a special template SVG without background for macOS tray icons
TEMPLATE_SVG="$BUILD_DIR/logoTemplate.svg"

# Check if template SVG exists, if not create it from the main logo
if [ ! -f "$TEMPLATE_SVG" ]; then
    echo "Creating logoTemplate.svg..."
    # This would normally extract just the letters, but for now we assume it exists
fi

# Create versions at correct sizes from the template SVG
rsvg-convert -w 16 -h 16 "$TEMPLATE_SVG" -o "$BUILD_DIR/iconTemplate.png"
rsvg-convert -w 32 -h 32 "$TEMPLATE_SVG" -o "$BUILD_DIR/iconTemplate@2x.png"

# Generate Windows ICO file
echo "Creating icon.ico for Windows..."
magick "$TEMP_DIR/icon_16.png" "$TEMP_DIR/icon_32.png" "$TEMP_DIR/icon_48.png" "$TEMP_DIR/icon_256.png" "$BUILD_DIR/icon.ico"

# Generate macOS ICNS file
echo "Creating icon.icns for macOS..."
# Create iconset directory
ICONSET_DIR="$TEMP_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"

# Copy files with correct names for iconutil
cp "$TEMP_DIR/icon_16.png" "$ICONSET_DIR/icon_16x16.png"
cp "$TEMP_DIR/icon_32.png" "$ICONSET_DIR/icon_16x16@2x.png"
cp "$TEMP_DIR/icon_32.png" "$ICONSET_DIR/icon_32x32.png"
cp "$TEMP_DIR/icon_64.png" "$ICONSET_DIR/icon_32x32@2x.png"
cp "$TEMP_DIR/icon_128.png" "$ICONSET_DIR/icon_128x128.png"
cp "$TEMP_DIR/icon_256.png" "$ICONSET_DIR/icon_128x128@2x.png"
cp "$TEMP_DIR/icon_256.png" "$ICONSET_DIR/icon_256x256.png"
cp "$TEMP_DIR/icon_512.png" "$ICONSET_DIR/icon_256x256@2x.png"
cp "$TEMP_DIR/icon_512.png" "$ICONSET_DIR/icon_512x512.png"
cp "$TEMP_DIR/icon_1024.png" "$ICONSET_DIR/icon_512x512@2x.png"

# Convert to ICNS
iconutil -c icns -o "$BUILD_DIR/icon.icns" "$ICONSET_DIR"

# Clean up
echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "Icon generation complete!"
echo "Generated files:"
echo "  - $BUILD_DIR/icon.png (512x512 - Linux)"
echo "  - $BUILD_DIR/icon128.png (128x128 - Tray icon)"
echo "  - $BUILD_DIR/icon64.png (64x64 - Windows tray high-DPI)"
echo "  - $BUILD_DIR/icon48.png (48x48 - Medium icon)"
echo "  - $BUILD_DIR/icon32.png (32x32 - Small icon)"
echo "  - $BUILD_DIR/icon16.png (16x16 - Tiny icon)"
echo "  - $BUILD_DIR/iconTemplate.png (16x16 - macOS tray template)"
echo "  - $BUILD_DIR/iconTemplate@2x.png (32x32 - macOS tray template @2x)"
echo "  - $BUILD_DIR/icon.ico (Multi-size - Windows)"
echo "  - $BUILD_DIR/icon.icns (Multi-size - macOS)"
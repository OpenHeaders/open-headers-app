#!/bin/bash
# OpenHeaders AppImage Installation Script
# This script follows the exact steps that worked manually

# Exit on any error
set -e

# Display script header
echo "=========================================================="
echo "     OpenHeaders Installation Script"
echo "=========================================================="
echo ""

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    echo "This script requires root privileges to set proper sandbox permissions."
    echo "Please run with sudo: sudo ./install-open-headers.sh"
    exit 1
fi

# Get directory where script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPIMAGE_NAME="OpenHeaders-2.4.28-arm64.AppImage"
APPIMAGE_PATH="$SCRIPT_DIR/$APPIMAGE_NAME"

# Check if AppImage exists
if [ ! -f "$APPIMAGE_PATH" ]; then
    echo "Error: $APPIMAGE_NAME not found in the current directory."
    echo "Please place this script in the same directory as the AppImage."
    exit 1
fi

# Get the current user for permission setting later
CURRENT_USER=$(logname || echo $SUDO_USER || echo $USER)
echo "Installing for user: $CURRENT_USER"

echo "Step 1: Making AppImage executable..."
chmod +x "$APPIMAGE_PATH"
echo "✓ Done"
echo ""

echo "Step 2: Extracting AppImage..."
cd "$SCRIPT_DIR"
"$APPIMAGE_PATH" --appimage-extract
echo "✓ Done"
echo ""

echo "Step 3: Setting sandbox permissions..."
chown root:root squashfs-root/chrome-sandbox
chmod 4755 squashfs-root/chrome-sandbox
echo "✓ Done"
echo ""

echo "Step 4: Installing to /opt/OpenHeaders..."
# Remove previous installation if exists
if [ -d "/opt/OpenHeaders" ]; then
    rm -rf /opt/OpenHeaders
fi

# Move the extracted files to /opt
mv squashfs-root /opt/OpenHeaders

# CRITICAL: Fix directory permissions so user can access it
chown -R $CURRENT_USER:$CURRENT_USER /opt/OpenHeaders
# Keep chrome-sandbox with root ownership
chown root:root /opt/OpenHeaders/chrome-sandbox
chmod 4755 /opt/OpenHeaders/chrome-sandbox
echo "✓ Done"
echo ""

echo "Step 5: Creating command-line access..."
# Create a wrapper script in /usr/bin which is in PATH
cat > /usr/bin/open-headers << 'EOF'
#!/bin/bash
# Run OpenHeaders and force window to show
cd /opt/OpenHeaders
./open-headers "$@"
EOF

# Make it executable
chmod +x /usr/bin/open-headers
echo "✓ Done"
echo ""

echo "Step 6: Creating desktop shortcut..."
cat > /usr/share/applications/openheaders.desktop << EOF
[Desktop Entry]
Name=OpenHeaders
Comment=Dynamic sources for Open Headers browser extension
Exec=/usr/bin/open-headers
Icon=/opt/OpenHeaders/open-headers.png
Terminal=false
Type=Application
Categories=Utility;Development;Network;
EOF
echo "✓ Done"
echo ""

echo "=========================================================="
echo "✅ OpenHeaders has been successfully installed!"
echo "   You can now launch it by:"
echo ""
echo "   • Running 'open-headers' from the terminal"
echo "   • Using the application menu in your desktop environment"
echo ""
echo "   If you encounter any issues, try running directly:"
echo "   $ cd /opt/OpenHeaders && ./open-headers"
echo "=========================================================="
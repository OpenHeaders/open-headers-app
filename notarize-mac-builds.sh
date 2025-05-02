#!/bin/bash

# notarize-mac-builds.sh
# Script to notarize macOS builds (DMG and ZIP) for both x64 and arm64 architectures

# Exit on any error
set -e

# Configuration - these will come from environment variables
APPLE_ID=${APPLE_ID:-""}
APPLE_TEAM_ID=${APPLE_TEAM_ID:-""}
APPLE_PASSWORD=${APPLE_APP_SPECIFIC_PASSWORD:-""}

# Directory containing the builds
DIST_DIR="./dist"

# Function to notarize a file
notarize_file() {
    local file_path="$1"
    local file_name=$(basename "$file_path")

    echo "📝 Notarizing $file_name..."

    # Submit for notarization and capture output to a temporary file
    echo "🚀 Submitting to Apple notary service..."
    TEMP_OUTPUT=$(mktemp)

    xcrun notarytool submit "$file_path" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --wait > "$TEMP_OUTPUT" 2>&1

    # Extract the submission ID from the output file - look for "id:" and take just that one line
    SUBMISSION_ID=$(grep "id:" "$TEMP_OUTPUT" | head -n 1 | awk '{print $2}' | tr -d '\n\r')

    # Clean up temp file
    rm "$TEMP_OUTPUT"

    if [ -z "$SUBMISSION_ID" ]; then
        echo "❌ Failed to get submission ID for $file_name"
        return 1
    fi

    echo "🔍 Notarization ID: $SUBMISSION_ID"

    # Check status with the clean ID
    STATUS=$(xcrun notarytool info "$SUBMISSION_ID" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" | grep "status:" | head -n 1 | awk '{print $2}' | tr -d '\n\r')

    if [ "$STATUS" != "Accepted" ]; then
        echo "❌ Notarization failed with status: $STATUS"
        # Show logs to a file to avoid parsing issues
        LOG_FILE=$(mktemp)
        xcrun notarytool log "$SUBMISSION_ID" \
            --apple-id "$APPLE_ID" \
            --password "$APPLE_PASSWORD" \
            --team-id "$APPLE_TEAM_ID" "$LOG_FILE"

        echo "Log saved to $LOG_FILE"
        return 1
    fi

    echo "✅ Successfully notarized $file_name"

    # Skip stapling for now as we get: The staple and validate action failed! Error 65.
#    if [[ "$file_path" == *.zip ]]; then
#        echo "📌 Stapling ticket to $file_name..."
#        xcrun stapler staple "$file_path"
#        xcrun stapler validate "$file_path"
#        echo "✅ Successfully stapled ticket to $file_name"
#    fi

    return 0
}

# Main function
main() {
    echo "🔍 Looking for macOS builds to notarize..."

    # Find all macOS DMG and ZIP files
    MAC_FILES=()
    while IFS= read -r file; do
        if [[ "$file" == *-mac-*.dmg || "$file" == *-mac-*.zip ]]; then
            MAC_FILES+=("$file")
        fi
    done < <(find "$DIST_DIR" -type f \( -name "*.dmg" -o -name "*.zip" \))

    if [ ${#MAC_FILES[@]} -eq 0 ]; then
        echo "❌ No macOS builds found in $DIST_DIR"
        exit 1
    fi

    echo "🔎 Found ${#MAC_FILES[@]} macOS files to notarize:"
    for file in "${MAC_FILES[@]}"; do
        echo "  - $(basename "$file")"
    done

    # Notarize each file
    for file in "${MAC_FILES[@]}"; do
        notarize_file "$file"
    done

    echo "✅ All macOS files have been successfully notarized!"
}

# Run the main function
main
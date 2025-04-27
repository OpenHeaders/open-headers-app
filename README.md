# Open Headers - Dynamic Sources

![Open Headers Logo](./src/ui/images/icon128.png)

A companion application for the Open Headers browser extension that manages dynamic sources from files, environment variables, and HTTP endpoints.

## Features

- 🔄 **Multiple Source Types**: Retrieve values from HTTP requests, environment variables, and local files
- 🔍 **JSON Path Filtering**: Extract specific values from JSON responses
- ⏱️ **Auto-Refresh**: Schedule periodic updates for HTTP sources
- 🛡️ **TOTP Authentication**: Generate time-based one-time passwords for secure API access
- 💾 **Import/Export**: Share source configurations between instances
- ⚙️ **App Settings**: Configure app behavior, appearance and startup options
- 🔔 **Status Bar Icon**: Access the app quickly from the system tray/menu bar
- 📱 **Dock Icon Control**: Show or hide app icon in macOS dock
- 🚀 **Auto-start**: Launch automatically at system startup
- 🙈 **Hidden Startup**: Option to start minimized to the tray
- 💻 **Modern UI**: Clean, minimalist design with Ant Design components

## Installation

### Prebuilt Binaries

1. Download the latest release for your platform:
   - [macOS](https://github.com/OpenHeaders/open-headers-app/releases)
   - [Windows](https://github.com/OpenHeaders/open-headers-app/releases)
   - [Linux](https://github.com/OpenHeaders/open-headers-app/releases)

2. Install the application:
   - **macOS**: Open the DMG file and drag the app to your Applications folder
   - **Windows**: Run the installer executable
   - **Linux**: Extract the AppImage and make it executable

### Building from Source

1. Clone the repository
2. Install dependencies with `npm install`
3. Run `npm run dist` to create installers for your platform
4. The built application will be in the `dist` directory

## Usage

### Starting the Application

1. Launch the "Open Headers - Sources" application
2. The app will start in your system tray/menu bar (and optionally in the dock)
3. Click the tray icon to open the sources dashboard

### Configuration Settings

Access app settings by clicking the menu button in the top-right corner:

#### Startup Options
- **Launch at login**: Start the app automatically when your system boots
- **Hide window on startup**: Start minimized to the system tray

#### Appearance
- **Show Dock icon** (macOS): Choose whether to show the app in the dock
- **Show Status Bar icon**: Choose whether to show the app in the system tray/menu bar

### Adding a File Source

1. From the dashboard, select "File" as the source type
2. Click "Browse" to select a local file
3. Add an optional tag for easy identification
4. Click "Add Source"

The file content will be continuously monitored for changes.

### Adding an Environment Variable Source

1. Select "Environment Variable" as the source type
2. Enter the name of the environment variable
3. Add an optional tag for easy identification
4. Click "Add Source"

### Adding an HTTP Source

1. Select "HTTP Request" as the source type
2. Enter the URL for the request
3. Select the HTTP method (GET, POST, etc.)
4. Configure request options (headers, query parameters, body)
5. Optionally enable JSON filtering to extract specific values
6. Set up auto-refresh if you want regular updates
7. Click "Add Source"

### Using JSON Filtering

For HTTP sources that return JSON:

1. Enable the "JSON Filter" option
2. Enter a JSON path using dot notation (e.g., `root.data.access_token`)
3. Use the "Test Request" button to verify your filter works correctly

### Using TOTP Authentication

For APIs requiring time-based one-time passwords:

1. Enable "TOTP Authentication" in your HTTP source
2. Enter your TOTP secret key (base32 encoded)
3. Use `_TOTP_CODE` placeholder in your request where the code should be inserted
4. Example: Add `verification_code:_TOTP_CODE` in a form-encoded body

The application will automatically generate and insert the current TOTP code whenever the request is made.

### Importing and Exporting Sources

Easily save and share your source configurations:

#### Exporting Sources
1. Click the menu button in the top-right corner
2. Select "Export Sources"
3. Choose a location to save the JSON file
4. All source configurations will be saved to the file

#### Importing Sources
1. Click the menu button in the top-right corner
2. Select "Import Sources"
3. Select a previously exported JSON file
4. The sources will be loaded and added to your existing sources

### Minimizing to Tray

- When the application window is closed, it will minimize to the system tray rather than quitting
- Click the tray icon to restore the window
- Right-click the tray icon for additional options (Show Open Headers, Hide Open Headers, Quit)

## Connecting to the Browser Extension

1. Install the [Open Headers browser extension](https://github.com/OpenHeaders/open-headers-browser-extension)
2. Launch the Sources application
3. The extension will automatically connect to the application
4. In the extension popup, your dynamic sources will appear as options when creating headers

## Documentation

For more detailed information, see:
- [DEVELOPER.md](./docs/DEVELOPER.md) - Technical documentation for developers
- [CONTRIBUTING.md](./docs/CONTRIBUTING.md) - Guidelines for contributing to the project
- [PRIVACY.md](./docs/PRIVACY.md) - Privacy policy

## Contributing

Contributions are welcome! Please refer to [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

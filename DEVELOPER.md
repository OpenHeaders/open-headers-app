# Open Headers - Developer Documentation

This document contains detailed information for developers working with the Open Headers Dynamic Sources application.

## Architecture

### Components

The application consists of these main components:

- **Main Process**: The Electron main process that manages the application lifecycle
- **WebSocket Server**: Broadcasts source updates to connected clients
- **Source Services**:
  - File Service: Monitors file system changes
  - Environment Service: Accesses environment variables
  - HTTP Service: Makes HTTP requests and processes responses
- **UI Dashboard**: The user interface for managing sources
- **Tray Service**: Manages the system tray/status bar icon
- **Settings Controller**: Manages application settings and appearance

### Modules

| Module | Description |
|--------|-------------|
| `main.js` | Application entry point and window management |
| `source-service.js` | Core service managing all source types |
| `file-service.js` | Handles file system monitoring |
| `env-service.js` | Manages environment variable access |
| `http-service.js` | Makes HTTP requests and processes responses |
| `tray-service.js` | Manages system tray/status bar integration |
| `ws-controller.js` | Manages the WebSocket server |
| `source-controller.js` | Handles IPC between renderer and main processes |
| `settings-controller.js` | Manages application settings and preferences |
| `source-repository.js` | Persistent storage for source configurations |
| `source.js` | Data model for sources |
| `node-utils.js` | Utility functions for Node.js environment |
| `utils.js` | Utility functions for browser environment |

### Data Flow

1. User configures sources in the UI
2. Sources are saved to persistent storage
3. Source services monitor for changes
4. When a source value changes:
   - The new value is processed and saved
   - The WebSocket server broadcasts the update
   - The UI is updated to show the current value
5. Connected browser extensions receive updates in real-time

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 14.0 or higher
- [npm](https://www.npmjs.com/) 6.0 or higher
- [Electron](https://www.electronjs.org/) development environment

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/OpenHeaders/open-headers-app.git
   cd open-headers-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development version:
   ```bash
   npm run dev
   ```

### Project Structure

```
open-headers-app/
├── main.js              # Main Electron entry point
├── package.json         # npm package configuration
├── webpack.config.js    # Webpack configuration
├── src/
│   ├── config/          # Application configuration
│   │   └── app-config.js # App settings
│   ├── controllers/     # Controllers
│   │   ├── source-controller.js # Manages IPC for sources
│   │   ├── settings-controller.js # Manages app settings
│   │   └── ws-controller.js # WebSocket server controller
│   ├── models/          # Data models
│   │   └── source.js    # Source data model
│   ├── repositories/    # Data access
│   │   └── source-repository.js # Source persistence
│   ├── services/        # Core services
│   │   ├── source-service.js # Main source service
│   │   ├── file-service.js # File watching service
│   │   ├── env-service.js # Environment variable service
│   │   ├── http-service.js # HTTP request service
│   │   └── tray-service.js # System tray management
│   ├── utils/           # Utility functions
│   │   └── node-utils.js # Node.js utility functions
│   ├── preload/         # Electron preload scripts
│   │   └── preload.js   # Preload script for IPC
│   └── ui/              # Renderer process UI
│       ├── index.html   # Main UI HTML
│       ├── styles.css   # UI styles
│       ├── renderer.js  # Main renderer script
│       ├── utils.js     # Browser utility functions
│       ├── source-form-controller.js # Form UI controller
│       └── source-table-controller.js # Table UI controller
└── build/               # Build resources
    ├── icon.png         # Application icon
    ├── icon.ico         # Windows icon
    └── icon.icns        # macOS icon
```

## Feature Implementation Details

### Settings and Preferences

Application settings are managed through the `settings-controller.js` module:

1. **Storage**: Settings are saved to a JSON file in the app's user data directory
2. **Auto-start configuration**:
   - Implemented using the `auto-launch` npm package for cross-platform compatibility
   - Settings include enabling auto-start and hidden startup option
3. **UI Integration**:
   - Settings dialog accessible from the main UI
   - Apply settings in real-time with immediate feedback
4. **Appearance Options**:
   - Show/hide dock icon (macOS only)
   - Show/hide status bar icon (system tray)

Settings data structure:
```json
{
  "launchAtLogin": false,
  "hideOnLaunch": false,
  "showDockIcon": true,
  "showStatusBarIcon": true
}
```

### System Tray Integration

The system tray (status bar icon) is managed by `tray-service.js`:

1. **Platform-specific behavior**:
   - macOS: Single click to show app
   - Windows/Linux: Double-click to show app
2. **Tray Menu**:
   - Show Application - Restores and focuses the main window
   - Exit - Properly closes the application
3. **Platform-specific icon paths**:
   - Development mode vs. production mode path resolution
   - Fallback icon paths for different operating systems
4. **Minimizing to tray**:
   - App minimizes to tray when window is closed
   - Window can be restored from tray icon

### TOTP Authentication

Time-based One-Time Password (TOTP) authentication is implemented using:

1. **Client-side generation**: Browser Web Crypto API in `utils.js`
2. **Server-side generation**: Node.js crypto module in `node-utils.js`

The system supports:
- Standard 6-digit TOTP codes
- 30-second code rotation
- Secret keys in base32 format
- Custom parameters via `_TOTP_CODE(secret,period,digits)` syntax

Usage in HTTP requests:
- URLs: `https://api.example.com/auth?code=_TOTP_CODE`
- Headers: `Authorization: Bearer _TOTP_CODE`
- JSON body: `{"verification": {"code": "_TOTP_CODE"}}`
- Form body: `verification_code=_TOTP_CODE`

### Import/Export Functionality

Source configurations can be exported and imported via:

- **Export**: Save current sources to a JSON file using `sourceService.exportSources()`
- **Import**: Load sources from a JSON file using `sourceService.importSourcesFromFile()`

The exported JSON structure:

```json
[
  {
    "sourceType": "http",
    "sourcePath": "https://api.example.com/token",
    "sourceMethod": "GET",
    "requestOptions": {},
    "refreshOptions": { "interval": 5 },
    "jsonFilter": { "enabled": false, "path": "" },
    "totpSecret": "BASE32SECRET"
  }
]
```

### Headless Mode

Headless mode allows running without a UI via command-line arguments:

- `--headless`: Run without UI
- `--config <path>`: Load sources from a JSON configuration file
- `--dev`: Enable development tools for debugging

Implementation:
1. Command-line argument parsing in `main.js`
2. Conditional UI initialization based on mode
3. WebSocket server runs in both modes for extension communication

## Testing

### Manual Testing

1. Run the application in development mode:
   ```bash
   npm run dev
   ```

2. Test each source type:
   - Create a text file and set up a file source, then modify the file
   - Set an environment variable and create an env source
   - Create an HTTP source pointing to a test endpoint
   - Test TOTP generation with a test secret

3. Test application settings:
   - Enable/disable "Launch at login" and verify behavior on restart
   - Enable/disable "Hide window on startup" and verify behavior
   - Enable/disable "Show Dock icon" (macOS) and verify appearance
   - Enable/disable "Show Status Bar icon" and verify tray appearance

4. Test headless mode:
   ```bash
   npm start -- --headless --config ./test-sources.json
   ```

### Test Endpoints

For testing HTTP sources, use services like:
- [httpbin.org](https://httpbin.org/json) - Returns test JSON
- [jsonplaceholder.typicode.com](https://jsonplaceholder.typicode.com/posts) - Fake API for testing

## Building for Distribution

### Webpack Integration

This project uses Webpack to bundle and obfuscate the code before building for distribution. The build process:

1. **Bundling**: Webpack bundles all JavaScript files, applying obfuscation and minimization
2. **Packaging**: Electron-builder creates installers using the bundled code

### Production Build Scripts

Available npm scripts for building:

```bash
# Just bundle with webpack (without creating installers)
npm run webpack

# Bundle and create unpacked app
npm run build

# Bundle and create installers for current platform
npm run dist

# Platform-specific builds
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux

# Build for all platforms
npm run dist:all
```

### Build Configuration

The `package.json` file includes extensive build configuration for electron-builder:

```json
"build": {
  "appId": "io.openheaders",
  "productName": "Open Headers - Dynamic Sources",
  "directories": {
    "buildResources": "build",
    "output": "dist"
  },
  "files": [
    "dist-webpack/**/*"
  ],
  "extraResources": [
    {
      "from": "build",
      "to": "build",
      "filter": ["*.png", "*.ico", "*.icns"]
    },
    {
      "from": "src/ui/images",
      "to": "app.asar.unpacked/src/ui/images",
      "filter": ["*.png"]
    }
  ],
  "asarUnpack": [
    "src/ui/images/**/*"
  ],
  "mac": {
    "category": "public.app-category.utilities",
    "icon": "build/icon.icns",
    "extendInfo": {
      "CFBundleDisplayName": "Open Headers - Dynamic Sources",
      "CFBundleName": "Open Headers",
      "CFBundleIdentifier": "io.openheaders"
    }
  }
}
```

## Communication Protocol

The application communicates with the browser extension using WebSocket on port 59210.

### Message Format

Sources updates are broadcast in this format:

```json
{
  "type": "sourcesUpdated",
  "sources": [
    {
      "sourceId": 1,
      "sourceType": "http",
      "sourcePath": "https://api.example.com/token",
      "sourceTag": "API Token",
      "sourceMethod": "GET",
      "sourceContent": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshOptions": {
        "interval": 5,
        "lastRefresh": 1649152734000,
        "nextRefresh": 1649153034000
      }
    }
  ]
}
```

### Initial Connection

When a client connects, the server sends an initial state message:

```json
{
  "type": "sourcesInitial",
  "sources": [/* Array of all current sources */]
}
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Coding Standards

- Use ES6+ JavaScript features
- Document functions with descriptive comments
- Follow the existing code structure and naming conventions
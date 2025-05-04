# Open Headers - Developer Documentation

This document contains technical information for developers who want to contribute to the Open Headers Dynamic Sources application.

## 🏗️ Architecture

### 🧩 Components

The application consists of these main components:

- **Main Process**: The Electron main process that manages the application lifecycle and core services
- **Renderer Process**: React-based UI using Ant Design components
- **Preload Script**: Securely bridges the main and renderer processes with context isolation
- **React Contexts**: Manages global state for sources and settings
- **Custom Hooks**: Encapsulates business logic for file, HTTP, and environment operations
- **WebSocket Service**: Provides both WS and WSS connections for browser extension communication
- **Auto-Updater**: Manages application updates using electron-updater

### 📄 Key Files

| File | Description |
|--------|-------------|
| `main.js` | Application entry point and Electron main process |
| `preload.js` | Secure bridge between renderer and main process |
| `index.jsx` | React entry point for renderer process |
| `App.jsx` | Main React application component |
| `SourceContext.jsx` | React context for managing sources state |
| `SettingsContext.jsx` | React context for application settings |
| `WebSocketContext.jsx` | React context for WebSocket communication |
| `useFileSystem.jsx` | Custom hook for file operations |
| `useHttp.jsx` | Custom hook for HTTP operations |
| `useEnv.jsx` | Custom hook for environment variables |
| `ws-service.js` | WebSocket service for browser extension communication (WS and WSS) |
| `UpdateNotification.jsx` | React component for handling update notifications |
| `dev-app-update.yml` | Configuration for testing updates in development mode |
| `build.yml` | GitHub Actions workflow for CI/CD |
| `notarize.js` | Script for macOS app notarization |

### 🧪 React Components

| Component | Description |
|--------|-------------|
| `App.jsx` | Main application layout and navigation |
| `SourceForm.jsx` | Form for adding and editing sources |
| `SourceTable.jsx` | Table displaying all configured sources |
| `HttpOptions.jsx` | Configuration options for HTTP sources |
| `EditSourceModal.jsx` | Modal for editing HTTP sources after creation |
| `JsonFilter.jsx` | JSON path filtering options for HTTP sources |
| `TOTPOptions.jsx` | TOTP authentication configuration |
| `ContentViewer.jsx` | Modal for viewing source content |
| `SettingsModal.jsx` | Application settings dialog |
| `RefreshOptions.jsx` | Auto-refresh configuration for HTTP sources |
| `TrayMenu.jsx` | System tray integration component |
| `JsonViewer.jsx` | JSON visualization and filtering preview |
| `AboutModal.jsx` | Information about the app and extension links |
| `UpdateNotification.jsx` | Handles application update notifications and installation |

### 🔄 Data Flow

1. User configures sources in the React UI
2. React components dispatch actions to context providers
3. Context providers use IPC to communicate with main process via the preload bridge
4. Main process services process the requests
5. Updates flow back through IPC to React contexts
6. React components re-render based on updated context values

## 💻 Development Environment Setup

### 📋 Prerequisites

- [Node.js](https://nodejs.org/) 14.0 or higher
- [npm](https://www.npmjs.com/) 6.0 or higher
- [Electron](https://www.electronjs.org/) development environment

### 🚀 Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/OpenHeaders/open-headers-app.git
   cd open-headers-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development version with React hot-reload:
   ```bash
   npm run dev:react
   ```

### 📁 Project Structure

```
open-headers-app/
├── build/                # Build resources (icons, etc.)
│   ├── icon.png          # Application icon
│   ├── icon.ico          # Windows icon
│   └── icon.icns         # macOS icon
├── docs/                 # Documentation
│   ├── DEVELOPER.md      # This file
│   ├── CONTRIBUTING.md   # Contribution guidelines
│   └── PRIVACY.md        # Privacy policy
├── src/                  # Source code
│   ├── main.js           # Electron main process
│   ├── preload.js        # Electron preload script
│   ├── services/         # Backend services
│   │   └── ws-service.js # WebSocket service (WS & WSS)
│   ├── ui/               # Legacy UI assets (for reference)
│   └── renderer/         # React renderer process
│       ├── App.jsx       # Main React application
│       ├── App.less      # Application styles
│       ├── index.jsx     # React entry point
│       ├── index.html    # HTML template
│       ├── contexts/     # React contexts
│       │   ├── SourceContext.jsx
│       │   ├── SettingsContext.jsx
│       │   └── WebSocketContext.jsx
│       ├── components/   # React components
│       │   ├── ContentViewer.jsx
│       │   ├── EditSourceModal.jsx
│       │   ├── HttpOptions.jsx
│       │   ├── JsonFilter.jsx
│       │   ├── JsonViewer.jsx
│       │   ├── RefreshOptions.jsx
│       │   ├── SettingsModal.jsx
│       │   ├── SourceForm.jsx
│       │   ├── SourceTable.jsx
│       │   ├── TOTPOptions.jsx
│       │   ├── TrayMenu.jsx
│       │   ├── AboutModal.jsx
│       │   └── UpdateNotification.jsx
│       ├── hooks/        # Custom React hooks
│       │   ├── useEnv.jsx
│       │   ├── useFileSystem.jsx
│       │   └── useHttp.jsx
│       ├── utils/        # Utility functions
│       │   ├── messageUtil.jsx
│       │   └── MessageProvider.jsx
│       └── images/       # Application images
│           ├── icon32.png
│           └── icon128.png
├── scripts/              # Build and CI scripts
│   └── notarize.js       # macOS app notarization script
├── .github/workflows/    # GitHub Actions workflows
│   └── build.yml         # CI/CD workflow configuration
├── webpack.config.js     # Webpack configuration
├── package.json          # Project configuration
├── dev-app-update.yml    # Update configuration for development
└── electron-builder.yml  # Electron builder configuration
```

## 🔄 CI/CD Pipeline

The application uses GitHub Actions for Continuous Integration and Continuous Deployment (CI/CD). The workflow is defined in `.github/workflows/build.yml`.

### 🚀 Workflow Triggers

The CI/CD workflow is triggered by:
- Pushes to the `main` branch
- Pull requests targeting the `main` branch
- Tag pushes that start with 'v' (e.g., v2.4.24)

### 🏗️ Build Matrix

The workflow uses a build matrix to build the application on multiple platforms simultaneously:
- **macOS** (Latest)
- **Windows** (Latest)
- **Ubuntu** (Latest)

### 📦 Build Process

For each platform, the workflow:

1. Checks out the code with full history
2. Sets up Node.js v22
3. Creates platform-specific Electron cache directories
4. Caches Electron and electron-builder dependencies
5. Installs npm dependencies
6. Builds the webpack bundle
7. Builds platform-specific application packages
8. Organizes artifacts for release

#### macOS-specific Steps:

When building on macOS:
- For tagged releases, it imports code signing certificates from repository secrets
- It runs code signing and notarization (unless skipped with `SKIP_NOTARIZATION=true`)

### 📢 Release Creation

For tagged commits (starting with 'v'), the workflow:

1. Downloads all artifacts from the build jobs
2. Processes artifacts for release
3. Generates a release body with download links
4. Creates a GitHub release with all platform packages
5. Attaches release notes with download links

### 🔐 Required Secrets for Builds

For full functionality, the following repository secrets should be configured:

**For Code Signing and Notarization (macOS):**
- `APPLE_ID`: Apple Developer Account email
- `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password for your Apple ID
- `APPLE_TEAM_ID`: Apple Developer Team ID
- `MACOS_CERTIFICATE`: Base64-encoded .p12 certificate file
- `MACOS_CERTIFICATE_PWD`: Password for the certificate file
- `KEYCHAIN_PASSWORD`: Password for the temporary keychain

**General:**
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions for release creation

## 🔏 macOS Notarization

### 📜 Overview

macOS notarization is an Apple security process that verifies your application is free of malware. Starting with macOS Catalina (10.15), applications must be notarized to run without security warnings.

### 🛠️ Implementation

The notarization process is implemented in `scripts/notarize.js` and is executed by electron-builder through the `afterSign` hook in `package.json`.

```javascript
// package.json
{
  "build": {
    // ...
    "afterSign": "./scripts/notarize.js",
    // ...
  }
}
```

### 🔄 Notarization Process

The notarization script:

1. **Detects Platform**: Checks if the build is running on macOS
2. **Checks Environment Variables**: Verifies required Apple credentials are available
3. **Prepares App**: Gets the app bundle path and identifier
4. **Submits to Apple**: Uploads the app to Apple's notary service
5. **Waits for Approval**: Waits for Apple to complete the notarization process
6. **Staples Ticket**: Attaches the notarization ticket to the app bundle

### ⏭️ Skipping Notarization

Notarization can be skipped by setting the `SKIP_NOTARIZATION` environment variable to `true`. This is useful for development builds or when Apple credentials are not available.

You can use the dedicated build script that skips notarization:
```bash
npm run dist:mac:skip-notarize
```

### 🔐 Required Environment Variables

For notarization to succeed, these environment variables must be set:

- `APPLE_ID`: Your Apple Developer Account email
- `APPLE_APP_SPECIFIC_PASSWORD`: An app-specific password for your Apple ID
- `APPLE_TEAM_ID`: Your Apple Developer Team ID

You can add these to your `.env` file locally, or configure them as repository secrets for GitHub Actions.

### 🧪 Testing Notarization Locally

To test notarization locally:

1. Create a `.env` file with your Apple credentials
2. Run the macOS build
   ```bash
   npm run dist:mac
   ```

## 🎨 Ant Design Integration

The application UI is built using [Ant Design](https://ant.design/), a React UI library with a clean, professional aesthetic. Key aspects of the implementation include:

### 🎭 Theme Customization

The Ant Design theme is customized in webpack.config.js to provide an Apple-inspired look and feel:

```javascript
{
  '@primary-color': '#0071e3',
  '@link-color': '#0071e3',
  '@success-color': '#34c759',
  '@warning-color': '#ff9f0a',
  '@error-color': '#ff3b30',
  '@font-size-base': '14px',
  '@heading-color': '#1d1d1f',
  '@text-color': '#1d1d1f',
  '@text-color-secondary': '#86868b',
  '@disabled-color': '#d2d2d7',
  '@border-radius-base': '6px',
  '@border-color-base': '#d2d2d7',
  '@box-shadow-base': '0 1px 2px rgba(0, 0, 0, 0.08)',
  '@font-family': '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif'
}
```

The theme is applied through the `ConfigProvider` component in `index.jsx`:

```jsx
<ConfigProvider
  theme={{
    token: {
      colorPrimary: '#0071e3',
      colorSuccess: '#34c759',
      colorWarning: '#ff9f0a',
      colorError: '#ff3b30',
      colorInfo: '#0071e3',
      borderRadius: 6,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
    },
  }}
>
  <SettingsProvider>
    <SourceProvider>
      <App />
    </SourceProvider>
  </SettingsProvider>
</ConfigProvider>
```

### 🧱 Component Structure

The UI is composed of reusable components:

1. **Layout Components**: App-wide structure using Ant Design's Layout
2. **Form Components**: Using Ant Design's Form, Input, Select, etc.
3. **Data Display Components**: Using Ant Design's Table, Card, etc.
4. **Feedback Components**: Using Ant Design's Modal, message, etc.

### 🪝 React Hooks and Context API

The application uses React's Context API and custom hooks to manage state:

1. **SourceContext**: Manages the state of all sources, including CRUD operations
2. **SettingsContext**: Manages application settings
3. **WebSocketContext**: Manages WebSocket communication with browser extension
4. **Custom Hooks**: Encapsulate complex behavior for file operations, HTTP requests, etc.

## 🔋 Feature Implementation Details

### 🔄 Automatic Updates

The application uses electron-updater to provide automatic updates:

1. **Main Process Integration**: Updates are managed in the main process through `setupAutoUpdater()`:
   - Configuration of electron-updater with proper logging
   - Event listeners for update lifecycle events
   - Initial update check on startup
   - Periodic update checks (every 6 hours)

2. **User Interface Components**:
   - `UpdateNotification.jsx`: React component for handling update notifications and progress
   - Notification system for update events (available, progress, downloaded, error)
   - Modal dialog for update installation

3. **IPC Communication**:
   - Preload script exposes update-related functions to the renderer process
   - Bidirectional communication for update checks and status
   - Event-based system for update notifications

Implementation details:
- Updates are published to GitHub Releases
- The app checks for updates on startup and every 6 hours
- Update checks can be manually triggered from the UI
- Download progress is displayed to the user
- A notification is shown when an update is ready to install
- The user can choose to install immediately or later

The update configuration is defined in package.json under the `build.publish` section:
```json
{
  "publish": {
    "provider": "github",
    "owner": "OpenHeaders",
    "repo": "open-headers-app"
  }
}
```

The main update workflow:
1. Application checks for updates via GitHub releases
2. If an update is available, it's downloaded automatically
3. When download completes, a notification appears
4. User can install the update with one click
5. The application will restart with the new version

For development and testing of updates:
- Use `process.env.NODE_ENV === 'development'` to force update checks in dev mode
- Set `autoUpdater.forceDevUpdateConfig = true` to test updates in development
- The `dev-app-update.yml` file contains GitHub repo information for dev testing

### 🚀 Build Scripts and Release Process

The application provides a comprehensive set of build scripts in `package.json`:

#### Production Builds

```bash
# Build for current platform with default options
npm run dist

# Platform-specific builds
npm run dist:mac          # macOS (universal)
npm run dist:win          # Windows
npm run dist:linux        # Linux (AppImage + deb)
npm run dist:linux:deb    # Linux deb package only
npm run dist:linux:deb:x64    # Linux deb package x64 only
npm run dist:linux:deb:arm64  # Linux deb package ARM64 only

# Cross-platform build
npm run dist:all          # macOS, Windows, Linux (x64 + ARM64)

# Skip code signing/notarization
npm run dist:mac:skip-notarize  # macOS build without notarization
npm run dist:mac:skip-publish   # macOS build without publishing
npm run dist:win:skip-publish   # Windows build without publishing
npm run dist:linux:skip-publish # Linux build without publishing
```

#### Publishing to GitHub

```bash
# Publish to GitHub releases with auto-version
npm run publish:mac      # Publish macOS builds
npm run publish:win      # Publish Windows builds
npm run publish:linux    # Publish Linux builds
npm run publish:all      # Publish all platform builds
```

#### Development and Testing

```bash
# Start in development mode with hot reload
npm run dev:react

# Build in development mode
npm run dist:dev
```

### 📦 Packaging Configuration

The application's packaging configuration is defined in `package.json` under the `build` section:

```json
"build": {
  "appId": "io.openheaders",
  "productName": "OpenHeaders",
  "directories": {
    "buildResources": "build",
    "output": "dist"
  },
  "files": [
    "dist-webpack/**/*"
  ],
  "asar": true,
  "compression": "maximum",
  "afterSign": "./scripts/notarize.js",
  "extraResources": [
    {
      "from": "build",
      "to": ".",
      "filter": [
        "*.png",
        "*.ico"
      ]
    },
    {
      "from": "src/renderer/images",
      "to": "images",
      "filter": [
        "*.png"
      ]
    }
  ],
  "asarUnpack": [
    "dist-webpack/renderer/images/**/*"
  ],
  "npmRebuild": false,
  "nodeGypRebuild": false,
  "extends": null,
  "removePackageScripts": true,
  "mac": {
    "category": "public.app-category.developer-tools",
    "icon": "build/icon.icns",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist",
    "type": "distribution",
    "notarize": false,
    "target": [
      {
        "target": "dmg",
        "arch": ["x64", "arm64"]
      },
      {
        "target": "zip",
        "arch": ["x64", "arm64"]
      }
    ]
  },
  "win": {
    "target": "nsis",
    "icon": "build/icon.ico"
  },
  "linux": {
    "target": [
      "deb",
      "AppImage"
    ],
    "icon": "build/icon.png",
    "category": "Utility;Development;Network"
  },
  "publish": {
    "provider": "github",
    "owner": "OpenHeaders",
    "repo": "open-headers-app"
  }
}
```

### ⚙️ Settings and Preferences

Application settings are managed through the React SettingsContext:

1. **Storage**: Settings are saved to a JSON file in the app's user data directory
2. **UI Integration**: Settings dialog built with Ant Design's Modal and Form components
3. **Context API**: React components access settings through SettingsContext provider
4. **Two-way Sync**: Changes in UI propagate to main process and vice versa

Settings data structure:
```json
{
  "launchAtLogin": false,
  "hideOnLaunch": false,
  "showDockIcon": true,
  "showStatusBarIcon": true
}
```

### 🔔 System Tray Integration

The system tray (status bar icon) is managed through the Electron main process and exposed to React via the TrayMenu component:

1. **React Integration**: TrayMenu component registers event listeners via the preload bridge
2. **Platform Adaptations**: Different behavior for macOS, Windows, and Linux
3. **Context Menu**: Created dynamically based on current application state
4. **Icon Management**: Adaptive icon loading for different environments

Implementation details from the code:
- Icon resolution is adjusted based on platform (16x16 for most platforms)
- For macOS, the icon is set as a template icon for better Dark Mode support
- The tray menu is built with dynamic options based on the application state
- Window show/hide state is managed through IPC messages

Code snippet from `main.js`:
```javascript
// Create the tray with the icon
tray = new Tray(trayIcon);

// Set proper tooltip
tray.setToolTip('Open Headers');

// Create context menu
const contextMenu = Menu.buildFromTemplate([
    {
        label: 'Show Open Headers',
        click: () => {
            if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
                mainWindow.webContents.send('showApp');
            }
        }
    },
    // ... other menu items
]);

// Set the context menu
tray.setContextMenu(contextMenu);
```

### 🌐 WebSocket Service for Browser Extension

The WebSocket service provides communication with the browser extension:

1. **Dual Protocol Support**: WS (WebSocket) for Chrome/Edge on port 59210 and WSS (WebSocket Secure) for Firefox on port 59211
2. **Self-Signed Certificates**: Generated automatically for WSS connection
3. **Security Measures**: Binds to localhost only, certificate verification page
4. **Real-time Updates**: Broadcasts source changes to connected extensions

Implementation details:
- Main process manages WebSocket servers
- SSL certificates are generated on first run using OpenSSL
- All communication is limited to localhost (127.0.0.1)
- Browser extension can connect to either WS or WSS endpoint

The WebSocket server has multiple communication channels:
- Initial source data on connection
- Updates when sources change
- Client-initiated requests for refreshed data

### 📂 Cross-Platform File Watching

File sources use a polling-based file watching mechanism:

1. **Chokidar Library**: Uses the chokidar library with polling configuration for cross-platform compatibility
2. **Event Handlers**: IPC messages notify the renderer process when file content changes
3. **Cleanup Management**: Proper cleanup of watchers when sources are removed or the app is closed

### 🔍 JSON Filtering

The JSON filtering functionality allows extracting specific data from HTTP responses:

1. **Path-based Access**: Uses dot notation to navigate nested objects and arrays
2. **UI Integration**: Controls in `JsonFilter.jsx` component
3. **Flexible Parsing**: Supports various JSON structures, including arrays and deeply nested objects
4. **Error Handling**: Graceful handling of invalid paths or non-JSON content

## 🧪 Testing and Debugging

### 🔍 Debug Logging

The application uses electron-log for comprehensive logging:

```javascript
// main.js
const log = require('electron-log');
log.transports.file.level = 'info';
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
```

Log files are stored at:
- **macOS**: `~/Library/Logs/OpenHeaders/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\OpenHeaders\logs\main.log`
- **Linux**: `~/.config/OpenHeaders/logs/main.log`

### 🛠️ Development Mode

Running the app in development mode:
```bash
npm run dev:react
```

This:
- Enables hot reloading of React components
- Opens Chrome DevTools automatically
- Disables production optimizations
- Uses development webpack configuration

### 🔄 Testing Auto-Updates

The `dev-app-update.yml` file configures update testing in development:

```yaml
provider: github
owner: OpenHeaders
repo: open-headers-app
```

To test updates:
1. Change this file to point to your fork
2. Increase the version in `package.json`
3. Create a release in your fork
4. Run the app with the `--dev` flag

The app will check for updates from your fork's releases instead of the main repository.

## 📋 Future Development and Improvements

### 🚀 Build and CI/CD Enhancements

Potential improvements to the build and CI/CD process:

1. **Automated Versioning**: Implement semantic versioning based on commit messages
2. **Code Quality Checks**: Add automated linting and testing in the CI pipeline
3. **Platform-specific Optimizations**: Tailor builds more specifically to each platform
4. **Code Signing for Windows**: Add Windows code signing to the CI process
5. **Artifact Caching**: Improve caching strategies for faster builds
6. **Docker-based Builds**: Use Docker containers for consistent build environments
7. **Preview Builds**: Generate preview builds for pull requests
8. **Test Coverage Reporting**: Add test coverage analysis to the CI pipeline

### 🧪 Contributing to the Codebase

When contributing to the Open Headers application:

1. **Fork the Repository**: Create your own fork to work on
2. **Create a Feature Branch**: Work on a feature-specific branch 
3. **Follow Code Style**: Match the existing code style and patterns
4. **Add Tests**: Include appropriate tests for your changes
5. **Document Changes**: Update documentation to reflect your changes
6. **Create Pull Request**: Submit your changes for review

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed contribution guidelines.

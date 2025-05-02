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

## 💻 Development

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
├── webpack.config.js     # Webpack configuration
├── package.json          # Project configuration
├── dev-app-update.yml    # Update configuration for development
└── electron-builder.yml  # Electron builder configuration
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

### 🌐 WebSocket Service for Browser Extension

The WebSocket service provides communication with the browser extension:

1. **Dual Protocol Support**: WS (WebSocket) for Chrome/Edge on port 59210 and WSS (WebSocket Secure) for Firefox on port 59211
2. **Self-Signed Certificates**: Generated automatically for WSS connection
3. **Security Measures**: Binds to localhost only, certificate verification page
4. **Real-time Updates**: Broadcasts source changes to connected extensions

Implementation details:
- Main process manages WebSocket servers
- SSL certificates are generated on first run
- All communication is limited to localhost
- Browser extension can connect to either WS or WSS endpoint

### 📁 Cross-Platform File Watching

File watching is implemented using chokidar with consistent behavior across all platforms:

1. **Consistent Polling**: Uses polling strategy for all platforms (macOS, Windows, Linux)
2. **Fallback Mechanism**: If chokidar fails, falls back to basic interval-based polling
3. **Resource Management**: Proper cleanup of watchers when application exits
4. **Event Propagation**: File change events flow through IPC to React components

Implementation details:
- Chokidar initialized with `usePolling: true` for cross-platform consistency
- Watch options include `stabilityThreshold` to handle rapid changes
- Fallback polling uses basic interval mechanism if native watching fails

### 🔐 TOTP Authentication

Time-based One-Time Password (TOTP) authentication implemented with TOTPOptions component:

1. **UI Integration**: Clean Ant Design form with live preview
2. **Time Sync**: Ability to adjust time offset for misaligned clocks
3. **Live Countdown**: Visual timer showing seconds until code rotation
4. **Template Variables**: `_TOTP_CODE` used in HTTP requests to insert codes dynamically

Implementation details:
- TOTP generation is handled in the preload script using WebCrypto API
- The component provides real-time validation and preview
- Time synchronization helps when client and server clocks are misaligned

### 🌐 HTTP Source Editing

The application allows for comprehensive editing of HTTP sources after creation:

1. **EditSourceModal Component**: Provides a complete interface for editing all HTTP source properties
2. **State Persistence**: Form values are preserved when toggling features on/off
3. **TOTP Integration**: Full support for adding/editing TOTP authentication settings
4. **JSON Filtering**: Can enable/disable and modify JSON filtering rules
5. **Request Parameters**: Comprehensive editing of headers, query parameters, and body content
6. **Refresh Options**: Configure or modify auto-refresh scheduling
7. **Immediate Refresh**: Option to refresh the source immediately after saving changes

Implementation details:
- Custom form state persistence logic maintains values even when fields are conditionally rendered
- TOTP settings are properly stored and retrieved using imperative handling via refs
- Synchronization between form state and component state ensures consistent updates
- Careful timing management for refresh operations ensures UI feedback is accurate and responsive

### 🔍 Dynamic HTTP Sources with JSON Filtering

HTTP sources with JSON path filtering are implemented using:

1. **HttpOptions Component**: Configures request details with tabbed interface
2. **JsonFilter Component**: Specifies how to extract values from JSON responses
3. **Preview System**: Tests filters and displays results in real-time
4. **Error Handling**: Graceful error handling with user feedback

### 🧠 React Context for Source Management

The SourceContext provider is the central state management solution:

1. **CRUD Operations**: Exposes methods for creating, reading, updating, and deleting sources
2. **IPC Bridge**: Communicates with Electron main process via the preload script
3. **Caching**: Maintains local state to improve UI responsiveness
4. **Validation**: Ensures data integrity before persistence
5. **Real-time Updates**: Ensures UI reflects the current state of sources

## 🧪 Testing

### 🔄 Manual Testing

1. Run the application in development mode:
   ```bash
   npm run dev:react
   ```

2. Test each source type:
   - Create a text file and set up a file source, then modify the file
   - Set an environment variable and create an env source
   - Create an HTTP source pointing to a test endpoint
   - Test TOTP generation with a test secret

3. Test UI interactions:
   - Verify all forms function correctly
   - Check responsive layout at different window sizes
   - Verify modal interactions work as expected
   - Test keyboard shortcuts and accessibility

4. Test application settings:
   - Enable/disable "Launch at login" and verify behavior on restart
   - Enable/disable "Hide window on startup" and verify behavior
   - Enable/disable "Show Dock icon" (macOS) and verify appearance
   - Enable/disable "Show tray icon" and verify tray appearance

5. Test automatic updates:
   - Use `dev-app-update.yml` for testing updates in development
   - Create test releases on your fork to trigger update checks
   - Verify update notification, download progress, and installation flow

### 🌐 Test Endpoints

For testing HTTP sources, use services like:
- [httpbin.org](https://httpbin.org/json) - Returns test JSON
- [jsonplaceholder.typicode.com](https://jsonplaceholder.typicode.com/posts) - Fake API for testing

### 🦊 Firefox Extension Testing

For testing with Firefox extension:
1. Launch the application, which will start both WS and WSS servers
2. Install the Firefox extension
3. The extension will automatically connect via WSS (port 59211)
4. Verify in the extension that dynamic sources are available
5. Test adding and using dynamic sources in header rules

## 📦 Building for Distribution

### 🔄 Webpack and React Build Process

This project uses Webpack to bundle React components and other assets:

1. **React Bundling**: JSX transpilation and component bundling
2. **Less Compilation**: Processing Ant Design styles
3. **Asset Management**: Copying static assets to distribution folder
4. **Code Optimization**: Minification for production builds

The webpack configuration handles three main targets:
- Main process (Electron main)
- Preload script (Electron preload)
- Renderer process (React application)

### 📋 Production Build Scripts

Available npm scripts for building:

```bash
# Development with React hot reload
npm run dev:react

# Just bundle with webpack (without creating installers)
npm run webpack

# Bundle and create unpacked app
npm run build

# Bundle and create installers for current platform
npm run dist

# Platform-specific builds
npm run dist:mac      # macOS only
npm run dist:win      # Windows only
npm run dist:linux    # Linux only (AppImage and DEB)

# Linux-specific builds
npm run dist:linux:deb        # Linux DEB package (x64 and arm64)
npm run dist:linux:deb:x64    # Linux DEB package (x64 only)
npm run dist:linux:deb:arm64  # Linux DEB package (arm64 only)

# Build for all platforms
npm run dist:all      # All platforms (macOS, Windows, Linux)

# Build and publish to GitHub releases
npm run publish:mac     # Publish macOS build
npm run publish:win     # Publish Windows build
npm run publish:linux   # Publish Linux build
npm run publish:all     # Publish all platforms
```

### 🚀 Publishing Updates

For publishing updates to GitHub releases:

1. Update version in `package.json`
2. Make necessary changes and ensure they work correctly
3. Build and publish using the appropriate script:
   ```bash
   npm run publish:all  # For all platforms
   ```
   or for specific platforms:
   ```bash
   npm run publish:mac
   npm run publish:win
   npm run publish:linux
   ```

The `electron-builder` utility will:
1. Build the application for the specified platforms
2. Create installers
3. Upload the assets to GitHub releases
4. Tag the release with the version from package.json

### 📱 Platform-Specific Configuration

The `package.json` file includes platform-specific build settings:

1. **Windows (NSIS installer):**
   - Icon and artifact naming
   - One-click installer

2. **macOS (DMG):**
   - App category and bundle info
   - Universal binary (x64 and arm64)
   - DMG layout configuration

3. **Linux (AppImage and DEB):**
   - Desktop entry configuration
   - Package dependencies
   - Icon and artifact naming

## 🔧 Technical Deep Dives

### 📂 Dynamic Content Sourcing

The application's core feature is retrieving dynamic content from different sources:

1. **File Sources**:
   - Monitors local files using chokidar
   - Optimized for cross-platform consistency
   - Updates content in real-time as file changes

2. **Environment Variables**:
   - Retrieves values from environment variables
   - Secure integration with Electron main process
   - Provides fallback messages for missing variables

3. **HTTP Sources**:
   - Configurable HTTP requests with customizable options
   - Support for various content types and request methods
   - JSON filtering for extracting specific data
   - Auto-refresh for keeping data current
   - TOTP authentication for secure API access

### 🔐 Security Considerations

Security measures implemented in the application:

1. **Context Isolation**: Strict separation between main and renderer processes
2. **Content Security Policy**: Restrictive CSP headers
3. **localhost Binding**: WebSocket servers bound to 127.0.0.1 only
4. **Input Validation**: Validation of all user inputs
5. **Secure Storage**: Application data stored in user-specific directories
6. **Update Verification**: Updates verified through code signing

### 🏛️ Architecture Details

The application follows these architectural principles:

1. **Separation of Concerns**: Distinct layers for UI, business logic, and data
2. **Component-Based Design**: Reusable components with clear responsibilities
3. **Context-Based State Management**: Global state handled through contexts
4. **Custom Hooks for Logic**: Business logic encapsulated in hooks
5. **IPC for Cross-Process Communication**: Secure communication between processes
6. **Event-Driven Updates**: Real-time updates based on events
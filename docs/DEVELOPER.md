# Open Headers - Developer Documentation

This document contains technical information for developers who want to contribute to the Open Headers Dynamic Sources application.

## Architecture

### Components

The application consists of these main components:

- **Main Process**: The Electron main process that manages the application lifecycle and core services
- **Renderer Process**: React-based UI using Ant Design components
- **WebSocket Server**: Broadcasts source updates to connected clients
- **Source Services**:
  - File Service: Monitors file system changes
  - Environment Service: Accesses environment variables
  - HTTP Service: Makes HTTP requests and processes responses
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
| `App.jsx` | Main React application component |
| `SourceContext.jsx` | React context for managing sources state |
| `SettingsContext.jsx` | React context for application settings |
| `useFileSystem.jsx` | Custom hook for file operations |
| `useHttp.jsx` | Custom hook for HTTP operations |
| `useEnv.jsx` | Custom hook for environment variables |

### React Components

| Component | Description |
|--------|-------------|
| `App.jsx` | Main application layout and routing |
| `SourceForm.jsx` | Form for adding and editing sources |
| `SourceTable.jsx` | Table displaying all configured sources |
| `HttpOptions.jsx` | Configuration options for HTTP sources |
| `JsonFilter.jsx` | JSON path filtering options for HTTP sources |
| `TOTPOptions.jsx` | TOTP authentication configuration |
| `ContentViewer.jsx` | Modal for viewing source content |
| `SettingsModal.jsx` | Application settings dialog |
| `RefreshOptions.jsx` | Auto-refresh configuration for HTTP sources |
| `TrayMenu.jsx` | System tray integration component |

### Data Flow

1. User configures sources in the React UI
2. React components dispatch actions to context providers
3. Context providers use IPC to communicate with main process
4. Main process services process the requests
5. Updates flow back through IPC to the React UI
6. WebSocket server broadcasts source updates to connected browser extensions

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
   npm run dev:react
   ```

### Project Structure

```
open-headers-app/
├── src/
│   ├── contexts/          # React contexts
│   │   ├── SourceContext.jsx
│   │   └── SettingsContext.jsx
│   ├── components/        # React components
│   │   ├── SourceForm.jsx
│   │   ├── SourceTable.jsx
│   │   ├── HttpOptions.jsx
│   │   ├── JsonFilter.jsx
│   │   ├── TOTPOptions.jsx
│   │   ├── ContentViewer.jsx
│   │   ├── SettingsModal.jsx
│   │   └── RefreshOptions.jsx
│   ├── hooks/             # Custom React hooks
│   │   ├── useFileSystem.jsx
│   │   ├── useHttp.jsx
│   │   └── useEnv.jsx
│   ├── config/            # Application configuration
│   │   └── app-config.js  # App settings
│   ├── controllers/       # Electron main process controllers
│   │   ├── source-controller.js 
│   │   ├── settings-controller.js
│   │   └── ws-controller.js
│   ├── models/            # Data models
│   │   └── source.js      # Source data model
│   ├── repositories/      # Data persistence
│   │   └── source-repository.js
│   ├── services/          # Core services
│   │   ├── source-service.js
│   │   ├── file-service.js
│   │   ├── env-service.js
│   │   ├── http-service.js
│   │   └── tray-service.js
│   ├── utils/             # Utility functions
│   │   └── node-utils.js  # Node.js specific utilities
│   ├── ui/                # Legacy UI (for reference)
│   ├── preload/           # Electron preload scripts
│   │   └── preload.js
│   ├── main.js            # Electron main process entry point
│   └── renderer/          # React renderer process
│       ├── App.jsx        # Main React application
│       ├── App.less       # Ant Design styles
│       ├── index.jsx      # React entry point
│       └── index.html     # HTML template
├── build/                 # Build resources
│   ├── icon.png           # Application icon
│   ├── icon.ico           # Windows icon
│   └── icon.icns          # macOS icon
├── webpack.config.js      # Webpack configuration
└── docs/                  # Documentation
    ├── DEVELOPER.md       # This file
    ├── CONTRIBUTING.md    # Contribution guidelines
    └── PRIVACY.md         # Privacy policy
```

## Ant Design Integration

The application UI is built using [Ant Design](https://ant.design/), a React UI library with a clean, professional aesthetic. Key aspects of the implementation include:

### Theme Customization

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

### Component Structure

The UI is composed of reusable components:

1. **Layout Components**: App-wide structure using Ant Design's Layout
2. **Form Components**: Using Ant Design's Form, Input, Select, etc.
3. **Data Display Components**: Using Ant Design's Table, Card, etc.
4. **Feedback Components**: Using Ant Design's Modal, message, etc.

### React Hooks and Context API

The application uses React's Context API and custom hooks to manage state:

1. **SourceContext**: Manages the state of all sources, including CRUD operations
2. **SettingsContext**: Manages application settings
3. **Custom Hooks**: Encapsulate complex behavior for file operations, HTTP requests, etc.

## Feature Implementation Details

### Settings and Preferences

Application settings are managed through the React SettingsContext and Electron settings-controller.js:

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

### System Tray Integration

The system tray (status bar icon) is managed by tray-service.js and exposed to React:

1. **React Integration**: TrayMenu component registers event listeners via IPC
2. **Platform Adaptations**: Different behavior for macOS, Windows, and Linux
3. **Context Menu**: Created dynamically based on current application state
4. **Icon Management**: Adaptive icon loading for different environments

### TOTP Authentication

Time-based One-Time Password (TOTP) authentication implemented with TOTPOptions component:

1. **UI Integration**: Clean Ant Design form with live preview
2. **Time Sync**: Ability to adjust time offset for misaligned clocks
3. **Live Countdown**: Visual timer showing seconds until code rotation
4. **Template Variables**: `_TOTP_CODE` used in HTTP requests to insert codes dynamically

### Dynamic HTTP Sources with JSON Filtering

HTTP sources with JSON path filtering are implemented using:

1. **HttpOptions Component**: Configures request details with tabbed interface
2. **JsonFilter Component**: Specifies how to extract values from JSON responses
3. **Preview System**: Tests filters and displays results in real-time
4. **Error Handling**: Graceful error handling with user feedback

### React Context for Source Management

The SourceContext provider is the central state management solution:

1. **CRUD Operations**: Exposes methods for creating, reading, updating, and deleting sources
2. **IPC Bridge**: Communicates with Electron main process
3. **Caching**: Maintains local state to improve UI responsiveness
4. **Validation**: Ensures data integrity before persistence
5. **Real-time Updates**: Ensures UI reflects the current state of sources

## Testing

### Manual Testing

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
   - Enable/disable "Show Status Bar icon" and verify tray appearance

5. Test headless mode:
   ```bash
   npm start -- --headless --config ./test-sources.json
   ```

### Test Endpoints

For testing HTTP sources, use services like:
- [httpbin.org](https://httpbin.org/json) - Returns test JSON
- [jsonplaceholder.typicode.com](https://jsonplaceholder.typicode.com/posts) - Fake API for testing

## Building for Distribution

### Webpack and React Build Process

This project uses Webpack to bundle React components and other assets:

1. **React Bundling**: JSX transpilation and component bundling
2. **Less Compilation**: Processing Ant Design styles
3. **Asset Management**: Copying static assets to distribution folder
4. **Code Optimization**: Minification for production builds

### Production Build Scripts

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
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux

# Build for all platforms
npm run dist:all
```

### Electron Builder Configuration

The `package.json` includes extensive configuration for electron-builder:

```json
"build": {
  "appId": "io.openheaders",
  "productName": "Open Headers",
  "directories": {
    "buildResources": "build",
    "output": "dist"
  },
  "files": [
    "dist-webpack/**/*"
  ],
  "mac": {
    "category": "public.app-category.utilities",
    "icon": "build/icon.icns",
    "target": {
      "target": "dmg",
      "arch": [
        "x64",
        "arm64"
      ]
    }
  }
}
```

## Communication Protocol

The application communicates with the browser extension using WebSocket on port 59210.

### Message Format

Source updates are broadcast in this format:

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

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

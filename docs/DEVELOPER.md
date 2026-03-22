# Open Headers - Developer Documentation

This document contains technical information for developers who want to contribute to the Open Headers Dynamic Sources
application.

## Architecture

### Components

The application consists of these main components:

- **Main Process** (`src/main.ts`): Electron main process — app lifecycle, IPC handlers, services
- **Renderer Process** (`src/renderer/`): React + Ant Design UI with context providers and custom hooks
- **Preload Script** (`src/preload.ts`): Secure bridge between main and renderer with context isolation
- **Shared Services** (`src/services/`): Backend services (proxy, WebSocket, git sync, CLI API, video, network)
- **Shared Types** (`src/types/`): TypeScript type definitions shared across all processes

### Key Files

| File                        | Description                                       |
|-----------------------------|---------------------------------------------------|
| `src/main.ts`               | Application entry point and Electron main process |
| `src/preload.ts`            | Secure bridge between renderer and main process   |
| `src/renderer/index.tsx`    | React entry point                                 |
| `src/renderer/App.tsx`      | Main React application component                  |
| `src/types/global.d.ts`     | ElectronAPI type definitions (IPC bridge)         |
| `src/types/ipc-channels.ts` | IPC channel constants (invoke, send, push)        |
| `src/types/source.ts`       | Source type definitions                           |
| `src/types/settings.ts`     | AppSettings type                                  |
| `src/types/workspace.ts`    | Workspace and git sync types                      |
| `src/types/environment.ts`  | Environment variable types                        |
| `electron.vite.config.ts`   | Build configuration (main, preload, renderer)     |
| `vitest.config.ts`          | Test configuration                                |
| `playwright.config.ts`      | E2E test configuration                            |

### Main Process Modules

| Module                           | Description                                                        |
|----------------------------------|--------------------------------------------------------------------|
| `src/main/modules/ipc/handlers/` | IPC request handlers (workspace, proxy, settings, recording, etc.) |
| `src/main/modules/protocol/`     | `openheaders://` protocol handler (team invites, env config)       |
| `src/main/modules/tray/`         | System tray integration                                            |
| `src/main/modules/updater/`      | Auto-updater with electron-updater                                 |
| `src/main/modules/window/`       | Window management                                                  |

### Services

| Service                   | Description                                                |
|---------------------------|------------------------------------------------------------|
| `src/services/proxy/`     | HTTP proxy with header injection, caching, domain matching |
| `src/services/websocket/` | WS/WSS servers for browser extension communication         |
| `src/services/workspace/` | Git-based team workspace sync                              |
| `src/services/cli/`       | REST API for CLI tool integration                          |
| `src/services/network/`   | Network state monitoring (online/offline, VPN detection)   |
| `src/services/video/`     | Video capture, FFmpeg conversion, export                   |
| `src/services/core/`      | App state machine, service registry, time management       |

### Renderer Architecture

| Directory                  | Description                                                             |
|----------------------------|-------------------------------------------------------------------------|
| `src/renderer/contexts/`   | React contexts (core, data, services, ui)                               |
| `src/renderer/components/` | UI components organized by feature area                                 |
| `src/renderer/hooks/`      | Custom hooks (app, environment, sources, workspace)                     |
| `src/renderer/services/`   | Renderer-side services (refresh, export-import, environment, workspace) |
| `src/renderer/utils/`      | Utilities (validation, formatting, data structures, error handling)     |

### UI Tabs

The app has 6 main tabs:

1. **Workflows** — Session recording playback
2. **Rules** — Header, payload, URL, scripts/CSS, and more rules (sub-tabs)
3. **Sources** — HTTP, file, and environment variable sources
4. **Environments** — Environment variable management with secret support
5. **Workspaces** — Personal and team workspaces with git sync
6. **Server Config** — WebSocket, proxy, and CLI server configuration (sub-tabs)

### Data Flow

1. User configures sources/rules in the React UI
2. React components dispatch through context providers
3. Context providers use IPC to communicate with main process via the preload bridge
4. Main process services process the requests
5. Updates flow back through IPC to React contexts
6. WebSocket service broadcasts changes to connected browser extensions

## Development Environment Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 22.x or higher
- [npm](https://www.npmjs.com/) 10.x or higher
- [Git](https://git-scm.com/)

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

3. Start the development version with hot-reload:
   ```bash
   npm run dev
   ```

### Project Structure

```
open-headers-app/
├── build/                      # Build resources (icons, entitlements)
├── docs/                       # Documentation
├── src/                        # Source code (476 files, 100% TypeScript)
│   ├── main.ts                 # Electron main process entry
│   ├── preload.ts              # Preload script entry
│   ├── config/                 # App configuration
│   ├── types/                  # Shared type definitions
│   │   ├── global.d.ts         # ElectronAPI bridge types
│   │   ├── ipc-channels.ts     # IPC channel constants
│   │   ├── source.ts           # Source types
│   │   ├── settings.ts         # AppSettings
│   │   ├── workspace.ts        # Workspace types
│   │   ├── environment.ts      # Environment types
│   │   ├── proxy.ts            # Proxy rule types
│   │   ├── rules.ts            # Header/payload rule types
│   │   └── ...                 # Other shared types
│   ├── validation/             # Runtime validation (valibot schemas)
│   ├── utils/                  # Shared utilities
│   ├── services/               # Backend services
│   │   ├── cli/                # CLI API (REST)
│   │   ├── core/               # App state machine, service registry
│   │   ├── network/            # Network state monitoring
│   │   ├── proxy/              # HTTP proxy (header injection, cache)
│   │   ├── video/              # Video capture, FFmpeg, export
│   │   ├── websocket/          # WS/WSS browser extension communication
│   │   └── workspace/          # Git sync, auth strategies, workspace mgmt
│   ├── main/                   # Main process modules
│   │   └── modules/
│   │       ├── ipc/handlers/   # IPC request handlers
│   │       ├── protocol/       # openheaders:// protocol handler
│   │       ├── tray/           # System tray
│   │       ├── updater/        # Auto-updater
│   │       └── window/         # Window management
│   ├── preload/                # Preload bridge modules
│   │   ├── api/                # API groups exposed to renderer
│   │   └── modules/            # TOTP, HTTP bridge, logger, time utils
│   └── renderer/               # React renderer (202 TSX, ~100 TS files)
│       ├── App.tsx             # Main React app
│       ├── index.tsx           # React entry point
│       ├── contexts/           # React contexts (core, data, services, ui)
│       ├── components/         # UI components by feature
│       ├── hooks/              # Custom hooks (app, environment, sources, workspace)
│       ├── services/           # Renderer services (refresh, export-import, env, workspace)
│       ├── utils/              # Renderer utilities
│       └── styles/             # CSS/Less styles
├── tests/                      # Test suite (146 files, ~4000 tests)
│   ├── __mocks__/              # Electron/electron-log mocks (TypeScript)
│   ├── e2e/                    # Playwright e2e tests (52 tests)
│   ├── integration/            # Integration tests
│   ├── ipc/                    # IPC contract tests
│   ├── setup.ts                # Vitest setup (module resolution)
│   └── unit/                   # Unit tests organized by domain
│       ├── cli/
│       ├── core/
│       ├── main/
│       ├── network/
│       ├── preload/
│       ├── proxy/
│       ├── renderer/           # components, hooks, services, utils
│       ├── utils/
│       ├── video/
│       ├── websocket/
│       └── workspace/
├── electron.vite.config.ts     # electron-vite build config
├── vitest.config.ts            # Vitest config (typecheck enabled)
├── playwright.config.ts        # Playwright e2e config
├── tsconfig.json               # TypeScript config (strict mode)
├── tsconfig.test.json          # TypeScript config for tests
├── package.json                # Project configuration
├── dev-app-update.yml          # Dev update configuration
└── electron-builder.yml        # Electron builder configuration
```

## TypeScript

The entire codebase is TypeScript with strict mode enabled:

- **Zero `any` types** in source code
- **Zero `require()` calls** — pure ESM imports
- **Zero JavaScript files** in `src/`
- **Strict mode** across all tsconfigs (`strict: true`)
- **Shared types** in `src/types/` — imported by main, preload, renderer, and tests

Type checking:

```bash
# Check source code
npx tsc --noEmit

# Check test files
npx tsc -p tsconfig.test.json --noEmit
```

## CI/CD Pipeline

### Test Pipeline (`.github/workflows/ci.yml`)

Runs on pushes to `main` and PRs targeting `main`:

1. TypeScript typecheck (main tsconfig)
2. TypeScript typecheck (renderer tsconfig)
3. Unit + integration tests (`npx vitest run`)
4. Build app (`npm run build`)
5. E2E tests (`xvfb-run npx playwright test`)

### Build Pipeline (`.github/workflows/build.yml`)

Triggered by tag pushes (`v*`):

1. Builds on macOS, Windows, and Ubuntu simultaneously
2. macOS: code signing + notarization
3. Creates GitHub release with all platform artifacts

### Required Secrets

**For Code Signing and Notarization (macOS):**

- `APPLE_ID`: Apple Developer Account email
- `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password for your Apple ID
- `APPLE_TEAM_ID`: Apple Developer Team ID
- `MACOS_CERTIFICATE`: Base64-encoded .p12 certificate file
- `MACOS_CERTIFICATE_PWD`: Password for the certificate file
- `KEYCHAIN_PASSWORD`: Password for the temporary keychain

**General:**

- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

## Build System

The app uses **electron-vite** (Vite-based) for building:

```bash
# Development with hot-reload
npm run dev

# Production build
npm run build

# Build + package for current platform
npm run dist

# Platform-specific packaging
npm run dist:mac          # macOS (universal)
npm run dist:win          # Windows
npm run dist:linux        # Linux (AppImage + deb)
npm run dist:all          # All platforms
```

### Build Configuration

The build is configured in `electron.vite.config.ts` with three targets:

- **Main**: SSR bundle for Electron main process
- **Preload**: SSR bundle for preload script
- **Renderer**: Client-side bundle with React, Ant Design, code splitting

Theme customization for Ant Design is configured via Less preprocessor options in the renderer build config.

## Testing

### Test Stack

- **Vitest** — Unit and integration tests with TypeScript typecheck
- **Playwright** — E2E tests launching real Electron app

### Running Tests

```bash
# Unit + integration tests (3966 tests)
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# E2E tests (52 tests, requires: npm run build)
npm run test:e2e

# Type checking
npm run typecheck
```

### Test Architecture

- Tests mirror the `src/` directory structure under `tests/unit/`
- Each test file has factory functions (`makeSource()`, `makeWorkspace()`, etc.) for realistic test data
- Mocks for Electron and electron-log are in `tests/__mocks__/`
- `tests/setup.ts` intercepts module resolution to redirect `electron` imports to mocks
- IPC contract tests verify every channel has matching main handler and preload bridge

## macOS Notarization

macOS notarization is implemented in `scripts/notarize.js` and executed via electron-builder's `afterSign` hook.

### Process

1. Detects if building on macOS
2. Verifies Apple credentials are available
3. Submits app bundle to Apple's notary service
4. Waits for approval and staples the ticket

### Skipping Notarization

```bash
npm run dist:mac:unsigned
```

### Required Environment Variables

- `APPLE_ID`: Apple Developer Account email
- `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password
- `APPLE_TEAM_ID`: Apple Developer Team ID

## WebSocket Service

Provides browser extension communication:

- **WS** (port 59210): Chrome/Edge
- **WSS** (port 59211): Firefox (self-signed certificates)
- Certificates auto-generated using node-forge
- Binds to localhost only
- Broadcasts source/rule changes to connected extensions

## Key Feature Areas

### Proxy Service

HTTP proxy with header injection, response modification, caching, and domain matching. Supports dynamic source-backed
headers, environment variable substitution, and cookie-based rules.

### Workspace System

Git-based team workspace sync with multiple auth strategies (token, SSH, basic auth). Supports sparse checkout, conflict
resolution, and scheduled background sync.

### Environment System

Multi-environment variable management with secret support, cross-environment resolution, and schema sync with team
workspaces.

### Source Refresh

Automatic source refresh with custom intervals, cron expressions, network-aware scheduling, dependency chains, and retry
with backoff.

### Recording System

Session recording capture from browser extension with rrweb, video export via FFmpeg, and playback with network request
correlation.

## Build Scripts Reference

```bash
# Development
npm run dev                     # Dev mode with hot-reload
npm run build                   # Production build

# Testing
npm test                        # Run vitest
npm run test:e2e                # Run Playwright e2e
npm run test:coverage           # Run with coverage
npm run typecheck               # TypeScript check

# Distribution
npm run dist                    # Package for current platform
npm run dist:mac                # macOS (signed + notarized)
npm run dist:mac:unsigned       # macOS (no signing)
npm run dist:win                # Windows
npm run dist:linux              # Linux (AppImage + deb)
npm run dist:all                # All platforms

# Cleanup
npm run clean                   # Remove build artifacts
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed contribution guidelines.

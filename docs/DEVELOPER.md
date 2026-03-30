# Developer Documentation

Technical documentation for developers who want to understand, build, test, or contribute to OpenHeaders.

## Monorepo Overview

OpenHeaders is a pnpm + Turborepo monorepo with three packages:

| Package | Path | Description |
|---------|------|-------------|
| `@openheaders/core` | `packages/core/` | Canonical domain model — types, protocol, utils, schemas |
| `@openheaders/desktop` | `apps/desktop/` | Electron desktop app (macOS, Windows, Linux) |
| `@openheaders/extension` | `apps/extension/` | Browser extension (Chrome, Firefox, Edge, Safari) |

### Dependency Graph

```
@openheaders/core          ← zero platform deps (just valibot for boundary schemas)
    ↑           ↑
    |           |
  desktop    extension     ← each depends on core, NOT on each other
```

The desktop app runs a WebSocket server on port 59210. The extension connects as a client. Shared types and protocol definitions live in `@openheaders/core`.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+ (`corepack enable` activates it automatically)
- [Git](https://git-scm.com/)

### Setup

```bash
git clone https://github.com/OpenHeaders/open-headers-app.git
cd open-headers-app
pnpm install
```

### Common Commands

```bash
# Typecheck all packages
pnpm turbo typecheck

# Run all tests (7900+ tests)
pnpm turbo test

# Build everything
pnpm turbo build

# Lint + format check
pnpm biome check .

# Auto-fix lint + format
pnpm lint:fix

# Development (desktop)
pnpm --filter @openheaders/desktop dev

# Development (extension, Chrome watch mode)
pnpm --filter @openheaders/extension dev

# Clean all build artifacts
pnpm turbo clean
```

Turborepo caches task results — unchanged packages are skipped automatically.

## Project Structure

```
open-headers/
├── packages/core/                  @openheaders/core
│   └── src/
│       ├── types/                  Source, HeaderEntry, Rules, Recording types
│       ├── protocol/               WS message contract, constants (port 59210)
│       ├── utils/                  Header validation, hash functions
│       └── schemas/                Valibot schemas (boundary validation)
│
├── apps/desktop/                   @openheaders/desktop
│   └── src/
│       ├── main.ts                 Electron main process entry
│       ├── preload.ts              IPC bridge
│       ├── main/modules/           Lifecycle, IPC handlers, tray, shortcuts, updater
│       ├── services/               WS server, proxy, workspace/git, video, CLI API, network
│       ├── renderer/               React app (contexts, components, hooks, services)
│       ├── types/                  App-specific types (extends core)
│       └── shared/                 Circuit breaker, concurrency, JSON filter, TOTP
│
├── apps/extension/                 @openheaders/extension
│   └── src/
│       ├── background/             MV3 service worker (rules, WS client, badge, request tracking)
│       ├── popup/                  React popup UI (800x600)
│       ├── context/                HeaderContext, ThemeContext
│       ├── assets/recording/       Recording system (state machine, content script, rrweb)
│       ├── types/                  Extension-specific types (DNR rules, recording service)
│       └── utils/                  Cross-browser API wrapper, storage chunking, messaging
│
├── docs/                           Repo-wide documentation
├── turbo.json                      Turborepo task pipeline
├── pnpm-workspace.yaml             Workspace definition
├── tsconfig.base.json              Shared TS config (strict, ES2022, isolatedModules)
└── biome.json                      Linter + formatter
```

## Technology Stack

| Layer | Desktop | Extension | Core |
|-------|---------|-----------|------|
| Language | TypeScript (strict) | TypeScript (strict) | TypeScript (strict) |
| UI | React 19, Ant Design 5 | React 18, Ant Design 5 | N/A |
| Build | electron-vite | Vite 8 | tsc |
| Runtime | Electron (Node + Chromium) | Browser service worker | N/A |
| Tests | vitest, Playwright | vitest, Playwright | vitest |
| Styling | Less | Less | N/A |
| Validation | valibot | — | valibot |

---

## Desktop App Architecture

### Components

- **Main Process** (`src/main.ts`): App lifecycle, IPC handlers, services
- **Renderer** (`src/renderer/`): React + Ant Design UI with context providers
- **Preload** (`src/preload.ts`): Secure IPC bridge with context isolation
- **Services** (`src/services/`): Backend services running in the main process

### Main Process Services

| Service | Description |
|---------|-------------|
| `services/websocket/` | WS server (port 59210) — serves extension/CLI clients |
| `services/proxy/` | HTTP proxy with header injection, caching, domain matching |
| `services/workspace/` | Git-based team workspace sync with auth strategies |
| `services/source-refresh/` | Source fetcher with cron/interval scheduling |
| `services/video/` | Screen capture, FFmpeg conversion, video export |
| `services/cli/` | REST API for CLI tool integration |
| `services/network/` | Network state monitoring (online/offline, VPN detection) |
| `services/core/` | App state machine, service registry, settings cache |

### Renderer Architecture

| Directory | Description |
|-----------|-------------|
| `renderer/contexts/` | React contexts (core, data, services, ui) |
| `renderer/components/` | UI components by feature (rules, sources, proxy, recording, workspaces) |
| `renderer/hooks/` | Custom hooks (app, environment, sources, workspace) |
| `renderer/services/` | Renderer-side services (refresh, export-import, environment) |

### UI Tabs

1. **Workflows** — Session recording playback
2. **Rules** — Header, payload, URL, scripts/CSS rules (sub-tabs)
3. **Sources** — HTTP, file, and environment variable sources
4. **Environments** — Variable management with secret support
5. **Workspaces** — Personal and team workspaces with git sync
6. **Server Config** — WebSocket, proxy, and CLI server (sub-tabs)

### Desktop Data Flow

```
User → React UI → Context providers → IPC (preload bridge) → Main process services
                                                                    ↓
                                                              WebSocket server
                                                                    ↓
                                                            Browser extension
```

### Desktop Build & Distribution

```bash
pnpm --filter @openheaders/desktop dev              # Dev with hot-reload
pnpm --filter @openheaders/desktop build             # Production build
pnpm --filter @openheaders/desktop dist:mac          # macOS (signed + notarized)
pnpm --filter @openheaders/desktop dist:mac:unsigned  # macOS (no signing)
pnpm --filter @openheaders/desktop dist:win          # Windows
pnpm --filter @openheaders/desktop dist:linux        # Linux (AppImage + deb + RPM)
```

Build uses **electron-vite** with three targets (main, preload, renderer). Theme customization via Less preprocessor options. The `@openheaders/core` package is excluded from electron-vite's `externalizeDepsPlugin` so it gets bundled into all three targets.

---

## Browser Extension Architecture

### Components

1. **Background Service Worker** (`src/background/`) — Manages `declarativeNetRequest` rules, WebSocket connection to desktop app, request monitoring, badge state
2. **Popup UI** (`src/popup/`) — React interface for rules, recording, connection state
3. **Recording System** (`src/assets/recording/`) — State machine, content script injection, rrweb capture
4. **Context System** (`src/context/`) — HeaderContext (rules/sources), ThemeContext (dark/light/auto)

### Extension Data Flow

```
React Popup → HeaderContext → chrome.storage.sync
                    ↓
         Background Service Worker → declarativeNetRequest rules
                    ↓
           WebSocket Client (ws://127.0.0.1:59210)
                    ↓
              Desktop App
```

### Cross-Browser Compatibility

| Feature | Chrome/Edge | Firefox | Safari |
|---------|------------|---------|--------|
| Background | Service worker | Background scripts | Background scripts |
| Manifest | MV3 | MV3 (gecko settings) | MV3 (limited perms) |
| Sourcemaps | Disabled | Inline (AMO review) | Disabled |
| Extra perms | `system.display`, `windows` | `webRequestBlocking` | — |

The `src/utils/browser-api.ts` module wraps all Chrome/Firefox/Safari API differences (callback vs promise-based).

### Extension Build

```bash
pnpm --filter @openheaders/extension dev             # Chrome watch mode
pnpm --filter @openheaders/extension build            # All browsers
pnpm --filter @openheaders/extension build:chrome     # Chrome only
pnpm --filter @openheaders/extension build:firefox    # Firefox only
```

Build uses **Vite 8** with `BROWSER` env var selecting the target. Custom plugins handle Chrome Web Store CSP compliance, asset copying, and content script IIFE bundling.

**Manifest versioning** — Source manifests in `manifests/*/manifest.json` have `"version": "0.0.0"` as a placeholder. The build injects the real version from `apps/extension/package.json` into the output manifest. For beta releases, the CI workflow converts semver-with-prerelease (`4.1.0-beta.1`) to the numeric format required by browser stores (`4.1.0.1`).

### Key Extension Implementation Details

**Rule Engine** — All rule updates go through `scheduleUpdate(reason, options)`. Debounces rapid calls (150ms) and deduplicates by hash.

**Badge State Priority** — `disconnected > paused > active (count) > none`. Recording overrides all states.

**Recording State Machine** — `idle → starting → recording → stopping → idle` with `pre_navigation` branch. Per-tab stop lock makes concurrent stops idempotent.

**URL Pattern Matching** — Pre-compiled RegExp cache, recompiled when rules change. Supports wildcards, IPs, localhost with ports, IDN domains.

---

## Core Package

`@openheaders/core` is the canonical domain model. Both apps import from it via subpath exports:

```typescript
import type { Source } from '@openheaders/core/types';
import { validateHeaderName } from '@openheaders/core/utils';
import { WS_PORT, MESSAGE_TYPES } from '@openheaders/core/protocol';
import { SourceSchema } from '@openheaders/core/schemas';
```

### What lives in core

- **Types** (`types/`): Domain interfaces (Source, HeaderEntry, Rules, Recording), common utilities (JsonValue, OperationResult, errorMessage, toError)
- **Protocol** (`protocol/`): WS message types (AppNavigationIntent, WorkflowRecordingPayload, DisplayContext, RulesData), constants (port 59210, protocol name, message types)
- **Utils** (`utils/`): Header validation/sanitization (RFC 7230), FNV-1a hashing for change detection
- **Schemas** (`schemas/`): Valibot schemas for boundary validation (SourceSchema, WorkflowRecordingPayloadSchema)

### What does NOT live in core

Anything that imports `chrome`, `electron`, `fs`, `ws`, or DOM APIs. UI components, hooks, contexts, platform-specific adapters.

---

## Testing

### Test Stack

- **vitest** — Unit and integration tests with TypeScript typecheck
- **Playwright** — E2E tests (Electron app + Chrome extension)

### Running Tests

```bash
pnpm turbo test                                       # All packages
pnpm --filter @openheaders/desktop test               # Desktop only (7153 tests)
pnpm --filter @openheaders/extension test             # Extension only (765 tests)
pnpm --filter @openheaders/desktop test:e2e           # Desktop e2e (requires build)
pnpm --filter @openheaders/extension test:e2e         # Extension e2e (requires Chrome build)
pnpm turbo typecheck                                  # Typecheck all
```

### Test Architecture

- Tests mirror `src/` structure under `tests/unit/`
- Factory functions (`makeSource()`, `makeWorkspace()`) with `Partial<T>` overrides
- Chrome API mock in `tests/__mocks__/chrome.ts` (extension)
- Electron mock in `tests/__mocks__/electron.ts` (desktop)
- IPC contract tests verify every channel has matching handler + bridge (desktop)

---

## CI/CD

### CI Pipeline (`.github/workflows/ci.yml`)

Runs on push to `main` and PRs:

1. `pnpm install --frozen-lockfile`
2. `pnpm biome check .` (lint — non-blocking, warnings only)
3. `pnpm turbo typecheck` (all packages)
4. `pnpm turbo test` (all packages)
5. `pnpm turbo build` (all packages)

### Release Pipelines

- **Full release**: Tag `v*` triggers `release.yml` — builds desktop (3 platforms, signed) + extension (4 browsers) into one GitHub Release. Desktop version = tag, extension version = its own `package.json`.
- **Extension-only**: Tag `ext-v*` triggers `release-extension.yml` — builds extension only, publishes to `OpenHeaders/open-headers-browser-extension`. Fails if tag doesn't match `apps/extension/package.json`.

Desktop and extension have **independent versions**. See [RELEASES.md](RELEASES.md) for full release process.

---

## Code Style

Enforced by **Biome** (lint + format):

- 2-space indentation, single quotes, trailing commas, semicolons
- 120 character line width
- No `any` types, no unused imports/variables (warnings)
- `isolatedModules` enabled (explicit `export type`)

```bash
pnpm biome check .          # Check
pnpm lint:fix               # Auto-fix
```

## Security

- **CSP**: Strict Content Security Policy in extension manifests
- **Local-only**: WS server binds to `127.0.0.1:59210`, never exposed to network
- **Validation**: Header names/values validated against RFC 7230 and browser restrictions
- **No external transmission**: Neither app nor extension sends data to external servers
- **Context isolation**: Electron preload uses `contextBridge` with strict API surface

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

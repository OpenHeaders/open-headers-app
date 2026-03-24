# Contributing to Open Headers App

Thank you for your interest in contributing to the Open Headers dynamic sources application! This document provides guidelines and workflows to help you contribute effectively to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Cross-Platform Testing](#cross-platform-testing)
- [Testing Automatic Updates](#testing-automatic-updates)
- [Documentation](#documentation)
- [Issue Tracking](#issue-tracking)
- [Release Process](#release-process)

## Code of Conduct

We expect all contributors to follow our Code of Conduct. Please be respectful and inclusive in all interactions within the project.

## Getting Started

1. **Fork the repository**:
    - Visit the [Open Headers App repository](https://github.com/OpenHeaders/open-headers-app)
    - Click the "Fork" button to create your own copy

2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/open-headers-app.git
   cd open-headers-app
   ```

3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/OpenHeaders/open-headers-app.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Start the application in development mode**:
   ```bash
   npm run dev
   ```

## Development Workflow

1. **Create a new branch** for your work (see [Branching Strategy](#branching-strategy))
2. **Make your changes** to the codebase
3. **Run type checks**: `npx tsc --noEmit`
4. **Run tests**: `npm test`
5. **Commit your changes** (see [Commit Message Guidelines](#commit-message-guidelines))
6. **Push your branch** to your fork
7. **Create a pull request** to the main repository

## Project Structure

```
open-headers-app/
├── build/                  # Build resources (icons, entitlements)
├── docs/                   # Documentation
├── src/                    # Source code (100% TypeScript)
│   ├── main.ts             # Electron main process entry
│   ├── preload.ts          # Electron preload script
│   ├── config/             # App configuration
│   ├── types/              # Shared TypeScript type definitions
│   ├── validation/         # Runtime validation schemas (valibot)
│   ├── utils/              # Shared utilities
│   ├── services/           # Backend services
│   │   ├── cli/            # CLI API service
│   │   ├── core/           # App state machine, service registry
│   │   ├── network/        # Network state monitoring
│   │   ├── proxy/          # HTTP proxy service
│   │   ├── video/          # Video capture and export
│   │   ├── websocket/      # WebSocket service
│   │   └── workspace/      # Git sync and workspace management
│   ├── main/               # Main process modules
│   │   └── modules/        # IPC handlers, protocol, tray, updater
│   ├── preload/            # Preload bridge modules
│   └── renderer/           # React renderer process
│       ├── App.tsx          # Main React application
│       ├── index.tsx        # React entry point
│       ├── contexts/       # React contexts (core, data, services, ui)
│       ├── components/     # React components (Ant Design)
│       ├── hooks/          # Custom React hooks
│       ├── services/       # Renderer-side services
│       ├── utils/          # Renderer utilities
│       └── styles/         # Application styles
├── tests/                  # Test suite
│   ├── __mocks__/          # Electron/electron-log mocks
│   ├── e2e/                # Playwright e2e tests
│   ├── integration/        # Integration tests
│   ├── ipc/                # IPC contract tests
│   └── unit/               # Unit tests (vitest)
├── electron.vite.config.ts # electron-vite build configuration
├── vitest.config.ts        # Vitest test configuration
├── playwright.config.ts    # Playwright e2e configuration
├── tsconfig.json           # TypeScript configuration (strict mode)
├── package.json            # Project configuration
└── electron-builder.yml    # Electron builder configuration
```

## Technology Stack

- **Language**: TypeScript (strict mode across entire codebase, zero `any` types)
- **Framework**: Electron with electron-vite
- **UI**: React + Ant Design
- **Testing**: Vitest (unit/integration) + Playwright (e2e)
- **Build**: electron-vite (Vite for main/preload/renderer)
- **CI**: GitHub Actions (typecheck + tests + e2e)

## Branching Strategy

We use a feature-based branching strategy. All branches should be created from the `main` branch.

### Branch Naming Conventions

- **Feature branches**: `feature/short-description` or `feature/issue-number-description`
    - Example: `feature/totp-authentication` or `feature/42-json-filtering`

- **Bug fix branches**: `fix/short-description` or `fix/issue-number-description`
    - Example: `fix/websocket-connection` or `fix/57-react-rendering`

- **Documentation branches**: `docs/short-description`
    - Example: `docs/api-documentation`

- **Performance improvement branches**: `perf/short-description`
    - Example: `perf/http-request-caching`

- **Refactoring branches**: `refactor/short-description`
    - Example: `refactor/source-context`

- **UI branches**: `ui/short-description`
    - Example: `ui/dark-mode-support`

- **Testing branches**: `test/short-description`
    - Example: `test/source-service`

- **Platform-specific branches**: `platform/os-name-description`
    - Example: `platform/macos-dock-icon` or `platform/linux-support`

- **Update branches**: `update/short-description`
    - Example: `update/auto-update-notifications` or `update/progress-indicators`

### Branch Lifecycle

1. Create a branch for your work
2. Make your changes and push them
3. Open a pull request
4. After approval and merging, delete the branch

## Commit Message Guidelines

We follow a simplified version of the [Conventional Commits](https://www.conventionalcommits.org/) standard.

### Format

```
<type>: <short summary>
<BLANK LINE>
<optional body>
<BLANK LINE>
<optional footer>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation changes
- **style**: Changes that don't affect code functionality (formatting, etc.)
- **refactor**: Code changes that neither fix a bug nor add a feature
- **test**: Adding or updating tests
- **perf**: Performance improvements
- **chore**: Changes to build process, dependencies, etc.
- **ui**: User interface changes
- **platform**: Platform-specific changes or compatibility fixes
- **update**: Updates to the update system components

### Examples

```
feat: add TOTP authentication for HTTP sources

This change adds support for time-based one-time passwords in HTTP requests.
Users can enter a TOTP secret and use _TOTP_CODE placeholder in requests.

Closes #42
```

```
update: improve auto-update progress indicators

Enhances the update download progress UI with percentage completion
and estimated download time. Also adds more detailed error handling
for update failures.

Closes #78
```

## Pull Request Process

1. **Create a pull request** from your feature branch to the `main` branch of the original repository
2. **Fill out the PR template** with all relevant information
3. **Link any related issues** using GitHub's keywords (Fixes #123, Closes #456, etc.)
4. **Ensure CI passes**: TypeScript typecheck, vitest tests, and Playwright e2e tests must all pass
5. **Wait for the review process** - maintainers will review your code
6. **Make any requested changes** based on the review feedback
7. **Once approved**, a maintainer will merge your PR

### PR Size Guidelines

- Keep PRs focused on a single issue or feature when possible
- Large changes should be broken into smaller, logically separate PRs
- If a PR becomes too large, consider splitting it

## Testing

All contributions should include appropriate tests.

### Running Tests

```bash
# Run all unit and integration tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run e2e tests (requires built app: npm run build)
npm run test:e2e

# Run TypeScript type checks
npm run typecheck
```

### Test Structure

- **Unit tests** (`tests/unit/`): Test individual functions and classes in isolation
- **Integration tests** (`tests/integration/`): Test service interactions (e.g., proxy flow)
- **IPC contract tests** (`tests/ipc/`): Verify IPC channel registrations match between main and preload
- **E2E tests** (`tests/e2e/`): Launch the real Electron app and verify UI and IPC

### Test Guidelines

- Use vitest (not jest) — this project uses vitest
- Never use `any` type — use proper types from `src/types/`
- Import types from source, don't re-declare interfaces in test files
- Use realistic enterprise-style test data (UUIDs, real URLs, proper tokens)
- Assert full object shapes, not just one or two fields
- Each test file should have factory functions (e.g., `makeSource()`) for test data

## Cross-Platform Testing

All contributions should be tested across supported platforms:

### Required Testing

1. **Testing on your platform**:
    - Test all affected functionality thoroughly
    - Verify UI rendering and interactions
    - Check console for errors

### Recommended Testing (if possible)

1. **Cross-platform testing**:
    - Test on macOS, Windows, and Linux if possible
    - Verify platform-specific features (dock icon, tray icon, etc.)
    - Test with different screen resolutions and DPI settings

### Testing Focus Areas

- **UI Rendering**: Verify components render correctly across platforms
- **File Watching**: Verify file monitoring works correctly
- **Settings**: Confirm settings persist between sessions
- **Performance**: Check for any platform-specific performance issues
- **Update System**: Test update notifications and installation process

## Testing Automatic Updates

When working on features related to the update system:

1. **Development Testing**:
    - Set up local testing using the `dev-app-update.yml` file
    - Configure the file with your fork's repository information
   ```yaml
   provider: github
   owner: your-username
   repo: open-headers-app
   ```
    - Use the `--dev` flag when running the app to force update checks
    - The main process logs update activity to the electron-log file
    - The renderer process receives update events via IPC

2. **Update Flow Testing**:
    - Create a release on your GitHub fork with a higher version number
    - Test the complete update flow:
        1. Update detection
        2. Download progress indicators
        3. Update ready notification
        4. Install and restart process

3. **Error Handling Testing**:
    - Test how the app handles various error conditions:
        - Network connection issues
        - Invalid releases
        - Download failures
        - Installation failures

4. **Publishing Testing**:
    - Test the publish scripts locally without actually publishing:
   ```bash
   npm run publish:mac -- --dry-run
   npm run publish:win -- --dry-run
   npm run publish:linux -- --dry-run
   ```

## Documentation

When adding features or making significant changes, please update the relevant documentation:

1. **Code comments**:
    - Add comments only where the logic isn't self-evident
    - Document complex algorithms or platform-specific workarounds

2. **README.md**:
    - Update for new features or changed behaviors
    - Add examples for new functionality

3. **DEVELOPER.md**:
    - Update technical details for developers
    - Document architecture changes

## Issue Tracking

We use GitHub Issues to track bugs, enhancements, and feature requests.

### Creating Issues

- **Bug reports**: Include steps to reproduce, expected behavior, actual behavior, platform details, and app version
- **Feature requests**: Describe the feature, its benefits, and potential implementation approaches
- **Enhancement requests**: Explain what existing functionality should be improved and why

### Issue Labels

- `bug`: A problem with the application
- `feature`: A new feature request
- `enhancement`: Improvement to existing functionality
- `documentation`: Documentation improvements
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed
- `wontfix`: This will not be worked on
- `platform-macos`: macOS-specific issues
- `platform-windows`: Windows-specific issues
- `platform-linux`: Linux-specific issues
- `ui`: User interface issues
- `backend`: Backend service issues
- `update-system`: Issues related to automatic updates

## Release Process

Our release process follows these steps:

1. **Version bump** in package.json
2. **Create a release branch**: `release/vX.Y.Z`
3. **Final testing** on the release branch for all supported platforms
4. **Generate production builds** for all platforms:
   ```bash
   npm run dist:all
   ```
5. **Create a GitHub release** with the version tag and release notes
6. **Publish platform-specific installers** to GitHub releases:
   ```bash
   npm run publish:all
   ```

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for new features in a backward-compatible manner
- **PATCH** version for backward-compatible bug fixes

## React and Ant Design Guidelines

When working with React components and Ant Design:

- **TypeScript**: All code must be TypeScript with strict mode — no `any` types
- **Component Structure**: Each component should have a single responsibility
- **State Management**: Use context providers for global state, component state for local state
- **Custom Hooks**: Extract complex logic into custom hooks
- **Ant Design Usage**: Follow Ant Design patterns and conventions
- **Responsive Design**: Ensure components work across different screen sizes
- **Accessibility**: Ensure components are accessible (keyboard navigation, screen readers, etc.)
- **Performance**: Use React performance best practices (useMemo, useCallback, etc.)

## Thank You!

Your contributions help make Open Headers better for everyone. We appreciate your time and effort!

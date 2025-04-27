# Contributing to Open Headers App

Thank you for your interest in contributing to the Open Headers dynamic sources application! This document provides guidelines and workflows to help you contribute effectively to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Cross-Platform Testing](#cross-platform-testing)
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
   npm run dev:react
   ```

## Development Workflow

1. **Create a new branch** for your work (see [Branching Strategy](#branching-strategy))
2. **Make your changes** to the codebase
3. **Test your changes** thoroughly on your target platform
4. **Commit your changes** (see [Commit Message Guidelines](#commit-message-guidelines))
5. **Push your branch** to your fork
6. **Create a pull request** to the main repository

## Project Structure

```
open-headers-app/
├── src/
│   ├── contexts/          # React contexts
│   ├── components/        # React components
│   ├── hooks/             # Custom React hooks
│   ├── config/            # Application configuration
│   ├── controllers/       # Electron main process controllers
│   ├── models/            # Data models
│   ├── repositories/      # Data persistence
│   ├── services/          # Core services
│   ├── utils/             # Utility functions
│   ├── ui/                # Legacy UI (for reference)
│   ├── preload/           # Electron preload scripts
│   ├── main.js            # Electron main process entry point
│   └── renderer/          # React renderer process
├── build/                 # Build resources
├── webpack.config.js      # Webpack configuration
└── docs/                  # Documentation
```

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

### Examples

```
feat: add TOTP authentication for HTTP sources

This change adds support for time-based one-time passwords in HTTP requests.
Users can enter a TOTP secret and use _TOTP_CODE placeholder in requests.

Closes #42
```

```
ui: integrate Ant Design component library

Refactors the entire UI from vanilla HTML/CSS/JS to React with Ant Design.
- Adds React component structure
- Creates context providers for state management
- Implements custom hooks for business logic
- Updates build process with webpack for React

Closes #57
```

## Pull Request Process

1. **Create a pull request** from your feature branch to the `main` branch of the original repository
2. **Fill out the PR template** with all relevant information
3. **Link any related issues** using GitHub's keywords (Fixes #123, Closes #456, etc.)
4. **Wait for the review process** - maintainers will review your code
5. **Make any requested changes** based on the review feedback
6. **Once approved**, a maintainer will merge your PR

### PR Size Guidelines

- Keep PRs focused on a single issue or feature when possible
- Large changes should be broken into smaller, logically separate PRs
- If a PR becomes too large, consider splitting it

## Cross-Platform Testing

All contributions should be tested across supported platforms:

### Required Testing

1. **Testing on your platform**:
   - Test all affected functionality thoroughly
   - Verify UI rendering and interactions
   - Check console for errors

### Recommended Testing (if possible)

2. **Cross-platform testing**:
   - Test on macOS, Windows, and Linux if possible
   - Verify platform-specific features (dock icon, tray icon, etc.)
   - Test with different screen resolutions and DPI settings

### Testing Focus Areas

- **UI Rendering**: Verify components render correctly across platforms
- **WebSocket Server**: Test connection with browser extension
- **File Watching**: Verify file monitoring works correctly
- **Settings**: Confirm settings persist between sessions
- **Performance**: Check for any platform-specific performance issues

## Documentation

When adding features or making significant changes, please update the relevant documentation:

1. **Code comments**:
   - Use JSDoc format for function and class documentation
   - Document React components with prop descriptions
   - Explain complex logic or platform-specific code

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
6. **Publish platform-specific installers** to GitHub releases

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for new features in a backward-compatible manner
- **PATCH** version for backward-compatible bug fixes

## React and Ant Design Guidelines

When working with React components and Ant Design:

- **Component Structure**: Each component should have a single responsibility
- **State Management**: Use context providers for global state, component state for local state
- **Custom Hooks**: Extract complex logic into custom hooks
- **Ant Design Usage**: Follow Ant Design patterns and conventions
- **Responsive Design**: Ensure components work across different screen sizes
- **Accessibility**: Ensure components are accessible (keyboard navigation, screen readers, etc.)
- **Performance**: Use React performance best practices (useMemo, useCallback, etc.)

## Thank You!

Your contributions help make Open Headers better for everyone. We appreciate your time and effort!

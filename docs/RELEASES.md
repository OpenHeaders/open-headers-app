# Production & Beta Releases

## Overview

OpenHeaders uses two tag patterns for releases:

| Tag | What it does |
|-----|-------------|
| `v4.0.0` | Full release — desktop app + extension. Published to this repo. Desktop users auto-update. |
| `v4.0.0-beta.1` | Full beta — desktop app + extension. Published as prerelease. Beta desktop users auto-update. |
| `ext-v4.0.1-beta.1` | Extension only — published to `OpenHeaders/open-headers-browser-extension`. Desktop users unaffected. |

## Full Release (`v*` tags)

Builds both the desktop app and browser extension. Everything goes into a single GitHub Release on this repo.

### Creating a Release

```bash
# Production
git tag v4.0.0
git push origin v4.0.0

# Beta
git tag v4.1.0-beta.1
git push origin v4.1.0-beta.1
```

CI will:
- Build desktop for all platforms (macOS x64 + arm64, Windows, Linux x64 + arm64)
- Sign macOS (notarized) and Windows (SSL.com eSigner, production only)
- Build extension for all browsers (Chrome, Firefox, Edge, Safari)
- Create a GitHub Release with all artifacts (desktop + extension zips)
- Generate `latest*.yml` for electron-updater

### Desktop Auto-Update

Users choose their channel in **Settings > General**:

- **Production** (default): Only receives production releases
- **Beta**: Receives production + beta releases

electron-updater reads `latest*.yml` from this repo's GitHub Releases to determine if an update is available.

**Downgrade prevention**: If the running app is a beta, `allowPrerelease` is forced to `true` to prevent downgrading to an older production release.

### Desktop Build Matrix

| Target | Production | Beta |
|--------|-----------|------|
| macOS | Signed + notarized | Signed + notarized |
| Windows | Signed (SSL.com eSigner) | Unsigned |
| Linux | N/A | N/A |

### Extension in Full Release

Extension zips are included in the same GitHub Release. You can grab them for store submission at any time. The extension version in stores doesn't need to match — you upload whenever you're ready.

---

## Extension-Only Release (`ext-v*` tags)

For releasing extension changes independently — beta testing, store submissions, or hotfixes that don't require a desktop release.

Published to `OpenHeaders/open-headers-browser-extension` (separate repo) so electron-updater on this repo is never affected.

### Creating an Extension-Only Release

```bash
# Extension beta
git tag ext-v4.0.1-beta.1
git push origin ext-v4.0.1-beta.1

# Extension production
git tag ext-v4.0.1
git push origin ext-v4.0.1
```

CI will:
- Build extension for all browsers
- Publish zips to `OpenHeaders/open-headers-browser-extension` releases

Users can download and load unpacked for testing. Submit to stores when ready.

### Required Secret

`EXTENSION_REPO_PAT` — a GitHub PAT with `contents: write` on `OpenHeaders/open-headers-browser-extension`.

---

## Extension Versioning

Browser stores require numeric-only `version` fields in manifest.json:

| Git tag | Manifest `version` | `__APP_VERSION__` (UI) |
|---|---|---|
| `v4.0.0` or `ext-v4.0.0` | `4.0.0` | `4.0.0` |
| `v4.0.0-beta.1` or `ext-v4.0.0-beta.1` | `4.0.0.1` | `4.0.0-beta.1` |

---

## Version Progression Example

```
v4.0.0              ← full release (desktop + extension)
v4.1.0-beta.1       ← full beta
ext-v4.1.0-beta.2   ← extension-only beta for quick iteration
v4.1.0-beta.3       ← full beta with desktop fixes
v4.1.0              ← full production release
```

## Tagging from a Branch

Tags can be pushed from any branch:

```bash
git checkout feature/some-branch
git tag v4.1.0-beta.1
git push origin v4.1.0-beta.1
```

## Deleting a Bad Release

1. Delete the GitHub release
2. Delete the git tag: `git push origin :refs/tags/v4.1.0-beta.1`
3. Users who already downloaded keep that version until a newer one ships

## Required CI Secrets

See [CI_SETUP.md](CI_SETUP.md) for the full list of secrets.

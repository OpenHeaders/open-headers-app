# Production & Beta Releases

## Overview

Desktop and extension have **independent versions**. The desktop version comes from the git tag. The extension version comes from `apps/extension/package.json`.

## Tag Patterns

| Tag | What builds | Where published | Desktop auto-update? |
|-----|------------|----------------|---------------------|
| `v4.0.0` | Desktop + Extension | `open-headers-app` | Yes (production) |
| `v4.0.0-beta.1` | Desktop + Extension | `open-headers-app` (prerelease) | Yes (beta channel) |
| `ext-v4.0.1-beta.1` | Extension only | `open-headers-browser-extension` | No |
| `ext-v4.0.1` | Extension only | `open-headers-browser-extension` | No |

## Versioning Convention

Versions are independent. The extension version only bumps when extension code changes.

- **`v*` tags** (full releases): Desktop version = tag. Extension version = `apps/extension/package.json`.
- **`ext-v*` tags** (extension-only): Extension version = tag. Desktop not built.

### Version Progression Example

```
v4.0.0              ← desktop 4.0.0, extension 4.0.0 (initial match)
v4.1.0              ← desktop 4.1.0, extension still 4.0.0 (no ext changes)
v4.2.0              ← desktop 4.2.0, extension still 4.0.0
ext-v4.1.0-beta.1   ← extension 4.1.0-beta.1 (testing on browser-extension repo)
ext-v4.1.0          ← extension 4.1.0 (submit to stores)
v4.3.0              ← desktop 4.3.0, extension 4.1.0 (reads from package.json)
```

### Convention to avoid version collisions

- **Desktop uses minor/major bumps**: `v4.0.0` → `v4.1.0` → `v4.2.0`
- **Extension uses patch bumps for independent releases**: `ext-v4.0.1`, `ext-v4.0.2`
- **Next `v*` tag always jumps past any `ext-v*` patches**

When bumping the extension version, update `apps/extension/package.json` and commit before tagging.

---

## Full Release (`v*`)

Builds both desktop and extension. Desktop version is set from the tag. Extension is built at whatever version is in its `package.json`.

### Creating a Full Release

```bash
# Production
git tag v4.0.0
git push origin v4.0.0

# Beta
git tag v4.1.0-beta.1
git push origin v4.1.0-beta.1
```

CI will:
- Build desktop for all platforms (macOS, Windows, Linux)
- Sign macOS (notarized) and Windows (SSL.com eSigner, production only)
- Build extension for all browsers (Chrome, Firefox, Edge, Safari)
- Create one GitHub Release with all artifacts in `open-headers-app`
- Cross-publish extension zips to `OpenHeaders/open-headers-browser-extension`
- Generate `latest*.yml` for electron-updater

### Desktop Auto-Update

Users choose their channel in **Settings > General**:

- **Production** (default): Only receives production releases
- **Beta**: Receives production + beta releases

**Downgrade prevention**: Beta users have `allowPrerelease` forced to `true`.

### Desktop Build Matrix

| Target | Production | Beta |
|--------|-----------|------|
| macOS | Signed + notarized | Signed + notarized |
| Windows | Signed (SSL.com eSigner) | Unsigned |
| Linux | No signing | No signing |

---

## Extension-Only Release (`ext-v*`)

For shipping extension changes without a desktop release. Published to `OpenHeaders/open-headers-browser-extension` so electron-updater is never affected.

### Creating an Extension-Only Release

```bash
# 1. Bump version in apps/extension/package.json
# 2. Commit the change
# 3. Tag and push

git tag ext-v4.0.1-beta.1
git push origin ext-v4.0.1-beta.1
```

CI will:
- Build extension for all browsers
- Publish zips to `OpenHeaders/open-headers-browser-extension` releases

Users download zips and load unpacked for testing. Submit to stores when ready.

---

## Extension Versioning in Stores

Browser stores require numeric-only `version` in manifest.json:

| Source version | Manifest `version` | `__APP_VERSION__` (popup footer) |
|---|---|---|
| `4.0.0` | `4.0.0` | `4.0.0` |
| `4.0.1-beta.1` | `4.0.1.1` | `4.0.1.1` |

---

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

See [CI_SETUP.md](CI_SETUP.md) for the full list. Extension-only releases additionally need `EXTENSION_REPO_PAT` (PAT with `contents: write` on `OpenHeaders/open-headers-browser-extension`).

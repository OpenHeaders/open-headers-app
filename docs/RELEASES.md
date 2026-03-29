# Production & Beta Releases

## Overview

OpenHeaders is a monorepo with independent release cycles for the desktop app and browser extension. Each is released via its own git tag prefix — the CI pipeline handles everything else.

## Tag Naming Convention

| Tag | What gets released |
|-----|-------------------|
| `desktop-v4.0.0` | Desktop app (macOS, Windows, Linux) |
| `desktop-v4.1.0-beta.1` | Desktop app beta |
| `ext-v4.0.0` | Browser extension (Chrome, Firefox, Edge, Safari) |
| `ext-v4.1.0-beta.1` | Browser extension beta |

Tags must follow [semver 2.0.0](https://semver.org/) with the appropriate prefix. Beta releases use the `-beta.N` suffix.

---

## Desktop App Releases

The desktop app uses GitHub Releases with `electron-updater` for automatic updates.

### Who Receives What

Users choose their release channel in **Settings > General**:

- **Production** (default): Only receives production releases (`desktop-v4.0.0`)
- **Beta**: Receives everything — production + beta releases

**Hotfix discipline**: If a security hotfix (`4.1.1`) ships while a beta (`4.2.0-beta.1`) is in flight, beta users won't receive the hotfix (since `4.2.0-beta.1 > 4.1.1`). Always forward-merge hotfixes into the beta line and cut a new beta.

### How electron-updater Routing Works

electron-builder v25 always generates `latest*.yml` for every build. Routing is controlled solely by `allowPrerelease`:

| User setting | `allowPrerelease` | Sees prereleases | Sees production |
|---|---|---|---|
| Production | `false` | No | Yes |
| Beta | `true` | Yes | Yes |

**Downgrade prevention**: If the running app is a beta, `allowPrerelease` is forced to `true` to prevent downgrading to an older production release.

### Creating a Desktop Release

```bash
# Production
git tag desktop-v4.0.0
git push origin desktop-v4.0.0

# Beta
git tag desktop-v4.1.0-beta.1
git push origin desktop-v4.1.0-beta.1
```

CI will:
- Build for all platforms (macOS x64 + arm64, Windows, Linux x64 + arm64)
- Sign macOS (notarized) and Windows (SSL.com eSigner, production only) builds
- Generate blockmaps for differential updates
- Create a GitHub release (published for production, prerelease for beta)

### Desktop Build Matrix

| Target | Production | Beta |
|--------|-----------|------|
| macOS | Signed + notarized | Signed + notarized |
| Windows | Signed (SSL.com eSigner) | Unsigned |
| Linux | N/A | N/A |
| Formats | DMG, zip, blockmap, exe, AppImage, deb, RPM | Same |
| Architectures | x64 + arm64 | Same |

---

## Browser Extension Releases

The extension is distributed as zip files via GitHub Releases.

### Creating an Extension Release

```bash
# Production
git tag ext-v4.0.0
git push origin ext-v4.0.0

# Beta
git tag ext-v4.1.0-beta.1
git push origin ext-v4.1.0-beta.1
```

CI will:
- Build extensions for all browsers (Chrome, Firefox, Edge, Safari)
- Package each as a zip file
- Create a GitHub release (published for production, prerelease for beta)

### Extension Versioning

Browser stores require numeric-only `version` fields in manifest.json. CI maintains two version representations:

| Git tag | Manifest `version` | `__APP_VERSION__` (UI) | Zip filename |
|---|---|---|---|
| `ext-v4.0.0` | `4.0.0` | `4.0.0` | `*-v4.0.0.zip` |
| `ext-v4.0.0-beta.1` | `4.0.0.1` | `4.0.0-beta.1` | `*-v4.0.0-beta.1.zip` |

---

## Common

### Version Progression

```
desktop-v4.0.0          ← current production
desktop-v4.1.0-beta.1   ← early testing
desktop-v4.1.0-beta.2   ← bug fixes
desktop-v4.1.0           ← production (everyone gets it)
```

Same pattern applies to `ext-v*` tags independently.

### Tagging from a Branch

Tags can be pushed from any branch — CI triggers on the tag pattern, not the branch:

```bash
git checkout refactor/some-feature
git tag desktop-v4.1.0-beta.1
git push origin desktop-v4.1.0-beta.1
```

### Deleting a Bad Release

1. Delete the GitHub release (stops new downloads)
2. Delete the git tag: `git push origin :refs/tags/desktop-v4.1.0-beta.1`
3. Users who already downloaded keep that version until a newer one ships

### Required CI Secrets

See [CI_SETUP.md](CI_SETUP.md) for the full list of secrets needed for signing and notarization.

# Production & Beta Releases

## Overview

OpenHeaders uses GitHub Releases with `electron-updater` for automatic updates. The release type is determined entirely by the git tag format — the CI pipeline handles everything else.

## Tag Naming Convention

| Tag | Release type | GitHub Release | macOS | Windows | Architectures |
|-----|-------------|----------------|-------|---------|---------------|
| `v4.0.0` | Production | Published release | Signed + notarized | Signed | All |
| `v4.1.0-beta.1` | Beta | Published prerelease | Signed + notarized | Unsigned | All |

Tags must follow [semver 2.0.0](https://semver.org/) with a `v` prefix. All beta releases use the `beta` suffix — there is no separate alpha or RC suffix.

## Who Receives What

Users choose their release channel in **Settings > General**:

- **Production** (default): Only receives production releases (`v4.0.0`)
- **Beta**: Receives everything — production releases + beta releases

When a production release ships for the same version line (e.g., `4.1.0` after `4.1.0-beta.3`), all users receive it since `4.1.0 > 4.1.0-beta.3` in semver.

**Hotfix discipline**: If a security hotfix (`4.1.1`) ships while a beta (`4.2.0-beta.1`) is in flight, beta users won't receive the hotfix (since `4.2.0-beta.1 > 4.1.1`). Always forward-merge hotfixes into the beta line and cut a new beta (e.g., `4.2.0-beta.2`).

## How electron-updater Routing Works

electron-builder v25 always generates `latest*.yml` for every build regardless of the version string. Routing is controlled solely by `allowPrerelease`:

| User setting | `allowPrerelease` | Sees GitHub prereleases | Sees production releases |
|---|---|---|---|
| Production | `false` | No | Yes |
| Beta | `true` | Yes | Yes |

**Downgrade prevention**: If the running app is a beta version, `allowPrerelease` is forced to `true` regardless of the user's setting. This prevents electron-updater's channel-mismatch logic from downgrading to an older production release. The user naturally upgrades to production when it ships (`4.0.0 > 4.0.0-beta.N`).

## Creating a Production Release

```bash
# 1. Ensure main is up to date
git checkout main
git pull

# 2. Tag the release
git tag v4.0.0

# 3. Push the tag — CI builds and publishes automatically
git push origin v4.0.0
```

CI will:
- Build for all platforms (macOS x64 + arm64, Windows, Linux x64 + arm64)
- Sign macOS (notarized) and Windows (SSL.com eSigner) builds
- Generate blockmaps for differential updates
- Create a published GitHub release with all artifacts
- Generate `latest*.yml` for electron-updater

## Creating a Beta Release

```bash
# First beta
git tag v4.1.0-beta.1
git push origin v4.1.0-beta.1

# Second beta if needed
git tag v4.1.0-beta.2
git push origin v4.1.0-beta.2
```

CI will:
- Build for all platforms (same artifacts as production)
- Sign and notarize macOS builds
- Skip Windows code signing (SSL.com eSigner has per-signing costs)
- Generate blockmaps for differential updates
- Create a **published prerelease** on GitHub (visible to electron-updater)
- Generate `latest*.yml` for electron-updater

## Production vs Beta Builds

Beta builds produce the same artifacts as production — same formats, same architectures. The only difference is Windows code signing (SSL.com eSigner has per-signing costs):

| Target | Production | Beta |
|--------|--------|-------------|
| macOS | Signed + notarized | Signed + notarized |
| Windows | Signed (SSL.com eSigner) | Unsigned |
| Linux | N/A | N/A |
| Formats | All (DMG, zip, blockmap, exe, AppImage, deb, RPM) | Same |
| Architectures | All (x64 + arm64) | Same |

This ensures auto-updater works identically for both channels — zip + blockmap for differential updates on macOS, exe + blockmap for differential updates on Windows.

## Version Progression Example

Typical release cycle:

```
v4.0.0          ← current production
v4.1.0-beta.1   ← early testing
v4.1.0-beta.2   ← bug fixes from feedback
v4.1.0-beta.3   ← feature-complete, final testing
v4.1.0           ← production release (everyone gets it)
```

## Semver Ordering

electron-updater uses semver for version comparison:

```
4.0.0 < 4.1.0-beta.1 < 4.1.0-beta.2 < 4.1.0-beta.3 < 4.1.0
```

- Beta tags only affect ordering within the same `major.minor.patch`
- `4.1.0-beta.1` is greater than `4.0.0` (different minor version)
- `4.1.0-beta.1` is less than `4.1.0` (beta < production at same version)

## How electron-updater Picks Up Releases

The app uses the GitHub provider (`dev-app-update.yml`). On each check:

1. Queries the GitHub Releases API (unauthenticated, public)
2. Filters by `prerelease` flag based on user's channel setting (`allowPrerelease`)
3. Downloads `latest*.yml` from the release assets
4. Compares versions via semver
5. If a newer version exists, downloads and notifies the user

**Important**: Draft releases are invisible to the public API. Beta releases must be **published** (not draft) for electron-updater to see them.

## Tagging from a Branch

You can tag from any branch — CI triggers on any `v*` tag push regardless of branch:

```bash
# Tag a beta from a feature branch
git checkout refactor/some-feature
git tag v4.1.0-beta.1
git push origin v4.1.0-beta.1
```

## Deleting a Bad Release

If a beta has issues:

1. Delete the GitHub release (stops new downloads)
2. Delete the git tag: `git push origin :refs/tags/v4.1.0-beta.1`
3. Users who already downloaded it keep that version until a newer one is published

## Required CI Secrets

See [CI_SETUP.md](CI_SETUP.md) for the full list of secrets needed for signing and notarization. Beta releases require macOS signing secrets but skip Windows signing secrets (SSL.com eSigner).

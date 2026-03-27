# Releases & Pre-releases

## Overview

OpenHeaders uses GitHub Releases with `electron-updater` for automatic updates. The release type is determined entirely by the git tag format — the CI pipeline handles everything else.

## Tag Naming Convention

| Tag | Release type | GitHub Release | macOS | Windows | Architectures |
|-----|-------------|----------------|-------|---------|---------------|
| `v4.0.0` | Stable | Published release | Signed + notarized | Signed | All |
| `v4.1.0-rc.1` | Release Candidate | Published prerelease | Signed + notarized | Unsigned | All |
| `v4.1.0-beta.1` | Beta | Published prerelease | Signed + notarized | Unsigned | All |
| `v4.1.0-alpha.1` | Alpha | Published prerelease | Signed + notarized | Unsigned | All |

Tags must follow [semver 2.0.0](https://semver.org/) with a `v` prefix.

## Who Receives What

Users choose their update channel in **Settings > Developer > Updates**:

- **Stable** (default): Only receives published releases (`v4.0.0`)
- **Pre-release**: Receives everything — stable releases + RC/beta/alpha

When a stable release ships for the same version line (e.g., `4.1.0` after `4.1.0-rc.2`), all users receive it since `4.1.0 > 4.1.0-rc.2` in semver.

**Hotfix discipline**: If a security hotfix (`4.1.1`) ships while a prerelease (`4.2.0-rc.1`) is in flight, prerelease users won't receive the hotfix (since `4.2.0-rc.1 > 4.1.1`). Always forward-merge hotfixes into the prerelease line and cut a new RC (e.g., `4.2.0-rc.2`).

## Creating a Stable Release

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
- Generate `latest.yml`, `latest-mac.yml`, `latest-linux.yml` for electron-updater

## Creating a Pre-release

```bash
# Release candidate
git tag v4.1.0-rc.1
git push origin v4.1.0-rc.1

# Second RC if needed
git tag v4.1.0-rc.2
git push origin v4.1.0-rc.2

# Beta (less stable than RC)
git tag v4.1.0-beta.1
git push origin v4.1.0-beta.1
```

CI will:
- Build for all platforms (same artifacts as stable)
- Sign and notarize macOS builds
- Skip Windows code signing (SSL.com eSigner has per-signing costs)
- Generate blockmaps for differential updates
- Create a **published prerelease** on GitHub (visible to electron-updater)

## Pre-release vs Stable Builds

Pre-releases produce the same artifacts as stable — same formats, same architectures. The only difference is Windows code signing (SSL.com eSigner has per-signing costs):

| Target | Stable | Pre-release |
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
v4.0.0          ← current stable
v4.1.0-beta.1   ← early testing
v4.1.0-beta.2   ← bug fixes from beta feedback
v4.1.0-rc.1     ← feature-complete, final testing
v4.1.0-rc.2     ← last-minute fix
v4.1.0          ← stable release (everyone gets it)
```

## Semver Ordering

electron-updater uses semver for version comparison:

```
4.0.0 < 4.1.0-alpha.1 < 4.1.0-beta.1 < 4.1.0-rc.1 < 4.1.0-rc.2 < 4.1.0
```

- Pre-release tags only affect ordering within the same `major.minor.patch`
- `4.1.0-rc.1` is greater than `4.0.0` (different minor version)
- `4.1.0-rc.1` is less than `4.1.0` (prerelease < release at same version)

## How electron-updater Picks Up Releases

The app uses the GitHub provider (`dev-app-update.yml`). On each check:

1. Queries the GitHub Releases API (unauthenticated, public)
2. Filters by `prerelease` flag based on user's channel setting (`allowPrerelease`)
3. Compares versions via semver
4. If a newer version exists, downloads and notifies the user

**Important**: Draft releases are invisible to the public API. Pre-releases must be **published** (not draft) for electron-updater to see them.

## Tagging from a Branch

You can tag from any branch — CI triggers on any `v*` tag push regardless of branch:

```bash
# Tag a pre-release from a feature branch
git checkout refactor/some-feature
git tag v4.1.0-rc.1
git push origin v4.1.0-rc.1
```

## Deleting a Bad Release

If a pre-release has issues:

1. Delete the GitHub release (stops new downloads)
2. Delete the git tag: `git push origin :refs/tags/v4.1.0-rc.1`
3. Users who already downloaded it keep that version until a newer one is published

## Required CI Secrets

See [CI_SETUP.md](CI_SETUP.md) for the full list of secrets needed for signing and notarization. Pre-releases require macOS signing secrets but skip Windows signing secrets (SSL.com eSigner).

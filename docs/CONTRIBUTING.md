# Contributing to OpenHeaders

Thank you for your interest in OpenHeaders! We welcome community involvement through bug reports, feature requests, and discussions.

## How to Contribute

### Report Bugs

Found a bug? [Open an issue](https://github.com/OpenHeaders/open-headers-app/issues/new) with:

- Steps to reproduce
- Expected vs actual behavior
- Platform (macOS/Windows/Linux) and app version
- Screenshots or logs if relevant

### Request Features

Have an idea? [Open an issue](https://github.com/OpenHeaders/open-headers-app/issues/new) describing:

- What you'd like to see
- Why it would be useful
- Any implementation ideas (optional)

### Ask Questions & Discuss

Use [GitHub Discussions](https://github.com/OpenHeaders/open-headers-app/discussions) for:

- Questions about how the app works
- Ideas you'd like feedback on before filing an issue
- Sharing how you use OpenHeaders

## Code Contributions

We are not currently accepting pull requests. Here's why:

OpenHeaders has a deep set of architectural conventions — a shared core package with valibot schema validation at system boundaries, a main-process-first design where the renderer is a thin subscriber, strict typing with zero `any`, and 7900+ tests that enforce all of it. These patterns are still being actively established and refined. Accepting external code while the conventions are evolving leads to inconsistency and creates more review overhead than implementing directly.

The most valuable contribution right now is **telling us what to build** — bug reports from real usage, feature requests from real workflows, and edge cases we haven't thought of. That's harder to get than code, and it directly shapes what gets built next.

This will evolve as the project matures and the architecture stabilizes. If you'd like to contribute code in the future, start by opening an issue to discuss the change.

## Development Setup

If you want to run the project locally (for testing, debugging, or exploring the code):

```bash
git clone https://github.com/OpenHeaders/open-headers-app.git
cd open-headers-app
pnpm install
pnpm turbo typecheck      # Typecheck all packages
pnpm turbo test            # Run all tests
pnpm turbo build           # Build everything
```

See [DEVELOPER.md](DEVELOPER.md) for full technical documentation.

## Issue Labels

| Label | Description |
|-------|-------------|
| `bug` | Something isn't working |
| `feature` | New feature request |
| `enhancement` | Improvement to existing functionality |
| `question` | Needs clarification or discussion |
| `good first issue` | Simple issues for newcomers to report or verify |
| `platform-macos` | macOS-specific |
| `platform-windows` | Windows-specific |
| `platform-linux` | Linux-specific |

## Code of Conduct

Be respectful and constructive in all interactions. We're building something useful together.

## Thank You

Every bug report, feature idea, and question helps make OpenHeaders better. We appreciate your involvement!

# Development

This document is for contributors working on the repository.

## Setup

```bash
npm install
```

`npm install` runs the local Husky setup when the checkout has a `.git` directory.

## Local Commands

Run the CLI from source:

```bash
npm run dev -- --help
npm run dev -- profile:add
npm run dev -- tui
```

Run the full local verification suite:

```bash
npm run verify
```

Run release-grade verification, including package smoke tests:

```bash
npm run verify:publish
```

## Quality Gates

Pre-commit runs `lint-staged`.

Pre-push runs:

```bash
npm run verify
```

## Package Contents

The published package builds to `dist/` and includes only:

- `bin/`
- `dist/runtime/`
- `README.md`
- `package.json`

The package smoke test packs the package, installs it in a temporary directory, and
checks the installed binary against a small profile workflow.

## Release

GitHub Actions publishes `@forceuser/git-profile-switcher` to the public npm registry
from SemVer tags or published GitHub releases.

Local helpers:

```bash
npm run bump:patch
npm run bump:minor
npm run bump:major
npm run bump -- 1.2.3
```

Before pushing a release tag:

```bash
npm run verify:publish
npm run release:check-tag -- 1.2.3
```

For the full CI publishing contract, see
[Release With GitHub Actions](./operations/release-with-github-actions.md).

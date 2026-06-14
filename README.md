# Git Profile Switcher

`gip` is a small local-first CLI/TUI for managing multiple Git identities and applying
them automatically per directory with Git `includeIf`.

It keeps profile metadata in app data, writes generated profile config files, and manages
one clearly marked block in your global `~/.gitconfig`.

## Quick Start

```bash
npm test
npm run dev -- profile:add
npm run dev -- profile:add work --user-name "Work Name" --user-email work@example.com
npm run dev -- use
npm run dev -- use work
npm run dev -- prompt
npm run dev -- prompt --format profile
```

## Common Commands

```bash
gip profile:add
gip profile:add work --user-name "Work Name" --user-email work@example.com
gip profile:list
gip profile:color work cyan
gip use
gip use work
gip use work --global
gip now work
gip now --clear
gip clear
gip clear --global
gip rule:add ~/Developer/Work
gip rule:add work ~/Developer/Work
gip rule:list
gip apply
gip doctor
gip prompt --format profile
gip tui
gip install:shell zsh
gip install:prompt zsh
gip install:prompt zsh --format profile
```

## Development

```bash
npm install
npm run verify
npm run verify:publish
```

`npm install` runs the local Husky setup when the checkout has a `.git` directory.
Pre-commit runs `lint-staged`; pre-push runs `npm run verify`.

## Publication

The package builds to `dist/` and publishes only `bin/`, `dist/runtime/`, `README.md`,
and `package.json`.

```bash
npm run build
npm run smoke:package
npm run verify:publish
```

GitHub Actions publishes to the public npm registry from SemVer tags or GitHub releases.
See [Release With GitHub Actions](./docs/operations/release-with-github-actions.md).

## Shell Prompt

After installing prompt integration, your shell prompt can show the effective Git identity
for the current directory. The prompt command itself is intentionally plain:

```bash
gip prompt
gip prompt --json
```

Use `gip profile:color` to color the managed profile segment in installed shell prompts.

## Storage

Default app data lives at:

```text
~/.config/git-profile-switcher/
```

Generated Git config snippets live under:

```text
~/.config/git-profile-switcher/gitconfigs/
```

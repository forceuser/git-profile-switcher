# Git Profile Switcher

`gip` helps you use the right Git identity in the right directory.

It stores named profiles, writes Git `includeIf` rules for directory-based switching,
and can show the active profile in your shell prompt.

## Install

```bash
npm install -g @forceuser/git-profile-switcher
```

After installation, the CLI is available as both:

```bash
gip --help
git-profile-switcher --help
```

## Quick Start

Create your profiles:

```bash
gip profile:add personal
gip profile:add work --user-name "Work Name" --user-email work@example.com
```

Use a profile in the current directory:

```bash
cd ~/Projects/work-app
gip use work
```

From now on, Git uses that profile in this directory and its Git repositories.

Check what Git identity is active:

```bash
gip doctor
```

## Daily Use

Pick from your saved profiles:

```bash
gip use
```

Set a global fallback identity:

```bash
gip use personal --global
```

Clear the current directory rule:

```bash
gip clear
```

Clear the global fallback identity:

```bash
gip clear --global
```

Open the terminal UI:

```bash
gip tui
```

## Session-Only Identity

Use `now` when you want a profile only in the current terminal session:

```bash
gip install:shell zsh
source ~/.zshrc

gip now work
gip now --clear
```

Without shell integration, use:

```bash
eval "$(gip now work --exports)"
```

## Shell Prompt

Install prompt integration to show the active profile in your prompt:

```bash
gip install:prompt zsh
source ~/.zshrc
```

Choose prompt colors per profile:

```bash
gip profile:color work cyan
```

Install completion, session wrapper, and prompt integration together:

```bash
gip install:all zsh
```

Supported shells: `zsh`, `bash`, and `fish`.

## Move To A New Machine

Export profiles:

```bash
gip export
```

Import profiles on another machine:

```bash
gip import
```

By default, both commands use:

```text
~/gip-profiles.json
```

Directory rules are machine-specific, so `gip` skips them by default. Include them only
when you explicitly want to migrate the same directory mappings:

```bash
gip export --rules
gip import --rules
```

## Where Data Lives

Profile metadata:

```text
~/.config/git-profile-switcher/
```

Generated Git config snippets:

```text
~/.config/git-profile-switcher/gitconfigs/
```

`gip` manages one marked block in your global Git config and leaves unrelated content
alone.

## Useful Commands

```bash
gip profile:list
gip profile:remove work
gip rule:list
gip rule:add work ~/Projects/work-app
gip rule:remove <rule-id>
gip paths
gip prompt
gip help <command>
```

For development and release notes, see
[Development](https://github.com/forceuser/git-profile-switcher/blob/main/docs/development.md).

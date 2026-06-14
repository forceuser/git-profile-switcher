# Shell Prompt

`gip prompt` prints prompt-friendly Git profile status for the current directory.

```bash
gip prompt
gip prompt --format identity
gip prompt --format profile
gip prompt --format auto
gip prompt --profile
gip prompt --json
gip profile:color work cyan
gip profile:color work no-color
```

The prompt does not mutate state. It reads the same Git config Git itself would use:

```bash
git config user.name
git config user.email
```

It also respects session-scoped overrides set by `gip now`, using `GIP_PROFILE_NAME`,
`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL`
before directory rules or global Git config. `gip now` also sets Git's environment
config override for `user.name` and `user.email`, so Git config lookups in that shell
see the session identity.
Use `gip install:shell` to install only the shell wrapper that makes `gip now <profile>`
affect the current shell without a manual `eval`. The wrapper calls `gip now --exports`
internally, so interactive output stays separate from shell code.

By default, `gip prompt` uses `--format auto`: it prints the matching managed profile
segment, such as `[gip work]`, and falls back to the effective Git identity.
Use `--format identity` to always print `Name <email>`.
Use `--format profile` or `--profile` to print only the matching managed profile segment.
Profile prompt colors are optional. Use `gip profile:color` to choose `[no color]` or a
terminal-safe ANSI foreground color: red, green, yellow, blue, magenta, cyan, gray, or a
bright variant except white. The installed shell prompt block passes `GIP_PROMPT_SHELL`
so colored segments are escaped correctly for zsh, bash, and fish.

## Installation

```bash
gip install:prompt zsh
gip install:prompt zsh --format identity
gip install:prompt zsh --format profile
gip install:prompt zsh --format auto
gip install:prompt bash
gip install:prompt fish
```

The install command embeds the selected prompt format in the managed shell snippet.
For zsh, bash, and fish, the managed block keeps prompt output on its own line: it renders the
`gip` segment on its own line for single-line prompts, and inline before prompts that
already span multiple lines.

Uninstall removes only the managed block:

```bash
gip uninstall:prompt zsh
```

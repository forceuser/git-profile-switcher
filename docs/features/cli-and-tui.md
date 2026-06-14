# CLI and TUI

The CLI is the primary interface.

## Profile Commands

- `profile:add [profile] [--user-name <name>] [--user-email <email>]`
- `profile:list [--json]`
- `profile:color [profile] [color|no-color]`
- `profile:remove <profile>`

When any `profile:add` field is omitted, the CLI asks for it interactively.
Profile selections default to the first listed profile when Enter is pressed.
`profile:color` sets the shell prompt color for a profile. When omitted, the CLI asks
with a selector containing `[no color]`, red, green, yellow, blue, magenta, cyan, gray,
and bright variants except white.

## Directory Rules

- `use [profile] [directory]`
- `use [profile] --global`
- `now [profile] [--clear]`
- `clear [directory]`
- `clear --global`
- `rule:add [profile] [directory]`
- `rule:list [--json]`
- `rule:remove <rule-id>`
- `apply`

`use` is the shortest path for the current project: it assigns a profile to the current
directory when `[directory]` is omitted, replaces any exact-path managed rule for another
profile, and runs `apply`.

When `[profile]` is omitted, `use` shows the saved profiles and accepts either a list
number or profile name.

`use --global` sets the selected profile as the fallback Git `user.name` and `user.email`
in the global Git config instead of creating an `includeIf` directory rule.

`now` sets the selected profile only for the current shell session through
`GIP_PROFILE_NAME`, `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and
`GIT_COMMITTER_EMAIL`. It also sets Git's environment config override for `user.name`
and `user.email`, so `git config --get user.email` reflects the session profile.
Installed shell integration evaluates it automatically, so
`gip now work` affects only the current terminal. Without shell integration, use
`eval "$(gip now work --exports)"`. `gip now --clear` removes the session override when
shell integration is installed; without it, use `eval "$(gip now --clear --exports)"`.
The `--exports` flag is the explicit machine-readable mode used by shell wrappers.

`clear` removes the exact managed rule for the current directory, or `[directory]` when
one is provided, then runs `apply`. `clear --global` removes the global Git `user.name`
and `user.email` fallback.

`rule:add` also shows the saved profile list when the profile is omitted. With one
argument, an existing profile name is treated as the profile and any other value is treated
as the directory.

Rules created with `rule:add` are not fully active until `apply` writes generated Git
config files and refreshes the managed block in the global Git config.

## Migration

- `export [--output <path>] [--profiles-only]` writes a portable backup bundle
  containing profiles and directory rules. When no output path is provided, it writes
  `~/gip-profiles.json`.
- `import [--input <path>] [--replace] [--profiles-only] [--no-apply]` reads a backup bundle and merges it
  into the local profile store by default. When no input path is provided, it reads
  `~/gip-profiles.json`.

`import --replace` swaps the local profile store with the imported one. After import, the
CLI runs `apply` automatically so generated Git config files and the managed global
`includeIf` block are refreshed for the new machine. Use `--no-apply` when you only want
to update metadata. Use `--profiles-only` with export or import to transfer profile
records without directory rules.

## Diagnostics

- `doctor [cwd] [--json]` reports the effective Git identity and matching managed rule.
- `prompt [--format identity|profile|auto] [--profile] [--json]` prints prompt-friendly
  identity or profile text.
- `paths [--json]` reports app-data and Git config paths without mutating anything.

## Help And Completion

Every command supports `--help` and `-h`, and the same help text is available with
`gip help <command>`.

- `completion [zsh|bash|fish]` prints a shell completion script.
- `install:completion [zsh|bash|fish] [--config <path>]` installs a managed completion
  block into the shell config file.
- `uninstall:completion [zsh|bash|fish] [--config <path>]` removes the managed completion
  block.
- `install:shell [zsh|bash|fish] [--config <path>]` installs only the shell wrapper used
  by session commands such as `gip now`.
- `uninstall:shell [zsh|bash|fish] [--config <path>]` removes the shell wrapper block.
- `install [zsh|bash|fish]` installs the current package globally with npm, then installs
  the full shell bundle.
- `update [zsh|bash|fish]` installs `@forceuser/git-profile-switcher@latest` globally with npm,
  then refreshes the full shell bundle.
- `install all [zsh|bash|fish]` and `install:all [zsh|bash|fish]` install completion,
  shell wrapper, and prompt blocks without reinstalling the package.
- `uninstall:all [zsh|bash|fish]` removes completion, shell wrapper, and prompt blocks.

The completion engine suggests commands, command flags, prompt formats, shells, saved
profile names, and rule ids where those values are expected.

## TUI

`gip tui` offers interactive menus for profiles, directory rules, diagnostics,
import/export migration, shell integration, and package install/update helpers. It uses
the same arrow-key selector as interactive CLI prompts.
The Profiles view opens as a selectable list with `[Add profile]` first; selecting an
existing profile opens `[Use profile here <current-directory>]`, `[Edit profile]`, and
`[Set prompt color]`, and `[Remove profile]` actions.
Prompt-color selectors and profile rows show a colored `■` swatch beside selected colors.
The Directory rules view opens as a selectable list with `[Add rule]` first; selecting
an existing rule opens a `[Remove rule]` action. Removing a profile or directory rule
refreshes the generated Git config immediately.

# Architecture

`gip` is intentionally smaller than Keyring Secret Vault. It keeps the same useful shape:
docs-first navigation, small runtime modules, CLI/TUI entrypoints, and focused tests.

## Runtime Modules

- `runtime/app` - command dispatcher and process IO boundary.
- `runtime/cli` - help text and CLI parsing helpers.
- `runtime/config` - app-data and gitconfig path resolution.
- `runtime/git` - Git config rendering, managed block install, and active identity reads.
- `runtime/profiles` - profile and directory-rule metadata repository.
- `runtime/prompt` - current-directory prompt status.
- `runtime/shell` - shell config install/uninstall for prompt integration.
- `runtime/tui` - terminal menu workflow.

## Data Model

Profiles contain Git identity fields:

```json
{
  "name": "work",
  "userName": "Work Name",
  "userEmail": "work@example.com",
  "promptColor": "cyan"
}
```

Directory rules map a profile to a path prefix and become Git `includeIf` rules.
`promptColor` is optional and affects only shell prompt rendering.

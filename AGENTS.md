# Git Profile Switcher

## Working Rules

- Run npm commands from the project root.
- Keep `test/` mirrored to `runtime/` for focused coverage.
- Every `runtime/*` directory should keep a short `README.md`.
- Update docs in `docs/` whenever a meaningful feature or structural concept changes.
- Keep runtime TypeScript erasable for Node strip-types mode.
- Avoid browser UI work; this project is CLI and TUI only.

## Preferred Tooling

- Node.js 22+ with native TypeScript execution.
- `oxlint`, `oxfmt`, `tsc`, `node --test`.
- Built-in Node APIs first; add dependencies only when they remove real complexity.

## Product Direction

- Automate Git `user.name` and `user.email` selection per directory.
- Use Git `includeIf` as the source of truth for directory switching.
- Keep profile metadata outside Git config, then generate managed Git config snippets.
- Provide CLI, TUI, completion-ready help, and shell prompt status.

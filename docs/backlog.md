# Backlog

## Current Focus

- CLI baseline for profile creation, directory rules, apply, prompt, and diagnostics.
- TUI baseline for common profile/rule/apply workflows.
- Shell prompt integration for zsh/bash/fish.

## Landed

- Bootstrap scaffold: package metadata, docs-first structure, runtime/test mirrors, and
  Node strip-types scripts.
- Publish baseline: build-to-`dist`, package allowlist, `prepack`, `prepublishOnly`,
  packed package smoke test, SemVer tag guard, and GitHub Actions tag pipeline.
- Local quality baseline: `oxlint`, `oxfmt`, `lint-staged`, and generated Husky pre-commit
  plus pre-push hooks.
- Git `includeIf` generator: managed global gitconfig block plus generated per-profile
  config files.
- Profile metadata store: local JSON repository for Git identities and directory rules.
- CLI baseline: profile/rule management, apply, doctor, prompt, and prompt install helpers.
- Import/export migration bundle for profiles and directory rules.
- Shell completion scripts plus managed shell install/update helpers.
- TUI baseline: interactive profile/rule/apply menu for real terminals.

## Next

- Expand shell completion coverage as new commands and option values are added.
- Add safer conflict diagnostics when unmanaged `includeIf` rules overlap managed rules.
- Add changelog enforcement before the first public release.

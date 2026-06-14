# Release With GitHub Actions

This project uses a commit-first, tag-second release model and publishes
`@forceuser/git-profile-switcher` to the public npm registry.

## Release Contract

1. Update `package.json`, `package-lock.json`, and `pnpm-lock.yaml` to the release state.
2. Commit that release change set.
3. Create a SemVer tag like `1.2.3` or `v1.2.3` on that commit.
4. Push the commit and tag, or create a GitHub release from that tag.
5. Let GitHub Actions verify, pack, and publish to npm.

## Required GitHub Secret

- `NPM_TOKEN`
  npm automation token with permission to publish `@forceuser/git-profile-switcher`.

## Local Release Helpers

```bash
npm run bump:patch
npm run bump:minor
npm run bump:major
npm run bump -- 1.2.3
```

Before pushing a release tag, run:

```bash
npm run verify:publish
```

## Tag And Release Workflow

`.github/workflows/publish.yml` runs for:

- pushed tags that look like SemVer tags;
- published GitHub releases.

The workflow:

1. installs dependencies with `npm ci`;
2. verifies the tag matches `package.json`;
3. runs `npm run verify:publish`;
4. checks whether that exact package version already exists on npm;
5. publishes with `npm publish --access public` when the version is not already published.

The npm existence check lets both tag pushes and GitHub release events be enabled without
failing if the same version is observed twice.

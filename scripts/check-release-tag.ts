#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SEMVER_TAG_PATTERN = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

async function main() {
  const tag = process.argv[2] ?? process.env.CI_COMMIT_TAG;
  if (!tag) {
    throw new Error("Release tag is required.");
  }

  const match = SEMVER_TAG_PATTERN.exec(tag);
  if (!match) {
    throw new Error(`Release tag must be SemVer-shaped, received: ${tag}`);
  }

  const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
    name?: string;
    version?: string;
  };
  const tagVersion = match[1]!;
  if (packageJson.version !== tagVersion) {
    throw new Error(
      `Release tag ${tag} does not match package.json version ${packageJson.version}.`,
    );
  }

  if (packageJson.name !== "@forceuser/git-profile-switcher") {
    throw new Error(`Unexpected package name: ${packageJson.name}`);
  }

  console.log(`Release tag ${tag} matches ${packageJson.name}@${packageJson.version}.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

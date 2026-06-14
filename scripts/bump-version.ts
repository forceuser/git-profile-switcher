#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type BumpKind = "major" | "minor" | "patch";

async function main() {
  const input = process.argv[2] ?? "patch";
  const packageJsonPath = resolve("package.json");
  const packageLockPath = resolve("package-lock.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    version: string;
  };
  const nextVersion = parseBump(input, packageJson.version);
  packageJson.version = nextVersion;
  await writeJson(packageJsonPath, packageJson);

  try {
    const lockJson = JSON.parse(await readFile(packageLockPath, "utf8")) as {
      version?: string;
      packages?: Record<string, { version?: string }>;
    };
    lockJson.version = nextVersion;
    if (lockJson.packages?.[""]) {
      lockJson.packages[""].version = nextVersion;
    }
    await writeJson(packageLockPath, lockJson);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  console.log(`Updated package version to ${nextVersion}.`);
  console.log(
    `Next: git add package.json package-lock.json pnpm-lock.yaml && git commit -m "chore(release): ${nextVersion}"`,
  );
  console.log(
    `Then: git tag ${nextVersion} && git push origin HEAD && git push origin ${nextVersion}`,
  );
}

function parseBump(input: string, currentVersion: string) {
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(input)) {
    return input;
  }

  if (input !== "major" && input !== "minor" && input !== "patch") {
    throw new Error(`Expected explicit version, major, minor, or patch. Received: ${input}`);
  }

  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(currentVersion);
  if (!match) {
    throw new Error(`Cannot bump non-SemVer package version: ${currentVersion}`);
  }

  const parts = match.slice(1).map((part) => Number(part));
  const [major, minor, patch] = parts as [number, number, number];
  const bump = input satisfies BumpKind;
  if (bump === "major") {
    return `${major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

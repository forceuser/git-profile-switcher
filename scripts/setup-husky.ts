#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const huskyDir = path.join(repoRoot, ".husky");
const preCommitHookPath = path.join(huskyDir, "pre-commit");
const prePushHookPath = path.join(huskyDir, "pre-push");
const huskyBinPath = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "husky.cmd" : "husky",
);

const preCommitHookBody = `#!/usr/bin/env sh
exec ./node_modules/.bin/lint-staged --config lint-staged.config.mjs --allow-empty
`;

const prePushHookBody = `#!/usr/bin/env sh
exec npm run verify
`;

function installHuskyHooks(cwd = repoRoot) {
  if (process.env.CI === "true") {
    console.log("Skipping Husky setup in CI.");
    return;
  }

  if (!existsSync(path.join(cwd, ".git"))) {
    console.log(`Skipping Husky setup because no .git directory was found at ${cwd}.`);
    return;
  }

  if (!existsSync(huskyBinPath)) {
    console.log(`Skipping Husky setup because ${huskyBinPath} is not available yet.`);
    return;
  }

  execFileSync(huskyBinPath, [".husky"], {
    cwd,
    stdio: "inherit",
  });
}

async function writeHook(hookPath: string, body: string) {
  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeFile(hookPath, body, "utf8");
  await chmod(hookPath, 0o755);
}

export async function setupHusky() {
  if (process.env.CI === "true") {
    console.log("Skipping Husky hook file generation in CI.");
    return;
  }

  installHuskyHooks();
  await writeHook(preCommitHookPath, preCommitHookBody);
  await writeHook(prePushHookPath, prePushHookBody);
  console.log(`Husky hooks are ready at ${preCommitHookPath} and ${prePushHookPath}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await setupHusky();
}

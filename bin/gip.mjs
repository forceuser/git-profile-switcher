#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const builtRuntime = join(root, "dist", "runtime", "app", "index.js");
if (existsSync(builtRuntime)) {
  await import(`file://${builtRuntime}`);
} else {
  const runtime = join(root, "runtime", "app", "index.ts");
  const result = spawnSync(
    process.execPath,
    ["--conditions=gip-source", "--experimental-strip-types", runtime, ...process.argv.slice(2)],
    { stdio: "inherit" },
  );

  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 0;
  }
}

#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface CommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  expectedStatus?: number;
  timeoutMs?: number;
}

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

const REQUIRED_TARBALL_ENTRIES = [
  "package/bin/gip.mjs",
  "package/dist/runtime/app/index.js",
  "package/dist/runtime/git/config.js",
  "package/dist/runtime/profiles/repository.js",
  "package/README.md",
  "package/package.json",
] as const;

const FORBIDDEN_TARBALL_PATTERNS = [
  /^package\/runtime\//,
  /^package\/test\//,
  /^package\/scripts\//,
  /^package\/docs\//,
  /^package\/node_modules\//,
  /^package\/dist\/.*\.ts$/,
] as const;

async function main() {
  const sourceRoot = process.cwd();
  const tempRoot = await mkdtemp(join(tmpdir(), "gip-package-smoke-"));
  const packDir = join(tempRoot, "pack");
  const installDir = join(tempRoot, "install");
  const npmCacheDir = join(tempRoot, "npm-cache");
  const env = {
    ...process.env,
    NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? npmCacheDir,
    npm_config_cache: process.env.npm_config_cache ?? npmCacheDir,
  };

  try {
    await mkdir(packDir, { recursive: true });
    await mkdir(installDir, { recursive: true });

    await run("npm", ["run", "build"], { cwd: sourceRoot, env, timeoutMs: 120_000 });
    await run("npm", ["pack", "--pack-destination", packDir], {
      cwd: sourceRoot,
      env,
      timeoutMs: 120_000,
    });

    const tarballs = (await readdir(packDir)).filter((fileName) => fileName.endsWith(".tgz"));
    if (tarballs.length !== 1) {
      throw new Error(`Expected one packed tarball, found ${tarballs.length}.`);
    }

    const tarballPath = join(packDir, tarballs[0]!);
    await assertTarballContents(tarballPath, { cwd: sourceRoot, env });

    await run(
      "npm",
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        "--fetch-timeout=30000",
        tarballPath,
      ],
      { cwd: installDir, env, timeoutMs: 240_000 },
    );

    const bin = join(
      installDir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "gip.cmd" : "gip",
    );
    const appDataDir = join(tempRoot, "app-data");
    const homeDir = join(tempRoot, "home");
    const workDir = join(tempRoot, "work");
    const gitConfigPath = join(homeDir, ".gitconfig");
    await mkdir(workDir, { recursive: true });
    const commandEnv = {
      ...process.env,
      HOME: homeDir,
      GIP_APP_DATA_DIR: appDataDir,
      GIP_GLOBAL_GITCONFIG: gitConfigPath,
    };

    await run(bin, ["--help"], { cwd: installDir, env: commandEnv });
    await run(
      bin,
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: installDir, env: commandEnv },
    );
    await run(bin, ["rule:add", "work", workDir], {
      cwd: installDir,
      env: commandEnv,
    });
    await run(bin, ["apply"], { cwd: installDir, env: commandEnv });
    const prompt = await run(bin, ["prompt"], {
      cwd: workDir,
      env: commandEnv,
    });
    if (!prompt.stdout.includes("[gip work]")) {
      throw new Error(`Unexpected prompt output: ${prompt.stdout}`);
    }
    const gitConfig = await readFile(gitConfigPath, "utf8");
    if (!gitConfig.includes("# >>> gip includeIf >>>")) {
      throw new Error("Installed package did not write the managed includeIf block.");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function assertTarballContents(
  tarballPath: string,
  options: { cwd: string; env: NodeJS.ProcessEnv },
) {
  const result = await run("tar", ["-tf", tarballPath], {
    cwd: options.cwd,
    env: options.env,
  });
  const entries = result.stdout.trim().split("\n");
  for (const required of REQUIRED_TARBALL_ENTRIES) {
    if (!entries.includes(required)) {
      throw new Error(`Packed tarball is missing required entry: ${required}`);
    }
  }
  for (const entry of entries) {
    const forbidden = FORBIDDEN_TARBALL_PATTERNS.find((pattern) => pattern.test(entry));
    if (forbidden) {
      throw new Error(`Packed tarball includes forbidden entry: ${entry}`);
    }
  }
}

async function run(command: string, args: string[], options: CommandOptions) {
  const result = await runCommand(command, args, options);
  const expectedStatus = options.expectedStatus ?? 0;
  if (result.status !== expectedStatus) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `Expected status: ${expectedStatus}`,
        `Actual status: ${result.status}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n"),
    );
  }
  return result;
}

function runCommand(command: string, args: string[], options: CommandOptions) {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out after ${options.timeoutMs ?? 30_000}ms: ${command}`));
    }, options.timeoutMs ?? 30_000);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status: status ?? 0, stdout, stderr });
    });
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

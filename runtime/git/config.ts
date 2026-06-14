import { execFile, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import type { DirectoryRule, GitIdentityProfile, ProfileStoreData } from "#profiles/types";

export const GIT_INCLUDE_BLOCK_START = "# >>> gip includeIf >>>";
export const GIT_INCLUDE_BLOCK_END = "# <<< gip includeIf <<<";

const GIT_INCLUDE_BLOCK_PATTERN = new RegExp(
  `${escapeRegExp(GIT_INCLUDE_BLOCK_START)}\\n[\\s\\S]*?\\n${escapeRegExp(
    GIT_INCLUDE_BLOCK_END,
  )}\\n?`,
  "g",
);

export interface ApplyGitConfigResult {
  globalGitConfigPath: string;
  generatedFiles: string[];
  changed: boolean;
}

export interface ActiveGitIdentity {
  userName: string | null;
  userEmail: string | null;
}

export interface GlobalGitIdentityResult {
  globalGitConfigPath: string;
  changed: boolean;
}

const execFileAsync = promisify(execFile);

export async function applyGitProfileConfig(input: {
  data: ProfileStoreData;
  globalGitConfigPath: string;
  generatedGitConfigDir: string;
}) {
  await mkdir(input.generatedGitConfigDir, { recursive: true });
  const generatedFiles: string[] = [];

  for (const profile of input.data.profiles) {
    const path = getGeneratedProfileConfigPath(input.generatedGitConfigDir, profile.name);
    await writeFile(path, renderProfileGitConfig(profile), { mode: 0o600 });
    generatedFiles.push(path);
  }

  const current = await readOptionalText(input.globalGitConfigPath);
  const next = appendManagedBlock(
    removeManagedIncludeBlock(current),
    renderIncludeBlock(input.data.rules, input.generatedGitConfigDir),
  );

  if (next === current) {
    return {
      globalGitConfigPath: input.globalGitConfigPath,
      generatedFiles,
      changed: false,
    } satisfies ApplyGitConfigResult;
  }

  await mkdir(dirname(input.globalGitConfigPath), { recursive: true });
  await writeFile(input.globalGitConfigPath, next, { mode: 0o600 });

  return {
    globalGitConfigPath: input.globalGitConfigPath,
    generatedFiles,
    changed: true,
  } satisfies ApplyGitConfigResult;
}

export async function setGlobalGitIdentity(input: {
  profile: GitIdentityProfile;
  globalGitConfigPath: string;
}) {
  const currentName = await readGitConfigFileValue(input.globalGitConfigPath, "user.name");
  const currentEmail = await readGitConfigFileValue(input.globalGitConfigPath, "user.email");
  if (currentName === input.profile.userName && currentEmail === input.profile.userEmail) {
    return {
      globalGitConfigPath: input.globalGitConfigPath,
      changed: false,
    } satisfies GlobalGitIdentityResult;
  }

  const before = await readOptionalText(input.globalGitConfigPath);
  await mkdir(dirname(input.globalGitConfigPath), { recursive: true });
  await writeGitConfigValue(input.globalGitConfigPath, "user.name", input.profile.userName);
  await writeGitConfigValue(input.globalGitConfigPath, "user.email", input.profile.userEmail);
  const after = await readOptionalText(input.globalGitConfigPath);

  return {
    globalGitConfigPath: input.globalGitConfigPath,
    changed: before !== after,
  } satisfies GlobalGitIdentityResult;
}

export async function clearGlobalGitIdentity(globalGitConfigPath: string) {
  const currentName = await readGitConfigFileValue(globalGitConfigPath, "user.name");
  const currentEmail = await readGitConfigFileValue(globalGitConfigPath, "user.email");
  if (!currentName && !currentEmail) {
    return {
      globalGitConfigPath,
      changed: false,
    } satisfies GlobalGitIdentityResult;
  }

  const before = await readOptionalText(globalGitConfigPath);
  if (!before) {
    return {
      globalGitConfigPath,
      changed: false,
    } satisfies GlobalGitIdentityResult;
  }

  await unsetGitConfigValue(globalGitConfigPath, "user.name");
  await unsetGitConfigValue(globalGitConfigPath, "user.email");
  const after = await readOptionalText(globalGitConfigPath);

  return {
    globalGitConfigPath,
    changed: before !== after,
  } satisfies GlobalGitIdentityResult;
}

export function findMatchingRule(data: ProfileStoreData, cwd: string) {
  const candidates = getDirectoryMatchCandidates(cwd);
  return (
    data.rules
      .filter((rule) =>
        getDirectoryMatchCandidates(rule.directory).some((ruleDirectory) =>
          candidates.some((candidate) => candidate.startsWith(ruleDirectory)),
        ),
      )
      .sort((left, right) => right.directory.length - left.directory.length)[0] ?? null
  );
}

export function renderProfileGitConfig(profile: GitIdentityProfile) {
  return `[user]\n\tname = ${escapeGitConfigValue(profile.userName)}\n\temail = ${escapeGitConfigValue(
    profile.userEmail,
  )}\n`;
}

export function renderIncludeBlock(rules: DirectoryRule[], generatedGitConfigDir: string) {
  const body = rules
    .map((rule) => {
      const path = getGeneratedProfileConfigPath(generatedGitConfigDir, rule.profileName);
      return `[includeIf "gitdir:${rule.directory}"]\n\tpath = ${path}`;
    })
    .join("\n\n");
  return `${GIT_INCLUDE_BLOCK_START}\n${body}\n${GIT_INCLUDE_BLOCK_END}\n`;
}

export function removeManagedIncludeBlock(text: string) {
  return text
    .replace(GIT_INCLUDE_BLOCK_PATTERN, "")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function appendManagedBlock(text: string, block: string) {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return block;
  }
  return `${trimmed}\n\n${block}`;
}

export function readActiveGitIdentity(cwd = process.cwd()): ActiveGitIdentity {
  return {
    userName: readGitConfigValue("user.name", cwd),
    userEmail: readGitConfigValue("user.email", cwd),
  };
}

export function getGeneratedProfileConfigPath(dir: string, profileName: string) {
  return join(dir, `${safeFileName(profileName)}.gitconfig`);
}

async function readOptionalText(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function readGitConfigValue(key: string, cwd: string) {
  try {
    const value = execFileSync("git", ["config", key], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return value || null;
  } catch {
    return null;
  }
}

async function writeGitConfigValue(path: string, key: string, value: string) {
  await execFileAsync("git", ["config", "--file", path, key, value]);
}

async function readGitConfigFileValue(path: string, key: string) {
  try {
    const { stdout } = await execFileAsync("git", ["config", "--file", path, key], {
      encoding: "utf8",
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function unsetGitConfigValue(path: string, key: string) {
  try {
    await execFileAsync("git", ["config", "--file", path, "--unset", key]);
  } catch (error) {
    if (isExpectedGitUnsetMiss(error)) {
      return;
    }
    throw error;
  }
}

function isExpectedGitUnsetMiss(error: unknown) {
  return error instanceof Error && "code" in error && (error.code === 5 || error.code === 1);
}

function safeFileName(value: string) {
  return basename(value).replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

function escapeGitConfigValue(value: string) {
  return value.replaceAll("\n", " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDirectoryMatchCandidates(path: string) {
  const withSlash = path.endsWith("/") ? path : `${path}/`;
  const candidates = new Set([withSlash]);
  if (withSlash.startsWith("/private/var/")) {
    candidates.add(withSlash.replace("/private/var/", "/var/"));
  } else if (withSlash.startsWith("/var/")) {
    candidates.add(withSlash.replace("/var/", "/private/var/"));
  }
  return [...candidates];
}

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";

export interface AppPaths {
  homeDir: string;
  appDataDir: string;
  profilesPath: string;
  generatedGitConfigDir: string;
  globalGitConfigPath: string;
}

export function getAppPaths(env: NodeJS.ProcessEnv = process.env): AppPaths {
  const homeDir = env.HOME ? resolve(env.HOME) : homedir();
  const baseConfigDir = env.GIP_APP_DATA_DIR ?? env.XDG_CONFIG_HOME;
  const appDataDir = resolve(
    baseConfigDir
      ? join(baseConfigDir, "git-profile-switcher")
      : join(homeDir, ".config", "git-profile-switcher"),
  );

  return {
    homeDir,
    appDataDir,
    profilesPath: join(appDataDir, "profiles.json"),
    generatedGitConfigDir: join(appDataDir, "gitconfigs"),
    globalGitConfigPath: env.GIP_GLOBAL_GITCONFIG ?? join(homeDir, ".gitconfig"),
  };
}

export function expandHomePath(path: string, homeDir = homedir()) {
  if (path === "~") {
    return homeDir;
  }
  if (path.startsWith("~/")) {
    return join(homeDir, path.slice(2));
  }
  return path;
}

export function normalizeDirectoryPath(path: string, homeDir = homedir()) {
  let normalized = resolve(expandHomePath(path, homeDir));
  try {
    normalized = realpathSync.native(normalized);
  } catch {
    // Directory rules may be created before the directory exists.
  }
  if (!normalized.endsWith("/")) {
    normalized += "/";
  }
  return normalized;
}

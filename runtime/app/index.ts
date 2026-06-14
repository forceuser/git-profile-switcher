import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCompletionSuggestions, generateCompletionScript } from "#cli/completion";
import { parseArgs, getStringFlag, hasFlag } from "#cli/parse";
import { renderHelp } from "#cli/help";
import { createPromptSession } from "#cli/prompts";
import { getAppPaths } from "#config/paths";
import {
  applyGitProfileConfig,
  clearGlobalGitIdentity,
  findMatchingRule,
  readActiveGitIdentity,
  setGlobalGitIdentity,
} from "#git/config";
import { createProfileRepository, normalizePromptColor } from "#profiles/repository";
import {
  createProfileExportBundle,
  mergeProfileStoreData,
  parseProfileImportBundle,
} from "#profiles/transfer";
import {
  PROFILE_PROMPT_COLOR_CODES,
  PROFILE_PROMPT_COLORS,
  type GitIdentityProfile,
  type ProfileStoreData,
  type ProfilePromptColor,
} from "#profiles/types";
import {
  getPromptStatus,
  renderPromptStatus,
  type PromptFormat,
  type PromptShell,
} from "#prompt/status";
import {
  detectShell,
  installShellAll,
  installShellCompletion,
  installShellPrompt,
  installShellSession,
  type SupportedShell,
  uninstallShellAll,
  uninstallShellCompletion,
  uninstallShellPrompt,
  uninstallShellSession,
} from "#shell/integration";
import { runTui } from "#tui/index";

const PACKAGE_NAME = "@forceuser/git-profile-switcher";
const DEFAULT_TRANSFER_FILE_NAME = "gip-profiles.json";

export async function main(args = process.argv.slice(2)) {
  const command = args[0] ?? "help";
  const rest = args.slice(1);
  const parsed = parseArgs(rest);
  const paths = getAppPaths();
  const repository = createProfileRepository(paths.profilesPath);

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(renderHelp(parsed.positionals[0]));
    return;
  }

  if (hasFlag(parsed, "help")) {
    console.log(renderHelp(command));
    return;
  }

  if (command === "__complete") {
    const separatorIndex = rest.indexOf("--");
    const completionArgs = separatorIndex >= 0 ? rest.slice(separatorIndex + 1) : rest;
    const suggestions = await buildCompletionSuggestions({ repository }, completionArgs);
    console.log(suggestions.join("\n"));
    return;
  }

  if (command === "profile:add") {
    const prompts = createPromptSession();
    try {
      const profileName = parsed.positionals[0] ?? (await prompts.askRequired("Profile name: "));
      const userName =
        getStringFlag(parsed, "user-name") ?? (await prompts.askRequired("Git user.name: "));
      const userEmail =
        getStringFlag(parsed, "user-email") ?? (await prompts.askRequired("Git user.email: "));
      const profile = await repository.upsertProfile({ name: profileName, userName, userEmail });
      console.log(`Saved profile ${profile.name}: ${profile.userName} <${profile.userEmail}>`);
    } finally {
      prompts.close();
    }
    return;
  }

  if (command === "profile:list") {
    const data = await repository.read();
    if (hasFlag(parsed, "json")) {
      console.log(JSON.stringify(data.profiles, null, 2));
      return;
    }
    if (data.profiles.length === 0) {
      console.log("No profiles yet.");
      return;
    }
    for (const profile of data.profiles) {
      console.log(renderProfileListLine(profile));
    }
    return;
  }

  if (command === "profile:remove") {
    const profileName = requirePositional(parsed.positionals[0], "profile");
    const removed = await repository.removeProfile(profileName);
    console.log(removed ? `Removed profile ${profileName}.` : `Profile not found: ${profileName}`);
    return;
  }

  if (command === "profile:color") {
    const data = await repository.read();
    const profileName =
      parsed.positionals[0] ??
      (await selectProfile(data.profiles, "Choose profile [1]: ", getActiveProfileName(data)));
    const promptColorArgument = parsePromptColorArgument(parsed.positionals[1]);
    const promptColor =
      promptColorArgument === undefined
        ? await selectProfilePromptColor(`Prompt color for ${profileName}`)
        : promptColorArgument;
    const profile = await repository.setProfilePromptColor({
      name: profileName,
      promptColor,
    });
    console.log(
      profile.promptColor
        ? `Set prompt color for ${profile.name} to ${profile.promptColor}.`
        : `Cleared prompt color for ${profile.name}.`,
    );
    return;
  }

  if (command === "rule:add") {
    const data = await repository.read();
    const firstArg = parsed.positionals[0];
    const secondArg = parsed.positionals[1];
    const firstArgIsProfile = data.profiles.some((profile) => profile.name === firstArg);
    let profileName = firstArgIsProfile ? firstArg! : undefined;
    let directory = secondArg ?? (firstArgIsProfile ? undefined : firstArg);
    if (!profileName || !directory) {
      const prompts = createPromptSession();
      try {
        profileName =
          profileName ??
          (await selectProfileWithSession(
            data.profiles,
            "Choose profile [1]: ",
            prompts,
            getActiveProfileName(data),
          ));
        directory = directory ?? (await prompts.askRequired("Directory: "));
      } finally {
        prompts.close();
      }
    }
    if (!profileName || !directory) {
      throw new Error("Profile and directory are required.");
    }
    const rule = await repository.addRule({
      profileName,
      directory,
      homeDir: paths.homeDir,
    });
    console.log(`Saved rule ${rule.id}: ${rule.profileName} -> ${rule.directory}`);
    return;
  }

  if (command === "rule:list") {
    const data = await repository.read();
    if (hasFlag(parsed, "json")) {
      console.log(JSON.stringify(data.rules, null, 2));
      return;
    }
    if (data.rules.length === 0) {
      console.log("No directory rules yet.");
      return;
    }
    for (const rule of data.rules) {
      console.log(`${rule.id}\t${rule.profileName}\t${rule.directory}`);
    }
    return;
  }

  if (command === "rule:remove") {
    const ruleId = requirePositional(parsed.positionals[0], "rule-id");
    const removed = await repository.removeRule(ruleId);
    console.log(removed ? `Removed rule ${ruleId}.` : `Rule not found: ${ruleId}`);
    return;
  }

  if (command === "use") {
    const data = await repository.read();
    const profileName =
      parsed.positionals[0] ??
      (await selectProfile(data.profiles, "Choose profile [1]: ", getActiveProfileName(data)));
    if (hasFlag(parsed, "global")) {
      const profile = findProfile(data.profiles, profileName);
      const result = await setGlobalGitIdentity({
        profile,
        globalGitConfigPath: paths.globalGitConfigPath,
      });
      console.log(
        `Using global profile ${profile.name}: ${profile.userName} <${profile.userEmail}>`,
      );
      console.log(
        result.changed
          ? `Updated ${result.globalGitConfigPath}.`
          : `${result.globalGitConfigPath} was already up to date.`,
      );
      return;
    }

    const directory = parsed.positionals[1] ?? process.cwd();
    const rule = await repository.setDirectoryProfile({
      profileName,
      directory,
      homeDir: paths.homeDir,
    });
    const nextData = await repository.read();
    const result = await applyGitProfileConfig({
      data: nextData,
      globalGitConfigPath: paths.globalGitConfigPath,
      generatedGitConfigDir: paths.generatedGitConfigDir,
    });
    console.log(`Using profile ${rule.profileName} for ${rule.directory}`);
    console.log(`Generated ${result.generatedFiles.length} profile config file(s).`);
    console.log(
      result.changed
        ? `Updated ${result.globalGitConfigPath}.`
        : `${result.globalGitConfigPath} was already up to date.`,
    );
    return;
  }

  if (command === "now") {
    const shell = resolveShell(parsed, undefined) ?? "bash";
    const printExports = hasFlag(parsed, "exports");
    if (hasFlag(parsed, "clear")) {
      console.log(
        printExports
          ? renderSessionIdentityClear(shell)
          : 'Use shell integration or run `eval "$(gip now --clear --exports)"` to clear the current shell session.',
      );
      return;
    }
    const data = await repository.read();
    const profileName =
      parsed.positionals[0] ??
      (await selectProfileForShellCommand(data.profiles, getActiveProfileName(data)));
    const profile = findProfile(data.profiles, profileName);
    console.log(
      printExports
        ? renderSessionIdentityExports(profile, shell)
        : `Selected session profile ${profile.name}. Use shell integration or run \`eval "$(gip now ${profile.name} --exports)"\` to apply it in this shell.`,
    );
    return;
  }

  if (command === "clear") {
    if (hasFlag(parsed, "global")) {
      const result = await clearGlobalGitIdentity(paths.globalGitConfigPath);
      console.log(
        result.changed
          ? `Cleared global Git user identity in ${result.globalGitConfigPath}.`
          : `Global Git user identity was already clear in ${result.globalGitConfigPath}.`,
      );
      return;
    }

    const directory = parsed.positionals[0] ?? process.cwd();
    const removed = await repository.clearDirectoryProfile({
      directory,
      homeDir: paths.homeDir,
    });
    const data = await repository.read();
    const result = await applyGitProfileConfig({
      data,
      globalGitConfigPath: paths.globalGitConfigPath,
      generatedGitConfigDir: paths.generatedGitConfigDir,
    });
    if (removed.length === 0) {
      console.log(`No profile rule for ${directory}.`);
    } else {
      console.log(`Cleared ${removed.length} profile rule(s) for ${removed[0]!.directory}`);
    }
    console.log(`Generated ${result.generatedFiles.length} profile config file(s).`);
    console.log(
      result.changed
        ? `Updated ${result.globalGitConfigPath}.`
        : `${result.globalGitConfigPath} was already up to date.`,
    );
    return;
  }

  if (command === "apply") {
    const data = await repository.read();
    const result = await applyGitProfileConfig({
      data,
      globalGitConfigPath: paths.globalGitConfigPath,
      generatedGitConfigDir: paths.generatedGitConfigDir,
    });
    console.log(`Generated ${result.generatedFiles.length} profile config file(s).`);
    console.log(
      result.changed
        ? `Updated ${result.globalGitConfigPath}.`
        : `${result.globalGitConfigPath} was already up to date.`,
    );
    return;
  }

  if (command === "export") {
    const data = await repository.read();
    const exportData = hasFlag(parsed, "profiles-only") ? { ...data, rules: [] } : data;
    const bundle = createProfileExportBundle(exportData);
    const outputPath =
      getStringFlag(parsed, "output") ??
      parsed.positionals[0] ??
      join(paths.homeDir, DEFAULT_TRANSFER_FILE_NAME);
    const json = `${JSON.stringify(bundle, null, 2)}\n`;
    if (outputPath === "-") {
      console.log(json.trimEnd());
      return;
    }
    const resolvedOutputPath = resolve(outputPath);
    await mkdir(dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, json, { mode: 0o600 });
    console.log(
      `Exported ${exportData.profiles.length} profile(s) and ${exportData.rules.length} rule(s) to ${resolvedOutputPath}`,
    );
    return;
  }

  if (command === "import") {
    const inputPath =
      getStringFlag(parsed, "input") ??
      parsed.positionals[0] ??
      join(paths.homeDir, DEFAULT_TRANSFER_FILE_NAME);
    if (inputPath === "-") {
      throw new Error("Import from stdin is not supported. Use `gip import --input <path>`.");
    }
    const resolvedInputPath = resolve(inputPath);
    const incoming = parseProfileImportBundle(
      JSON.parse(await readFile(resolvedInputPath, "utf8")),
    );
    const importData = hasFlag(parsed, "profiles-only") ? { ...incoming, rules: [] } : incoming;
    const current = await repository.read();
    const next = hasFlag(parsed, "replace")
      ? importData
      : mergeProfileStoreData(current, importData);
    await repository.save(next);
    console.log(
      `Imported ${importData.profiles.length} profile(s) and ${importData.rules.length} rule(s) from ${resolvedInputPath}${
        hasFlag(parsed, "replace") ? " with replace mode" : " with merge mode"
      }.`,
    );
    if (!hasFlag(parsed, "no-apply")) {
      const result = await applyGitProfileConfig({
        data: next,
        globalGitConfigPath: paths.globalGitConfigPath,
        generatedGitConfigDir: paths.generatedGitConfigDir,
      });
      console.log(`Generated ${result.generatedFiles.length} profile config file(s).`);
      console.log(
        result.changed
          ? `Updated ${result.globalGitConfigPath}.`
          : `${result.globalGitConfigPath} was already up to date.`,
      );
    }
    return;
  }

  if (command === "doctor") {
    const data = await repository.read();
    const cwd = resolve(parsed.positionals[0] ?? process.cwd());
    const rule = findMatchingRule(data, cwd);
    const identity = readActiveGitIdentity(cwd);
    const report = { cwd, rule, identity };
    if (hasFlag(parsed, "json")) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`Directory: ${cwd}`);
    console.log(`Git user.name: ${identity.userName ?? "[unset]"}`);
    console.log(`Git user.email: ${identity.userEmail ?? "[unset]"}`);
    console.log(
      rule
        ? `Managed rule: ${rule.id} (${rule.profileName} -> ${rule.directory})`
        : "Managed rule: [none]",
    );
    return;
  }

  if (command === "prompt") {
    const data = await repository.read();
    const status = getPromptStatus({ data });
    if (hasFlag(parsed, "json")) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    const rendered = renderPromptStatus(status, parsePromptFormat(parsed), parsePromptShell());
    if (rendered) {
      console.log(rendered);
    }
    return;
  }

  if (
    command === "install:prompt" ||
    command === "uninstall:prompt" ||
    command === "install:shell" ||
    command === "uninstall:shell"
  ) {
    const shell = resolveShell(parsed, parsed.positionals[0]);
    if (!shell) {
      throw new Error("Could not detect shell. Pass zsh, bash, or fish explicitly.");
    }
    const configPath = getConfigPath(parsed);
    const result =
      command === "install:prompt"
        ? await installShellPrompt({
            shell,
            configPath: configPath ?? undefined,
            promptFormat: parsePromptFormat(parsed),
          })
        : command === "uninstall:prompt"
          ? await uninstallShellPrompt({ shell, configPath: configPath ?? undefined })
          : command === "install:shell"
            ? await installShellSession({ shell, configPath: configPath ?? undefined })
            : await uninstallShellSession({ shell, configPath: configPath ?? undefined });
    console.log(`${result.changed ? "Updated" : "Unchanged"}: ${result.path}`);
    return;
  }

  if (command === "completion") {
    const shell = resolveShell(parsed, parsed.positionals[0]);
    if (!shell) {
      throw new Error("Could not detect shell. Pass zsh, bash, or fish explicitly.");
    }
    console.log(generateCompletionScript(shell).trimEnd());
    return;
  }

  if (command === "install:completion" || command === "uninstall:completion") {
    const shell = resolveShell(parsed, parsed.positionals[0]);
    if (!shell) {
      throw new Error("Could not detect shell. Pass zsh, bash, or fish explicitly.");
    }
    const configPath = getConfigPath(parsed);
    const result =
      command === "install:completion"
        ? await installShellCompletion({ shell, configPath: configPath ?? undefined })
        : await uninstallShellCompletion({ shell, configPath: configPath ?? undefined });
    console.log(`${result.changed ? "Updated" : "Unchanged"}: ${result.path}`);
    return;
  }

  if (command === "install" || command === "install:all" || command === "update") {
    const installTarget = parseInstallTarget(command, parsed.positionals);
    const shell = resolveShell(parsed, installTarget.shell);
    if (!shell) {
      throw new Error("Could not detect shell. Pass zsh, bash, or fish explicitly.");
    }
    if (command === "update" || shouldInstallPackage(command, parsed.positionals)) {
      const packageSpec =
        command === "update" ? `${PACKAGE_NAME}@latest` : readCurrentPackageSpec();
      console.log(`Installing ${packageSpec} globally with npm...`);
      await runNpmInstallGlobal(packageSpec);
    }
    const configPath = getConfigPath(parsed);
    const result = await runInstallTarget({
      target: installTarget.target,
      shell,
      configPath: configPath ?? undefined,
      promptFormat: parsePromptFormat(parsed),
    });
    const verb = command === "update" ? "Updated" : "Installed";
    console.log(`${verb} ${installTarget.target} shell integration for ${shell}: ${result.path}`);
    console.log(result.changed ? "Updated shell config." : "Shell config was already up to date.");
    return;
  }

  if (command === "uninstall:all") {
    const shell = resolveShell(parsed, parsed.positionals[0]);
    if (!shell) {
      throw new Error("Could not detect shell. Pass zsh, bash, or fish explicitly.");
    }
    const result = await uninstallShellAll({
      shell,
      configPath: getConfigPath(parsed) ?? undefined,
    });
    console.log(`${result.changed ? "Updated" : "Unchanged"}: ${result.path}`);
    return;
  }

  if (command === "paths") {
    if (hasFlag(parsed, "json")) {
      console.log(JSON.stringify(paths, null, 2));
      return;
    }
    for (const [key, value] of Object.entries(paths)) {
      console.log(`${key}: ${value}`);
    }
    return;
  }

  if (command === "tui") {
    await runTui({
      repository,
      paths,
      input: process.stdin,
      output: process.stdout,
    });
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${renderHelp()}`);
}

async function selectProfile(
  profiles: GitIdentityProfile[],
  prompt: string,
  defaultProfileName?: string | null,
) {
  const prompts = createPromptSession();
  try {
    return await selectProfileWithSession(profiles, prompt, prompts, defaultProfileName);
  } finally {
    prompts.close();
  }
}

async function selectProfileForShellCommand(
  profiles: GitIdentityProfile[],
  defaultProfileName?: string | null,
) {
  const prompts = createPromptSession(process.stdin, process.stderr);
  try {
    return await selectProfileWithSession(
      profiles,
      "Choose profile [1]: ",
      prompts,
      defaultProfileName,
    );
  } finally {
    prompts.close();
  }
}

function getActiveProfileName(data: ProfileStoreData) {
  return getPromptStatus({ data }).profileName;
}

function findProfile(profiles: GitIdentityProfile[], name: string) {
  const profile = profiles.find((candidate) => candidate.name === name);
  if (!profile) {
    throw new Error(`Unknown profile: ${name}`);
  }
  return profile;
}

function renderProfileListLine(profile: GitIdentityProfile) {
  const promptColor = profile.promptColor ? `\tprompt: ${profile.promptColor}` : "";
  return `${profile.name}\t${profile.userName} <${profile.userEmail}>${promptColor}`;
}

function renderProfileOption(profile: GitIdentityProfile) {
  const swatch = profile.promptColor ? `${renderPromptColorSwatch(profile.promptColor)} ` : "";
  return `${swatch}${profile.name}\t${profile.userName} <${profile.userEmail}>`;
}

function parsePromptFormat(parsed: ReturnType<typeof parseArgs>): PromptFormat {
  if (hasFlag(parsed, "profile")) {
    return "profile";
  }
  const format = getStringFlag(parsed, "format") ?? "auto";
  if (format === "identity" || format === "profile" || format === "auto") {
    return format;
  }
  throw new Error(`Unsupported prompt format: ${format}. Use identity, profile, or auto.`);
}

function parsePromptShell(): PromptShell | null {
  const shell = process.env.GIP_PROMPT_SHELL;
  if (shell === "bash" || shell === "fish" || shell === "zsh") {
    return shell;
  }
  return null;
}

function renderSessionIdentityExports(profile: GitIdentityProfile, shell: SupportedShell) {
  const values = {
    GIP_PROFILE_NAME: profile.name,
    GIT_AUTHOR_NAME: profile.userName,
    GIT_AUTHOR_EMAIL: profile.userEmail,
    GIT_COMMITTER_NAME: profile.userName,
    GIT_COMMITTER_EMAIL: profile.userEmail,
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "user.name",
    GIT_CONFIG_VALUE_0: profile.userName,
    GIT_CONFIG_KEY_1: "user.email",
    GIT_CONFIG_VALUE_1: profile.userEmail,
  };
  if (shell === "fish") {
    return Object.entries(values)
      .map(([key, value]) => `set -gx ${key} ${quoteFishValue(value)}`)
      .join("\n");
  }
  return Object.entries(values)
    .map(([key, value]) => `export ${key}=${quoteShellValue(value)}`)
    .join("\n");
}

function renderSessionIdentityClear(shell: SupportedShell) {
  const names = [
    "GIP_PROFILE_NAME",
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
    "GIT_COMMITTER_NAME",
    "GIT_COMMITTER_EMAIL",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_KEY_0",
    "GIT_CONFIG_VALUE_0",
    "GIT_CONFIG_KEY_1",
    "GIT_CONFIG_VALUE_1",
  ];
  if (shell === "fish") {
    return names.map((name) => `set -e ${name}`).join("\n");
  }
  return `unset ${names.join(" ")}`;
}

function quoteShellValue(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function quoteFishValue(value: string) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function parsePromptColorArgument(
  value: string | undefined,
): ProfilePromptColor | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "none" || normalized === "no-color" || normalized === "default") {
    return null;
  }
  const promptColor = normalizePromptColor(normalized);
  if (!promptColor) {
    throw new Error(
      `Unsupported prompt color: ${value}. Use one of: ${PROFILE_PROMPT_COLORS.join(", ")}, or no-color.`,
    );
  }
  return promptColor;
}

type InstallTarget = "all" | "completion" | "prompt" | "shell";

function parseInstallTarget(
  command: string,
  positionals: string[],
): { target: InstallTarget; shell: string | undefined } {
  if (command === "install:all" || command === "update") {
    return { target: "all" as InstallTarget, shell: positionals[0] };
  }

  const first = positionals[0];
  if (first === "all" || first === "completion" || first === "prompt" || first === "shell") {
    return { target: first, shell: positionals[1] };
  }

  return { target: "all" as InstallTarget, shell: first };
}

function shouldInstallPackage(command: string, positionals: string[]) {
  if (command !== "install") {
    return false;
  }
  const first = positionals[0];
  return first !== "all" && first !== "completion" && first !== "prompt" && first !== "shell";
}

async function runInstallTarget(input: {
  target: InstallTarget;
  shell: SupportedShell;
  configPath?: string;
  promptFormat: PromptFormat;
}) {
  if (input.target === "completion") {
    return await installShellCompletion({
      shell: input.shell,
      configPath: input.configPath,
    });
  }

  if (input.target === "prompt") {
    return await installShellPrompt({
      shell: input.shell,
      configPath: input.configPath,
      promptFormat: input.promptFormat,
    });
  }

  if (input.target === "shell") {
    return await installShellSession({
      shell: input.shell,
      configPath: input.configPath,
    });
  }

  return await installShellAll({
    shell: input.shell,
    configPath: input.configPath,
    promptFormat: input.promptFormat,
  });
}

function resolveShell(
  parsed: ReturnType<typeof parseArgs>,
  positionalShell: string | undefined,
): SupportedShell | null {
  return parseShell(getStringFlag(parsed, "shell") ?? positionalShell) ?? detectShell();
}

function getConfigPath(parsed: ReturnType<typeof parseArgs>) {
  return getStringFlag(parsed, "config") ?? getStringFlag(parsed, "path");
}

function readCurrentPackageSpec() {
  const version = readPackageVersion();
  return version ? `${PACKAGE_NAME}@${version}` : PACKAGE_NAME;
}

function readPackageVersion() {
  for (const packageJsonPath of getPackageJsonCandidates()) {
    if (!existsSync(packageJsonPath)) {
      continue;
    }
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      name?: string;
      version?: string;
    };
    if (parsed.name === PACKAGE_NAME) {
      return parsed.version ?? null;
    }
  }
  return null;
}

function getPackageJsonCandidates() {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "..", "..", "package.json"),
    join(here, "..", "..", "..", "package.json"),
    join(process.cwd(), "package.json"),
  ];
}

function runNpmInstallGlobal(packageSpec: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn("npm", ["install", "-g", packageSpec], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`npm install -g ${packageSpec} exited with ${status}`));
    });
  });
}

async function selectProfileWithSession(
  profiles: GitIdentityProfile[],
  prompt: string,
  prompts: ReturnType<typeof createPromptSession>,
  defaultProfileName?: string | null,
) {
  const defaultIndex = getProfileDefaultIndex(profiles, defaultProfileName);
  return (
    await prompts.selectOne({
      prompt,
      emptyMessage: "No profiles yet. Add one with `gip profile:add`.",
      options: profiles,
      renderOption: renderProfileOption,
      getValue: (profile) => profile.name,
      defaultIndex,
    })
  ).name;
}

function getProfileDefaultIndex(
  profiles: GitIdentityProfile[],
  defaultProfileName: string | null | undefined,
) {
  const index = defaultProfileName
    ? profiles.findIndex((profile) => profile.name === defaultProfileName)
    : -1;
  return index >= 0 ? index : 0;
}

async function selectProfilePromptColor(prompt: string) {
  const prompts = createPromptSession();
  try {
    const options: Array<"" | ProfilePromptColor> = ["", ...PROFILE_PROMPT_COLORS];
    const choice = await prompts.selectOne({
      prompt,
      emptyMessage: "No prompt colors available.",
      options,
      renderOption: (color) => (color ? renderPromptColorLabel(color) : "[no color]"),
      getValue: (color) => color || "no-color",
      defaultIndex: 0,
    });
    return choice === "" ? null : choice;
  } finally {
    prompts.close();
  }
}

function renderPromptColorLabel(promptColor: ProfilePromptColor) {
  return `${renderPromptColorSwatch(promptColor)} ${promptColor}`;
}

function renderPromptColorSwatch(promptColor: ProfilePromptColor) {
  return `\x1b[${PROFILE_PROMPT_COLOR_CODES[promptColor]}m■\x1b[0m`;
}

function requirePositional(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function parseShell(value: string | undefined): SupportedShell | null {
  if (value === "zsh" || value === "bash" || value === "fish") {
    return value;
  }
  return null;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

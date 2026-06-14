import { resolve } from "node:path";

import { findMatchingRule, readActiveGitIdentity } from "#git/config";
import {
  PROFILE_PROMPT_COLOR_CODES,
  type GitIdentityProfile,
  type ProfilePromptColor,
  type ProfileStoreData,
} from "#profiles/types";

export type PromptFormat = "identity" | "profile" | "auto";
export type PromptShell = "bash" | "fish" | "zsh";

export interface PromptStatus {
  cwd: string;
  profileName: string | null;
  profilePromptColor: ProfilePromptColor | null;
  userName: string | null;
  userEmail: string | null;
  ruleId: string | null;
  directory: string | null;
}

export function getPromptStatus(input: {
  data: ProfileStoreData;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}) {
  const cwd = resolve(input.cwd ?? process.cwd());
  const sessionIdentity = readSessionGitIdentity(input.env ?? process.env);
  if (sessionIdentity.userName || sessionIdentity.userEmail || sessionIdentity.profileName) {
    const sessionProfileByName = sessionIdentity.profileName
      ? findProfileByName(input.data.profiles, sessionIdentity.profileName)
      : null;
    const sessionProfileByIdentity = findProfileByIdentity(input.data.profiles, {
      userName: sessionIdentity.userName,
      userEmail: sessionIdentity.userEmail,
    });
    return {
      cwd,
      profileName:
        sessionProfileByName?.name ??
        sessionProfileByIdentity?.name ??
        sessionIdentity.profileName ??
        null,
      profilePromptColor:
        sessionProfileByName?.promptColor ?? sessionProfileByIdentity?.promptColor ?? null,
      userName: sessionIdentity.userName,
      userEmail: sessionIdentity.userEmail,
      ruleId: null,
      directory: null,
    } satisfies PromptStatus;
  }

  const rule = findMatchingRule(input.data, cwd);
  const gitIdentity = readActiveGitIdentity(cwd);
  const ruleProfile = rule ? findProfileByName(input.data.profiles, rule.profileName) : null;
  const identityProfile = findProfileByIdentity(input.data.profiles, {
    userName: gitIdentity.userName,
    userEmail: gitIdentity.userEmail,
  });

  return {
    cwd,
    profileName: ruleProfile?.name ?? rule?.profileName ?? identityProfile?.name ?? null,
    profilePromptColor: ruleProfile?.promptColor ?? identityProfile?.promptColor ?? null,
    userName: ruleProfile?.userName ?? gitIdentity.userName ?? null,
    userEmail: ruleProfile?.userEmail ?? gitIdentity.userEmail ?? null,
    ruleId: rule?.id ?? null,
    directory: rule?.directory ?? null,
  } satisfies PromptStatus;
}

function readSessionGitIdentity(env: NodeJS.ProcessEnv) {
  return {
    profileName: env.GIP_PROFILE_NAME || null,
    userName: env.GIT_AUTHOR_NAME || env.GIT_COMMITTER_NAME || null,
    userEmail: env.GIT_AUTHOR_EMAIL || env.GIT_COMMITTER_EMAIL || null,
  };
}

export function renderPromptStatus(
  status: PromptStatus,
  format: PromptFormat = "auto",
  shell: PromptShell | null = null,
) {
  if (format === "profile") {
    return renderProfilePrompt(status, shell);
  }
  if (format === "auto" && status.profileName) {
    return renderProfilePrompt(status, shell);
  }
  if (format === "auto") {
    return renderIdentityPrompt(status);
  }
  return renderIdentityPrompt(status);
}

function renderIdentityPrompt(status: PromptStatus) {
  if (!status.userName && !status.userEmail) {
    return "";
  }
  if (status.userName && status.userEmail) {
    return `${status.userName} <${status.userEmail}>`;
  }
  return status.userName ?? status.userEmail ?? "";
}

function renderProfilePrompt(status: PromptStatus, shell: PromptShell | null) {
  if (!status.profileName) {
    return "";
  }
  const profileName = status.profilePromptColor
    ? applyPromptColor(status.profileName, status.profilePromptColor, shell)
    : status.profileName;
  return `[gip ${profileName}]`;
}

function applyPromptColor(
  value: string,
  promptColor: ProfilePromptColor,
  shell: PromptShell | null,
) {
  if (!shell) {
    return value;
  }
  const code = PROFILE_PROMPT_COLOR_CODES[promptColor];
  if (shell === "bash") {
    return `\u0001\x1b[${code}m\u0002${value}\u0001\x1b[0m\u0002`;
  }
  if (shell === "zsh") {
    return `%{\x1b[${code}m%}${value}%{\x1b[0m%}`;
  }
  return `\x1b[${code}m${value}\x1b[0m`;
}

function findProfileByName(profiles: GitIdentityProfile[], name: string) {
  return profiles.find((profile) => profile.name === name) ?? null;
}

function findProfileByIdentity(
  profiles: GitIdentityProfile[],
  identity: { userName: string | null; userEmail: string | null },
) {
  if (!identity.userName || !identity.userEmail) {
    return null;
  }
  return (
    profiles.find(
      (profile) =>
        profile.userName === identity.userName && profile.userEmail === identity.userEmail,
    ) ?? null
  );
}

import {
  createEmptyProfileStore,
  PROFILE_PROMPT_COLORS,
  type DirectoryRule,
  type GitIdentityProfile,
  type ProfilePromptColor,
  type ProfileStoreData,
} from "#profiles/types";

export interface ProfileExportBundle {
  kind: "git-profile-switcher/profile-store";
  version: 1;
  exportedAt: string;
  data: ProfileStoreData;
}

export function createProfileExportBundle(data: ProfileStoreData): ProfileExportBundle {
  return {
    kind: "git-profile-switcher/profile-store",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: normalizeProfileStoreData(data),
  };
}

export function parseProfileImportBundle(input: unknown): ProfileStoreData {
  if (isRecord(input) && input.kind === "git-profile-switcher/profile-store") {
    if (input.version !== 1) {
      throw new Error(`Unsupported export bundle version: ${String(input.version)}`);
    }
    return normalizeProfileStoreData(input.data);
  }

  return normalizeProfileStoreData(input);
}

export function mergeProfileStoreData(
  current: ProfileStoreData,
  incoming: ProfileStoreData,
): ProfileStoreData {
  const next = createEmptyProfileStore();
  const profiles = new Map<string, GitIdentityProfile>();
  for (const profile of current.profiles) {
    profiles.set(profile.name, profile);
  }
  for (const profile of incoming.profiles) {
    profiles.set(profile.name, profile);
  }
  next.profiles = [...profiles.values()];

  const knownProfiles = new Set(next.profiles.map((profile) => profile.name));
  const rules = new Map<string, DirectoryRule>();
  for (const rule of [...current.rules, ...incoming.rules]) {
    if (!knownProfiles.has(rule.profileName)) {
      continue;
    }
    rules.set(rule.id, rule);
  }
  next.rules = [...rules.values()];

  return sortProfileStoreData(next);
}

export function normalizeProfileStoreData(input: unknown): ProfileStoreData {
  if (!isRecord(input)) {
    throw new Error("Invalid profile store: expected an object.");
  }

  const version = input.version;
  if (version !== 1) {
    throw new Error(`Unsupported profile store version: ${String(version)}`);
  }

  const profiles = readArray(input.profiles, "profiles").map(parseProfile);
  const profileNames = new Set(profiles.map((profile) => profile.name));
  const rules = readArray(input.rules, "rules")
    .map(parseRule)
    .filter((rule) => profileNames.has(rule.profileName));

  return sortProfileStoreData({ version: 1, profiles, rules });
}

function parseProfile(input: unknown): GitIdentityProfile {
  if (!isRecord(input)) {
    throw new Error("Invalid profile: expected an object.");
  }
  return {
    name: readString(input.name, "profile.name"),
    userName: readString(input.userName, "profile.userName"),
    userEmail: readString(input.userEmail, "profile.userEmail"),
    ...readOptionalPromptColor(input.promptColor),
    createdAt: readString(input.createdAt, "profile.createdAt"),
    updatedAt: readString(input.updatedAt, "profile.updatedAt"),
  };
}

function parseRule(input: unknown): DirectoryRule {
  if (!isRecord(input)) {
    throw new Error("Invalid rule: expected an object.");
  }
  return {
    id: readString(input.id, "rule.id"),
    profileName: readString(input.profileName, "rule.profileName"),
    directory: readString(input.directory, "rule.directory"),
    createdAt: readString(input.createdAt, "rule.createdAt"),
  };
}

function sortProfileStoreData(data: ProfileStoreData) {
  data.profiles.sort((left, right) => left.name.localeCompare(right.name));
  data.rules.sort((left, right) => left.directory.localeCompare(right.directory));
  return data;
}

function readArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid profile store: ${field} must be an array.`);
  }
  return value;
}

function readString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid profile store: ${field} must be a non-empty string.`);
  }
  return value;
}

function readOptionalPromptColor(value: unknown): { promptColor?: ProfilePromptColor } {
  if (value === undefined || value === null || value === "") {
    return {};
  }
  if (typeof value !== "string") {
    throw new Error("Invalid profile store: profile.promptColor must be a string.");
  }
  const normalized = value.trim().toLowerCase();
  if (!PROFILE_PROMPT_COLORS.includes(normalized as ProfilePromptColor)) {
    throw new Error(`Invalid profile store: unsupported profile.promptColor ${value}.`);
  }
  return { promptColor: normalized as ProfilePromptColor };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

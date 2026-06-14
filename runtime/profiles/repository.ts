import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { normalizeDirectoryPath } from "#config/paths";
import {
  createEmptyProfileStore,
  type DirectoryRule,
  type GitIdentityProfile,
  PROFILE_PROMPT_COLORS,
  type ProfilePromptColor,
  type ProfileStoreData,
} from "./types.ts";

export interface ProfileRepository {
  read(): Promise<ProfileStoreData>;
  save(data: ProfileStoreData): Promise<void>;
  upsertProfile(input: {
    name: string;
    userName: string;
    userEmail: string;
    promptColor?: ProfilePromptColor;
  }): Promise<GitIdentityProfile>;
  setProfilePromptColor(input: {
    name: string;
    promptColor: ProfilePromptColor | null;
  }): Promise<GitIdentityProfile>;
  removeProfile(name: string): Promise<boolean>;
  addRule(input: {
    profileName: string;
    directory: string;
    homeDir?: string;
  }): Promise<DirectoryRule>;
  setDirectoryProfile(input: {
    profileName: string;
    directory: string;
    homeDir?: string;
  }): Promise<DirectoryRule>;
  clearDirectoryProfile(input: { directory: string; homeDir?: string }): Promise<DirectoryRule[]>;
  removeRule(id: string): Promise<boolean>;
}

export function createProfileRepository(path: string): ProfileRepository {
  async function read() {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as Partial<ProfileStoreData>;
      return normalizeStore(parsed);
    } catch (error) {
      if (isNotFoundError(error)) {
        return createEmptyProfileStore();
      }
      throw error;
    }
  }

  async function save(data: ProfileStoreData) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(normalizeStore(data), null, 2)}\n`, {
      mode: 0o600,
    });
  }

  return {
    read,
    save,
    async upsertProfile(input) {
      const data = await read();
      const now = new Date().toISOString();
      const existing = data.profiles.find((profile) => profile.name === input.name);
      if (existing) {
        existing.userName = input.userName;
        existing.userEmail = input.userEmail;
        if (input.promptColor !== undefined) {
          existing.promptColor = input.promptColor;
        }
        existing.updatedAt = now;
        await save(data);
        return existing;
      }

      const profile = {
        name: input.name,
        userName: input.userName,
        userEmail: input.userEmail,
        ...(input.promptColor ? { promptColor: input.promptColor } : {}),
        createdAt: now,
        updatedAt: now,
      } satisfies GitIdentityProfile;
      data.profiles.push(profile);
      sortStore(data);
      await save(data);
      return profile;
    },
    async setProfilePromptColor(input) {
      const data = await read();
      const profile = data.profiles.find((candidate) => candidate.name === input.name);
      if (!profile) {
        throw new Error(`Unknown profile: ${input.name}`);
      }
      if (input.promptColor) {
        profile.promptColor = input.promptColor;
      } else {
        delete profile.promptColor;
      }
      profile.updatedAt = new Date().toISOString();
      await save(data);
      return profile;
    },
    async removeProfile(name) {
      const data = await read();
      const nextProfiles = data.profiles.filter((profile) => profile.name !== name);
      if (nextProfiles.length === data.profiles.length) {
        return false;
      }
      data.profiles = nextProfiles;
      data.rules = data.rules.filter((rule) => rule.profileName !== name);
      await save(data);
      return true;
    },
    async addRule(input) {
      const data = await read();
      if (!data.profiles.some((profile) => profile.name === input.profileName)) {
        throw new Error(`Unknown profile: ${input.profileName}`);
      }
      const directory = normalizeDirectoryPath(input.directory, input.homeDir);
      const existing = data.rules.find(
        (rule) => rule.profileName === input.profileName && rule.directory === directory,
      );
      if (existing) {
        return existing;
      }
      const rule = {
        id: `rule_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        profileName: input.profileName,
        directory,
        createdAt: new Date().toISOString(),
      } satisfies DirectoryRule;
      data.rules.push(rule);
      sortStore(data);
      await save(data);
      return rule;
    },
    async setDirectoryProfile(input) {
      const data = await read();
      if (!data.profiles.some((profile) => profile.name === input.profileName)) {
        throw new Error(`Unknown profile: ${input.profileName}`);
      }
      const directory = normalizeDirectoryPath(input.directory, input.homeDir);
      const existing = data.rules.find(
        (rule) => rule.profileName === input.profileName && rule.directory === directory,
      );
      if (existing) {
        data.rules = data.rules.filter(
          (rule) => rule.directory !== directory || rule.id === existing.id,
        );
        sortStore(data);
        await save(data);
        return existing;
      }

      const rule = {
        id: `rule_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        profileName: input.profileName,
        directory,
        createdAt: new Date().toISOString(),
      } satisfies DirectoryRule;
      data.rules = [...data.rules.filter((candidate) => candidate.directory !== directory), rule];
      sortStore(data);
      await save(data);
      return rule;
    },
    async clearDirectoryProfile(input) {
      const data = await read();
      const directory = normalizeDirectoryPath(input.directory, input.homeDir);
      const removed = data.rules.filter((rule) => rule.directory === directory);
      if (removed.length === 0) {
        return [];
      }
      data.rules = data.rules.filter((rule) => rule.directory !== directory);
      await save(data);
      return removed;
    },
    async removeRule(id) {
      const data = await read();
      const nextRules = data.rules.filter((rule) => rule.id !== id);
      if (nextRules.length === data.rules.length) {
        return false;
      }
      data.rules = nextRules;
      await save(data);
      return true;
    },
  };
}

function normalizeStore(input: Partial<ProfileStoreData>): ProfileStoreData {
  const data = {
    version: 1,
    profiles: Array.isArray(input.profiles) ? input.profiles.map(normalizeProfile) : [],
    rules: Array.isArray(input.rules) ? input.rules : [],
  } satisfies ProfileStoreData;
  sortStore(data);
  return data;
}

function normalizeProfile(profile: GitIdentityProfile) {
  const { promptColor, ...profileWithoutPromptColor } = profile;
  const normalizedPromptColor = normalizePromptColor(promptColor);
  return {
    ...profileWithoutPromptColor,
    ...(normalizedPromptColor ? { promptColor: normalizedPromptColor } : {}),
  } satisfies GitIdentityProfile;
}

export function normalizePromptColor(value: unknown): ProfilePromptColor | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return PROFILE_PROMPT_COLORS.includes(normalized as ProfilePromptColor)
    ? (normalized as ProfilePromptColor)
    : null;
}

function sortStore(data: ProfileStoreData) {
  data.profiles.sort((left, right) => left.name.localeCompare(right.name));
  data.rules.sort((left, right) => left.directory.localeCompare(right.directory));
}

function isNotFoundError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

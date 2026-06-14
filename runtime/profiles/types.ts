export const PROFILE_PROMPT_COLOR_CODES = {
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  magenta: "35",
  cyan: "36",
  gray: "90",
  "bright-red": "91",
  "bright-green": "92",
  "bright-yellow": "93",
  "bright-blue": "94",
  "bright-magenta": "95",
  "bright-cyan": "96",
} as const;

export type ProfilePromptColor = keyof typeof PROFILE_PROMPT_COLOR_CODES;

export const PROFILE_PROMPT_COLORS = Object.keys(
  PROFILE_PROMPT_COLOR_CODES,
) as ProfilePromptColor[];

export interface GitIdentityProfile {
  name: string;
  userName: string;
  userEmail: string;
  promptColor?: ProfilePromptColor;
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryRule {
  id: string;
  profileName: string;
  directory: string;
  createdAt: string;
}

export interface ProfileStoreData {
  version: 1;
  profiles: GitIdentityProfile[];
  rules: DirectoryRule[];
}

export function createEmptyProfileStore(): ProfileStoreData {
  return {
    version: 1,
    profiles: [],
    rules: [],
  };
}

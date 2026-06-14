import test from "node:test";
import assert from "node:assert/strict";

import {
  createProfileExportBundle,
  mergeProfileStoreData,
  parseProfileImportBundle,
} from "#profiles/transfer";
import type { ProfileStoreData } from "#profiles/types";

const baseProfile = {
  name: "work",
  userName: "Work Name",
  userEmail: "work@example.com",
  promptColor: "cyan",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

test("profile transfer bundle round-trips profile store data", () => {
  const data: ProfileStoreData = {
    version: 1,
    profiles: [baseProfile],
    rules: [
      {
        id: "rule_work",
        profileName: "work",
        directory: "/work/",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };

  const bundle = createProfileExportBundle(data);
  const parsed = parseProfileImportBundle(bundle);

  assert.equal(bundle.kind, "git-profile-switcher/profile-store");
  assert.equal(parsed.profiles[0]!.name, "work");
  assert.equal(parsed.profiles[0]!.promptColor, "cyan");
  assert.equal(parsed.rules[0]!.directory, "/work/");
});

test("mergeProfileStoreData merges profiles and ignores rules for missing profiles", () => {
  const current: ProfileStoreData = {
    version: 1,
    profiles: [baseProfile],
    rules: [],
  };
  const incoming: ProfileStoreData = {
    version: 1,
    profiles: [
      {
        ...baseProfile,
        name: "personal",
        userName: "Personal Name",
        userEmail: "me@example.com",
      },
    ],
    rules: [
      {
        id: "rule_personal",
        profileName: "personal",
        directory: "/personal/",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "rule_missing",
        profileName: "missing",
        directory: "/missing/",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };

  const merged = mergeProfileStoreData(current, incoming);

  assert.deepEqual(
    merged.profiles.map((profile) => profile.name),
    ["personal", "work"],
  );
  assert.deepEqual(
    merged.rules.map((rule) => rule.id),
    ["rule_personal"],
  );
});

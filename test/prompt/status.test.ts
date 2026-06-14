import test from "node:test";
import assert from "node:assert/strict";

import { getPromptStatus, renderPromptStatus, type PromptStatus } from "#prompt/status";
import type { ProfileStoreData } from "#profiles/types";

test("prompt status falls back to managed profile metadata when git config is unset", () => {
  const data = {
    version: 1,
    profiles: [
      {
        name: "work",
        userName: "Work Name",
        userEmail: "work@example.com",
        promptColor: "cyan",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    rules: [
      {
        id: "rule_work",
        profileName: "work",
        directory: "/tmp/work/",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  } satisfies ProfileStoreData;

  const status = getPromptStatus({ data, cwd: "/tmp/work/project" });
  assert.equal(status.profileName, "work");
  assert.equal(status.profilePromptColor, "cyan");
  assert.equal(renderPromptStatus(status), "[gip work]");
  assert.equal(renderPromptStatus(status, "identity"), "Work Name <work@example.com>");
  assert.equal(renderPromptStatus(status, "profile"), "[gip work]");
  assert.equal(renderPromptStatus(status, "auto"), "[gip work]");
  assert.equal(renderPromptStatus(status, "profile", "fish"), "[gip \x1b[36mwork\x1b[0m]");
  assert.equal(renderPromptStatus(status, "profile", "zsh"), "[gip %{\x1b[36m%}work%{\x1b[0m%}]");
  assert.equal(
    renderPromptStatus(status, "profile", "bash"),
    "[gip \u0001\x1b[36m\u0002work\u0001\x1b[0m\u0002]",
  );
});

test("prompt status can match a managed profile from effective git identity", () => {
  const data = {
    version: 1,
    profiles: [
      {
        name: "work",
        userName: "Work Name",
        userEmail: "work@example.com",
        promptColor: "bright-green",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    rules: [],
  } satisfies ProfileStoreData;

  const status: PromptStatus = {
    ...getPromptStatus({ data, cwd: "/tmp/not-managed" }),
    profileName: "work",
    profilePromptColor: "bright-green",
    userName: "Work Name",
    userEmail: "work@example.com",
  };
  assert.equal(renderPromptStatus(status, "profile"), "[gip work]");
  assert.equal(renderPromptStatus(status, "auto"), "[gip work]");
  assert.equal(renderPromptStatus(status, "auto", "fish"), "[gip \x1b[92mwork\x1b[0m]");
});

test("prompt status prefers session environment identity", () => {
  const data = {
    version: 1,
    profiles: [
      {
        name: "session",
        userName: "Session Name",
        userEmail: "session@example.com",
        promptColor: "magenta",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        name: "work",
        userName: "Work Name",
        userEmail: "work@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    rules: [
      {
        id: "rule_work",
        profileName: "work",
        directory: "/tmp/work/",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  } satisfies ProfileStoreData;

  const status = getPromptStatus({
    data,
    cwd: "/tmp/work/project",
    env: {
      GIP_PROFILE_NAME: "session",
      GIT_AUTHOR_NAME: "Session Name",
      GIT_AUTHOR_EMAIL: "session@example.com",
    },
  });

  assert.equal(status.profileName, "session");
  assert.equal(status.profilePromptColor, "magenta");
  assert.equal(status.ruleId, null);
  assert.equal(renderPromptStatus(status, "auto", "fish"), "[gip \x1b[35msession\x1b[0m]");
});

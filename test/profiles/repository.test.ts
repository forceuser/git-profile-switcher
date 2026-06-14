import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createProfileRepository } from "#profiles/repository";

test("profile repository stores profiles and normalized directory rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-profiles-"));
  try {
    const repository = createProfileRepository(join(dir, "profiles.json"));
    await repository.upsertProfile({
      name: "work",
      userName: "Work Name",
      userEmail: "work@example.com",
    });

    const rule = await repository.addRule({
      profileName: "work",
      directory: "~/Developer/Work",
      homeDir: "/Users/example",
    });

    const data = await repository.read();
    assert.equal(data.profiles.length, 1);
    assert.equal(data.profiles[0]!.name, "work");
    assert.equal(rule.directory, "/Users/example/Developer/Work/");
    assert.equal(data.rules[0]!.directory, "/Users/example/Developer/Work/");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("removing a profile removes its rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-profiles-"));
  try {
    const repository = createProfileRepository(join(dir, "profiles.json"));
    await repository.upsertProfile({
      name: "work",
      userName: "Work Name",
      userEmail: "work@example.com",
    });
    await repository.addRule({
      profileName: "work",
      directory: "/work",
    });

    assert.equal(await repository.removeProfile("work"), true);
    const data = await repository.read();
    assert.equal(data.profiles.length, 0);
    assert.equal(data.rules.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setting a profile prompt color stores and clears it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-profiles-"));
  try {
    const repository = createProfileRepository(join(dir, "profiles.json"));
    await repository.upsertProfile({
      name: "work",
      userName: "Work Name",
      userEmail: "work@example.com",
    });

    await repository.setProfilePromptColor({ name: "work", promptColor: "cyan" });
    let data = await repository.read();
    assert.equal(data.profiles[0]!.promptColor, "cyan");

    await repository.setProfilePromptColor({ name: "work", promptColor: null });
    data = await repository.read();
    assert.equal(data.profiles[0]!.promptColor, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setting a directory profile replaces exact-path rules for other profiles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-profiles-"));
  try {
    const repository = createProfileRepository(join(dir, "profiles.json"));
    await repository.upsertProfile({
      name: "work",
      userName: "Work Name",
      userEmail: "work@example.com",
    });
    await repository.upsertProfile({
      name: "personal",
      userName: "Personal Name",
      userEmail: "me@example.com",
    });
    await repository.addRule({
      profileName: "personal",
      directory: "/project",
    });

    const rule = await repository.setDirectoryProfile({
      profileName: "work",
      directory: "/project",
    });

    const data = await repository.read();
    assert.equal(rule.profileName, "work");
    assert.equal(data.rules.length, 1);
    assert.equal(data.rules[0]!.profileName, "work");
    assert.equal(data.rules[0]!.directory, "/project/");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("clearing a directory profile removes exact-path rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-profiles-"));
  try {
    const repository = createProfileRepository(join(dir, "profiles.json"));
    await repository.upsertProfile({
      name: "work",
      userName: "Work Name",
      userEmail: "work@example.com",
    });
    await repository.addRule({
      profileName: "work",
      directory: "/project",
    });
    await repository.addRule({
      profileName: "work",
      directory: "/project/nested",
    });

    const removed = await repository.clearDirectoryProfile({
      directory: "/project",
    });

    const data = await repository.read();
    assert.equal(removed.length, 1);
    assert.equal(removed[0]!.directory, "/project/");
    assert.equal(data.rules.length, 1);
    assert.equal(data.rules[0]!.directory, "/project/nested/");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  activateProfile,
  formatProfiles,
  parseProfiles,
  profilesDirectory,
  selectProfile,
} from "../src/cli/profiles.js";
import { ConfigurationError, UsageError } from "../src/cli/exit-codes.js";

const server = {
  name: "server",
  mode: "server" as const,
  enabled: true,
  bindAddress: "localhost:5625",
  workingDir: "/tmp/mutex-work",
};
const direct = { name: "direct", mode: "direct" as const, enabled: false };

describe("mutex profiles", () => {
  let temporary: string;
  let filePath: string;
  const originalUrl = process.env.MUTEX_DATABASE_URL;

  beforeEach(async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "mutex-profiles-"));
    filePath = path.join(temporary, "profiles.toml");
    delete process.env.MUTEX_DATABASE_URL;
  });

  afterEach(async () => {
    await rm(temporary, { recursive: true, force: true });
    if (originalUrl === undefined) delete process.env.MUTEX_DATABASE_URL;
    else process.env.MUTEX_DATABASE_URL = originalUrl;
  });

  it("round-trips server and direct profiles", () => {
    expect(parseProfiles(formatProfiles([server, direct]))).toEqual([
      server,
      direct,
    ]);
  });

  it("requires exactly one enabled profile", () => {
    expect(() =>
      parseProfiles(formatProfiles([{ ...server, enabled: false }, direct])),
    ).toThrow(ConfigurationError);
    expect(() =>
      parseProfiles(formatProfiles([server, { ...direct, enabled: true }])),
    ).toThrow(/exactly one/);
  });

  it("rejects server-only fields on direct profiles", () => {
    expect(() =>
      parseProfiles(`
[direct]
mode = "direct"
enabled = true
bind_address = "localhost:5625"
`),
    ).toThrow(/must not define/);
  });

  it("uses -p selection without changing the enabled profile", async () => {
    await writeFile(filePath, formatProfiles([server, direct]));
    expect((await selectProfile("direct", filePath)).profile.name).toBe(
      "direct",
    );
    expect(parseProfiles(await readFile(filePath, "utf8"))[0].enabled).toBe(
      true,
    );
  });

  it("activates one profile atomically and rejects unknown names", async () => {
    await writeFile(filePath, formatProfiles([server, direct]));
    await activateProfile("direct", filePath);
    const profiles = parseProfiles(await readFile(filePath, "utf8"));
    expect(profiles.map(({ name, enabled }) => [name, enabled])).toEqual([
      ["server", false],
      ["direct", true],
    ]);
    await expect(activateProfile("missing", filePath)).rejects.toBeInstanceOf(
      UsageError,
    );
  });

  it("can repair a file whose enabled flags are inconsistent", async () => {
    await writeFile(
      filePath,
      formatProfiles([{ ...server, enabled: false }, direct]),
    );
    await activateProfile("direct", filePath);
    expect(
      parseProfiles(await readFile(filePath, "utf8")).find(
        (profile) => profile.enabled,
      )?.name,
    ).toBe("direct");
  });

  it("keeps direct access zero-configuration when only the URL is set", async () => {
    process.env.MUTEX_DATABASE_URL = "postgres://example.invalid/locks";
    const selected = await selectProfile(null, filePath);
    expect(selected.configPath).toBeNull();
    expect(selected.profile).toMatchObject({ name: "direct", mode: "direct" });
  });

  it("does not silently turn an explicit profile into direct access", async () => {
    process.env.MUTEX_DATABASE_URL = "postgres://example.invalid/locks";
    await expect(selectProfile("server", filePath)).rejects.toThrow(
      /not defined because/,
    );
  });

  it("uses XDG_CONFIG_HOME when it is set", () => {
    expect(
      profilesDirectory({ XDG_CONFIG_HOME: "/opt/config" }, "/home/alice"),
    ).toBe("/opt/config/releasetools-mutex");
    expect(profilesDirectory({}, "/home/alice")).toBe(
      "/home/alice/.config/releasetools-mutex",
    );
  });
});

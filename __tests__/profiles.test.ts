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
  formatProfiles,
  parseProfiles,
  profilesDirectory,
  selectProfile,
  setDefaultProfile,
} from "../src/cli/profiles.js";
import { ConfigurationError, UsageError } from "../src/cli/exit-codes.js";

const server = {
  name: "server",
  mode: "server" as const,
  isDefault: true,
  bindAddress: "localhost:5625",
  workingDir: "/tmp/mutex-work",
};
const direct = { name: "direct", mode: "direct" as const, isDefault: false };

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

  it("requires exactly one default profile", () => {
    expect(() =>
      parseProfiles(formatProfiles([{ ...server, isDefault: false }, direct])),
    ).toThrow(ConfigurationError);
    expect(() =>
      parseProfiles(formatProfiles([server, { ...direct, isDefault: true }])),
    ).toThrow(/exactly one/);
  });

  it("rejects server-only fields on direct profiles", () => {
    expect(() =>
      parseProfiles(`
[direct]
mode = "direct"
default = true
bind_address = "localhost:5625"
`),
    ).toThrow(/must not define/);
  });

  it("round-trips ssl_negotiation on either mode", () => {
    const tuned = { ...direct, sslNegotiation: "direct" as const };

    expect(
      parseProfiles(formatProfiles([{ ...server, isDefault: true }, tuned])),
    ).toEqual([{ ...server, isDefault: true }, tuned]);
  });

  it("rejects an ssl_negotiation postgres would not accept", () => {
    expect(() =>
      parseProfiles(`
[direct]
mode = "direct"
default = true
ssl_negotiation = "fast"
`),
    ).toThrow(/ssl_negotiation = "postgres" or "direct"/);
  });

  it("uses -p selection without changing the default profile", async () => {
    await writeFile(filePath, formatProfiles([server, direct]));
    expect((await selectProfile("direct", filePath)).profile.name).toBe(
      "direct",
    );
    expect(parseProfiles(await readFile(filePath, "utf8"))[0].isDefault).toBe(
      true,
    );
  });

  it("sets one default atomically and rejects unknown names", async () => {
    await writeFile(filePath, formatProfiles([server, direct]));
    await setDefaultProfile("direct", filePath);
    const profiles = parseProfiles(await readFile(filePath, "utf8"));
    expect(profiles.map(({ name, isDefault }) => [name, isDefault])).toEqual([
      ["server", false],
      ["direct", true],
    ]);
    await expect(setDefaultProfile("missing", filePath)).rejects.toBeInstanceOf(
      UsageError,
    );
  });

  it("can repair a file whose default flags are inconsistent", async () => {
    await writeFile(
      filePath,
      formatProfiles([{ ...server, isDefault: false }, direct]),
    );
    await setDefaultProfile("direct", filePath);
    expect(
      parseProfiles(await readFile(filePath, "utf8")).find(
        (profile) => profile.isDefault,
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

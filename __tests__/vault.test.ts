/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DotsecenvError } from "../src/dotsecenv/errors.js";
import { parseVault, readVault, vaultPathFor } from "../src/dotsecenv/vault.js";

/**
 * Line numbers in the header are 1-based and absolute, so these fixtures are
 * laid out deliberately: 1 marker, 2 header, 3 marker, then one record a line.
 */
const V2_VAULT = [
  "# === VAULT HEADER ===",
  JSON.stringify({
    version: 2,
    identities: { FP1: 4, FP2: 5 },
    secrets: {
      "demo::DATABASE_URL": { secret: 6, values: [7, 8] },
      "demo::GONE": { secret: 9, values: [10] },
    },
  }),
  "# === VAULT DATA ===",
  JSON.stringify({ type: "identity", data: { fingerprint: "FP1" } }),
  JSON.stringify({ type: "identity", data: { fingerprint: "FP2" } }),
  JSON.stringify({ type: "secret", data: { key: "demo::DATABASE_URL" } }),
  JSON.stringify({
    type: "value",
    secret: "demo::DATABASE_URL",
    data: {
      available_to: ["FP1"],
      added_at: "2026-01-01T00:00:00Z",
      value: "ciphertext-1",
    },
  }),
  JSON.stringify({
    type: "value",
    secret: "demo::DATABASE_URL",
    data: {
      available_to: ["FP1", "FP2"],
      added_at: "2026-02-01T00:00:00Z",
      value: "ciphertext-2",
    },
  }),
  JSON.stringify({ type: "secret", data: { key: "demo::GONE" } }),
  JSON.stringify({
    type: "value",
    secret: "demo::GONE",
    data: { deleted: true, added_at: "2026-03-01T00:00:00Z" },
  }),
  "",
].join("\n");

/** A vault written in the superseded v1 format, which is no longer read. */
const V1_VAULT = [
  "# === VAULT HEADER v1 ===",
  JSON.stringify({
    version: 1,
    identities: [
      ["FP1", 4],
      ["FP2", 5],
    ],
    secrets: { LEGACY: { secret: 6, values: [7] } },
  }),
  "# === VAULT DATA ===",
  JSON.stringify({ type: "identity", data: { fingerprint: "FP1" } }),
  JSON.stringify({ type: "identity", data: { fingerprint: "FP2" } }),
  JSON.stringify({ type: "secret", data: { key: "LEGACY" } }),
  JSON.stringify({
    type: "value",
    secret: "LEGACY",
    data: { available_to: ["FP2"], value: "ciphertext" },
  }),
].join("\n");

describe("parseVault", () => {
  it("indexes the secrets a v2 vault holds", () => {
    const vault = parseVault(V2_VAULT, "/p/.dotsecenv/vault");

    expect(vault.version).toBe(2);
    expect(vault.identities).toEqual(["FP1", "FP2"]);
    expect([...vault.secrets.keys()]).toEqual([
      "demo::DATABASE_URL",
      "demo::GONE",
    ]);
  });

  it("reports the newest value's recipients", () => {
    const vault = parseVault(V2_VAULT, "/p/.dotsecenv/vault");
    const secret = vault.secrets.get("demo::DATABASE_URL");

    // Values are appended, so the last one wins - not the first.
    expect(secret).toMatchObject({
      availableTo: ["FP1", "FP2"],
      deleted: false,
      addedAt: "2026-02-01T00:00:00Z",
      valueCount: 2,
    });
  });

  it("flags a forgotten secret", () => {
    const vault = parseVault(V2_VAULT, "/p/.dotsecenv/vault");
    expect(vault.secrets.get("demo::GONE")?.deleted).toBe(true);
  });

  it("rejects a v1 vault by its legacy marker, naming the version", () => {
    expect(() => parseVault(V1_VAULT, "/p/.dotsecenv/vault")).toThrow(
      /vault format v1; only v2 is supported/,
    );
  });

  it("still reports a file that is no vault at all as such", () => {
    expect(() => parseVault("# === NOT A VAULT ===\na\nb", "/p/vault")).toThrow(
      /unexpected header marker/,
    );
  });

  it("rejects any format other than v2", () => {
    const v1WithCurrentMarker = [
      "# === VAULT HEADER ===",
      JSON.stringify({ version: 1, identities: {}, secrets: {} }),
      "# === VAULT DATA ===",
    ].join("\n");

    expect(() => parseVault(v1WithCurrentMarker, "/p/vault")).toThrow(
      /vault format v1; only v2 is supported/,
    );
  });

  it("points at the upgrade command when the format is too old", () => {
    const stale = [
      "# === VAULT HEADER ===",
      JSON.stringify({ version: 1, identities: {}, secrets: {} }),
      "# === VAULT DATA ===",
    ].join("\n");

    try {
      parseVault(stale, "/p/vault");
      throw new Error("expected parseVault to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DotsecenvError);
      expect((error as DotsecenvError).hint).toMatch(/vault doctor/);
    }
  });

  it("never exposes ciphertext", () => {
    const vault = parseVault(V2_VAULT, "/p/.dotsecenv/vault");
    expect(JSON.stringify([...vault.secrets.values()])).not.toContain(
      "ciphertext",
    );
  });

  it("rejects a file that is not a vault", () => {
    expect(() => parseVault("hello\nworld\nagain", "/p/vault")).toThrow(
      DotsecenvError,
    );
    expect(() => parseVault("too short", "/p/vault")).toThrow(DotsecenvError);
  });

  it("rejects a vault whose data marker is missing", () => {
    const broken = [
      "# === VAULT HEADER ===",
      JSON.stringify({ version: 2, identities: {}, secrets: {} }),
      "not the data marker",
    ].join("\n");

    expect(() => parseVault(broken, "/p/vault")).toThrow(/data marker/);
  });

  it("rejects an unparseable header", () => {
    const broken = [
      "# === VAULT HEADER ===",
      "{not json",
      "# === VAULT DATA ===",
    ].join("\n");

    expect(() => parseVault(broken, "/p/vault")).toThrow(/could not parse/);
  });

  it("tolerates records the index points at but cannot read", () => {
    const broken = [
      "# === VAULT HEADER ===",
      JSON.stringify({
        version: 2,
        identities: {},
        secrets: { A: { secret: 4, values: [99] } },
      }),
      "# === VAULT DATA ===",
      JSON.stringify({ type: "secret", data: { key: "A" } }),
    ].join("\n");

    // The header stays usable even when a value line is missing; the CLI is
    // still the authority on whether the secret can actually be read.
    const vault = parseVault(broken, "/p/vault");
    expect(vault.secrets.get("A")).toMatchObject({
      availableTo: [],
      deleted: false,
    });
  });

  it("handles a vault with no secrets", () => {
    const empty = [
      "# === VAULT HEADER ===",
      JSON.stringify({ version: 2, identities: {}, secrets: {} }),
      "# === VAULT DATA ===",
    ].join("\n");

    expect(parseVault(empty, "/p/vault").secrets.size).toBe(0);
  });
});

describe("readVault", () => {
  it("returns null when the vault does not exist", async () => {
    await expect(readVault("/definitely/not/here/vault")).resolves.toBeNull();
  });

  it("reads a vault from disk", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));
    try {
      const file = path.join(dir, "vault");
      fs.writeFileSync(file, V2_VAULT);

      const vault = await readVault(file);
      expect(vault?.secrets.has("demo::DATABASE_URL")).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("vaultPathFor", () => {
  it("points at the conventional location", () => {
    expect(vaultPathFor("/project")).toBe("/project/.dotsecenv/vault");
  });
});

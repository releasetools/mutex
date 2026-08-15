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
import path from "node:path";
import { DotsecenvError } from "./errors.js";
/**
 * A reader for dotsecenv vault files.
 *
 * The layout is a marker, a JSON header, a marker, then one JSON record per
 * line:
 *
 *   # === VAULT HEADER ===
 *   {"version":2,"identities":{...},"secrets":{"ns::KEY":{"secret":6,"values":[7,9]}}}
 *   # === VAULT DATA ===
 *   {"type":"identity","data":{...}}
 *   {"type":"secret","data":{...}}
 *   {"type":"value","secret":"ns::KEY","data":{...}}
 *
 * The header indexes records by 1-based line number, so which secrets a vault
 * holds - and who they are encrypted for - can be read without touching GPG.
 * Nothing here decrypts: values stay ciphertext, and `cli.ts` shells out to the
 * real dotsecenv binary for that.
 *
 * Only format v2 is read. Older vaults are rejected with a pointer at
 * `dotsecenv vault doctor` rather than parsed on a best-effort basis.
 */
export const HEADER_MARKER = "# === VAULT HEADER ===";
export const DATA_MARKER = "# === VAULT DATA ===";
/** The only vault format this client reads. */
export const SUPPORTED_FORMAT_VERSION = 2;
export const VAULT_DIRECTORY = ".dotsecenv";
export const VAULT_FILENAME = "vault";
/** The conventional vault location for a directory holding a `.secenv`. */
export function vaultPathFor(dir) {
    return path.join(dir, VAULT_DIRECTORY, VAULT_FILENAME);
}
export function parseVault(content, vaultPath) {
    const lines = content.split("\n");
    if (lines.length < 3) {
        throw new DotsecenvError(`${vaultPath} is not a vault file (truncated)`, {
            kind: "parse",
        });
    }
    const marker = lines[0].trim();
    if (marker !== HEADER_MARKER) {
        // Superseded vaults carry a versioned marker. Recognising it only to name
        // the version turns "this is not a vault" into something actionable.
        const legacy = /^# === VAULT HEADER v(\d+) ===$/.exec(marker);
        if (legacy) {
            throw unsupportedVersion(vaultPath, Number(legacy[1]));
        }
        throw new DotsecenvError(`${vaultPath} is not a vault file (unexpected header marker)`, { kind: "parse" });
    }
    let header;
    try {
        header = JSON.parse(lines[1]);
    }
    catch (cause) {
        throw new DotsecenvError(`could not parse the header of ${vaultPath}`, {
            kind: "parse",
            cause,
        });
    }
    if (header.version !== SUPPORTED_FORMAT_VERSION) {
        throw unsupportedVersion(vaultPath, header.version);
    }
    if (lines[2].trim() !== DATA_MARKER) {
        throw new DotsecenvError(`${vaultPath} is not a vault file (missing data marker)`, { kind: "parse" });
    }
    const secrets = new Map();
    for (const [key, index] of Object.entries(header.secrets ?? {})) {
        const valueLines = index?.values ?? [];
        // Values are appended, so the last one that parses is the current one -
        // the same rule the CLI applies when it decides what to decrypt.
        let latest = null;
        for (const lineNumber of valueLines) {
            const record = readRecord(lines, lineNumber);
            if (record?.type === "value") {
                latest = record;
            }
        }
        secrets.set(key, {
            key,
            availableTo: latest?.data?.available_to ?? [],
            deleted: latest?.data?.deleted === true,
            addedAt: latest?.data?.added_at ?? null,
            valueCount: valueLines.length,
        });
    }
    return {
        path: vaultPath,
        version: header.version,
        identities: Object.keys(header.identities ?? {}),
        secrets,
    };
}
/** Reads a vault, returning null when the file does not exist. */
export async function readVault(vaultPath) {
    let content;
    try {
        content = await fs.promises.readFile(vaultPath, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        throw new DotsecenvError(`could not read ${vaultPath}`, {
            kind: "vault",
            cause: error,
        });
    }
    return parseVault(content, vaultPath);
}
function unsupportedVersion(vaultPath, version) {
    return new DotsecenvError(`${vaultPath} uses vault format v${version ?? "?"}; only v${SUPPORTED_FORMAT_VERSION} is supported`, {
        kind: "vault",
        hint: "Upgrade the vault with 'dotsecenv vault doctor'.",
    });
}
function readRecord(lines, lineNumber) {
    const raw = lines[lineNumber - 1];
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        // A record we cannot read is not worth failing over: the header index is
        // only used to explain failures, and the CLI remains the authority.
        return null;
    }
}
//# sourceMappingURL=vault.js.map
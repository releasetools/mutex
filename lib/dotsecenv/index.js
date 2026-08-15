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
import path from "node:path";
import { SilentLogger } from "../logger.js";
import { DotsecenvError } from "./errors.js";
import { getSecret } from "./cli.js";
import { findSecenvFile, readSecenv, } from "./secenv.js";
import { readVault, vaultPathFor } from "./vault.js";
export * from "./errors.js";
export * from "./secenv.js";
export * from "./vault.js";
export { DEFAULT_TIMEOUT_MS, dotsecenvBinary, getSecret, listSecrets, version, } from "./cli.js";
export async function loadSecenv(options = {}) {
    const log = options.log ?? new SilentLogger();
    const found = findSecenvFile(options.cwd);
    const files = found ? [found] : [];
    const issues = [];
    const winners = new Map();
    for (const file of files) {
        const parsed = await readSecenv(file);
        issues.push(...parsed.issues);
        // Two phases per file, matching the shell plugin: plain values first, so a
        // key defined both ways in one file resolves to its secret.
        for (const entry of parsed.entries.filter((e) => e.kind === "plain")) {
            winners.set(entry.key, entry);
        }
        for (const entry of parsed.entries.filter((e) => e.kind === "secret")) {
            winners.set(entry.key, entry);
        }
    }
    for (const issue of issues) {
        log.warning(`${issue.file}:${issue.line}: ${issue.message}`);
    }
    const wanted = options.only ? new Set(options.only) : null;
    const values = {};
    const resolved = new Map();
    const vaults = new VaultCache();
    const decrypted = new Map();
    for (const entry of winners.values()) {
        if (entry.kind === "plain") {
            values[entry.key] = entry.value;
            resolved.set(entry.key, {
                key: entry.key,
                value: entry.value,
                kind: "plain",
                file: entry.file,
            });
            continue;
        }
        if (wanted && !wanted.has(entry.key)) {
            continue;
        }
        const dir = path.dirname(entry.file);
        const cacheKey = `${dir}\u0000${entry.value}`;
        let secret = decrypted.get(cacheKey);
        if (!secret) {
            secret = await fetchSecret(entry, dir, vaults, options, log);
            decrypted.set(cacheKey, secret);
        }
        values[entry.key] = secret.value;
        resolved.set(entry.key, {
            key: entry.key,
            value: secret.value,
            kind: "secret",
            file: entry.file,
            secret: entry.value,
            vault: secret.vault,
        });
    }
    return { files, values, resolved, issues };
}
/**
 * Resolves a single environment variable from the `.secenv` chain.
 *
 * Returns null when no `.secenv` defines it, so a caller can fall back to
 * whatever other source it prefers.
 */
export async function resolveEnvValue(key, options = {}) {
    const loaded = await loadSecenv({ ...options, only: [key] });
    return loaded.resolved.get(key) ?? null;
}
async function fetchSecret(entry, dir, vaults, options, log) {
    // Read the neighbouring vault's header first. It cannot decrypt anything,
    // but it can rule out a fetch that is guaranteed to fail, and it explains
    // failures the CLI reports only as an exit code.
    const vault = await vaults.read(vaultPathFor(dir), log);
    const known = vault?.secrets.get(entry.value);
    if (known?.deleted) {
        throw new DotsecenvError(`${entry.key} cannot be resolved: secret '${entry.value}' was forgotten in ${vault?.path}`, {
            kind: "vault",
            hint: "Store it again with 'dotsecenv secret store', or drop the reference from the .secenv file.",
        });
    }
    try {
        const secret = await getSecret(entry.value, {
            // Run where the .secenv lives, so a config entry like `.dotsecenv/vault`
            // resolves to this project's vault rather than to one under the cwd.
            cwd: dir,
            binary: options.binary,
            config: options.config,
            timeoutMs: options.timeoutMs,
        });
        log.debug(`Resolved ${entry.key} from secret '${entry.value}' (${secret.vault ?? "unknown vault"}).`);
        return secret;
    }
    catch (error) {
        throw enrich(error, entry, vault, known?.availableTo);
    }
}
function enrich(error, entry, vault, availableTo) {
    if (!(error instanceof DotsecenvError)) {
        return error;
    }
    const context = `${entry.file}:${entry.line} maps ${entry.key} to secret '${entry.value}'`;
    if (error.kind === "access-denied" && availableTo?.length) {
        return new DotsecenvError(`${error.message} (${context})`, {
            kind: error.kind,
            exitCode: error.exitCode,
            stderr: error.stderr,
            cause: error,
            hint: `In ${vault?.path} it is readable by: ${availableTo.join(", ")}.`,
        });
    }
    if (error.kind === "vault" && vault && !vault.secrets.has(entry.value)) {
        const known = [...vault.secrets.keys()];
        return new DotsecenvError(`${error.message} (${context})`, {
            kind: error.kind,
            exitCode: error.exitCode,
            stderr: error.stderr,
            cause: error,
            hint: known.length
                ? `${vault.path} holds: ${known.join(", ")}.`
                : `${vault.path} holds no secrets.`,
        });
    }
    return new DotsecenvError(`${error.message} (${context})`, {
        kind: error.kind,
        exitCode: error.exitCode,
        stderr: error.stderr,
        hint: error.hint ?? undefined,
        cause: error,
    });
}
/** Reads each vault at most once, and never fails the load over a bad one. */
class VaultCache {
    cache = new Map();
    async read(vaultPath, log) {
        if (this.cache.has(vaultPath)) {
            return this.cache.get(vaultPath) ?? null;
        }
        let vault = null;
        try {
            vault = await readVault(vaultPath);
        }
        catch (error) {
            // Diagnostics only: the CLI still gets its chance to resolve the secret.
            log.debug(`Ignoring unreadable vault ${vaultPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.cache.set(vaultPath, vault);
        return vault;
    }
}
//# sourceMappingURL=index.js.map
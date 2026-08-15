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
import { spawn } from "node:child_process";
import { DotsecenvError, kindForExitCode } from "./errors.js";
import { SECRET_NAME_PATTERN } from "./secenv.js";
/**
 * A thin wrapper around the `dotsecenv` binary.
 *
 * Decryption is delegated rather than reimplemented: the CLI owns GPG, vault
 * resolution and signature verification, and it is the only thing that can
 * read a secret. This module's job is to invoke it correctly and to turn its
 * exit codes into errors a caller can act on.
 */
export const DEFAULT_TIMEOUT_MS = 60_000;
export function dotsecenvBinary(explicit) {
    return explicit || process.env.DOTSECENV_BIN || "dotsecenv";
}
/**
 * Decrypts one secret.
 *
 * `--json` is used rather than the bare value so the result survives a value
 * that ends in a newline, and so the vault it came from is known for reporting.
 *
 * The key is checked and passed after `--`, because a flag-shaped key would
 * otherwise be read as an option by the CLI rather than as the secret to fetch:
 * `secret get --config=/etc/passwd` really does load that file as config.
 * `.secenv` parsing already rejects such names, but this is the boundary where
 * it matters, and `getSecret` is exported for callers who never went through it.
 */
export async function getSecret(key, options) {
    if (!SECRET_NAME_PATTERN.test(key)) {
        throw new DotsecenvError(`'${key}' is not a valid secret key`, {
            kind: "validation",
            hint: "Keys are NAME or namespace::NAME, using letters, digits and underscores.",
        });
    }
    const result = await run([...globalFlags(options), "secret", "get", "--json", "--", key], options);
    if (result.code !== 0) {
        throw failure(`could not read secret '${key}'`, result, options);
    }
    const payload = parseJson(result, `secret '${key}'`);
    if (typeof payload?.value !== "string") {
        throw new DotsecenvError(`dotsecenv returned no value for secret '${key}'`, { kind: "parse", stderr: result.stderr });
    }
    return {
        key,
        value: payload.value,
        vault: typeof payload.vault === "string" ? payload.vault : null,
        addedAt: typeof payload.added_at === "string" ? payload.added_at : null,
    };
}
/** Lists the secret keys reachable from `options.cwd`, without decrypting. */
export async function listSecrets(options) {
    const result = await run([...globalFlags(options), "secret", "get", "--json"], options);
    if (result.code !== 0) {
        throw failure("could not list secrets", result, options);
    }
    const payload = parseJson(result, "the secret listing");
    if (!Array.isArray(payload)) {
        return [];
    }
    return payload
        .filter((entry) => entry && typeof entry.key === "string")
        .map((entry) => ({ key: entry.key, vault: String(entry.vault ?? "") }));
}
export async function version(options) {
    const result = await run(["version"], options);
    if (result.code !== 0) {
        throw failure("could not read the dotsecenv version", result, options);
    }
    return result.stdout.trim();
}
function globalFlags(options) {
    // `-s` suppresses the CLI's advisory warnings, which would otherwise be
    // reported as if they were failures.
    const flags = ["-s"];
    if (options.config) {
        flags.push("-c", options.config);
    }
    for (const vault of options.vaults ?? []) {
        flags.push("-v", vault);
    }
    return flags;
}
function run(args, options) {
    const binary = dotsecenvBinary(options.binary);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
        // Never a shell, and arguments are passed as an array, so no part of a
        // secret name or path can be interpreted as syntax. The binary itself is
        // whatever the operator chose via --dotsecenv-bin or $DOTSECENV_BIN.
        const child = spawn(binary, args, {
            cwd: options.cwd,
            env: options.env ?? process.env,
            // stdin is inherited so a GPG passphrase prompt can reach the terminal;
            // stdout is piped so a decrypted value never leaks into our own output.
            stdio: ["inherit", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
        }, timeoutMs);
        timer.unref();
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            if (error.code === "ENOENT") {
                reject(new DotsecenvError(`the '${binary}' CLI was not found`, {
                    kind: "not-installed",
                    cause: error,
                    hint: "Install it from https://dotsecenv.com, or point DOTSECENV_BIN at the binary.",
                }));
                return;
            }
            reject(new DotsecenvError(`could not run '${binary}'`, {
                kind: "general",
                cause: error,
            }));
        });
        child.on("close", (code, signal) => {
            clearTimeout(timer);
            if (timedOut) {
                reject(new DotsecenvError(`'${binary}' timed out after ${timeoutMs / 1000}s`, {
                    kind: "timeout",
                    stderr,
                    hint: "GPG may be waiting for a passphrase that cannot be entered here.",
                }));
                return;
            }
            resolve({ stdout, stderr, code: code ?? (signal ? 1 : 0) });
        });
    });
}
function parseJson(result, subject) {
    try {
        return JSON.parse(result.stdout);
    }
    catch (cause) {
        throw new DotsecenvError(`could not parse the JSON dotsecenv returned for ${subject}`, { kind: "parse", stderr: result.stderr, cause });
    }
}
function failure(message, result, options) {
    const kind = kindForExitCode(result.code);
    return new DotsecenvError(message, {
        kind,
        exitCode: result.code,
        stderr: result.stderr,
        hint: hintFor(kind, options),
    });
}
function hintFor(kind, options) {
    switch (kind) {
        case "vault":
            return `Checked from ${options.cwd}; run 'dotsecenv secret get' there to see which secrets are reachable.`;
        case "config":
            return "Check DOTSECENV_CONFIG, or ~/.config/dotsecenv/config, for the list of vault paths.";
        case "gpg":
            return "Confirm your GPG key is available and unlocked (gpg --list-secret-keys).";
        case "access-denied":
            return "The secret is not shared with your identity; ask a holder to run 'dotsecenv secret share'.";
        case "fingerprint":
            return "Run 'dotsecenv login' to register your GPG fingerprint.";
        default:
            return undefined;
    }
}
//# sourceMappingURL=cli.js.map
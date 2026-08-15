import { Logger } from "../logger.js";
import { SecenvIssue } from "./secenv.js";
export * from "./errors.js";
export * from "./secenv.js";
export * from "./vault.js";
export { DEFAULT_TIMEOUT_MS, dotsecenvBinary, getSecret, listSecrets, version, } from "./cli.js";
export type { DotsecenvCliOptions, SecretReference, SecretValue, } from "./cli.js";
/**
 * Reads `.secenv` files, checks what the neighbouring vault knows about the
 * secrets they reference, and asks the dotsecenv CLI to decrypt the ones that
 * are actually needed.
 */
export interface LoadSecenvOptions {
    /** Where to start looking for `.secenv` files. Defaults to the cwd. */
    cwd?: string;
    /** Stop the upward walk here. Defaults to the git repository root. */
    boundary?: string;
    binary?: string;
    config?: string;
    timeoutMs?: number;
    /**
     * Resolve only these environment variables.
     *
     * Worth setting: every other secret in the file then stays encrypted, which
     * is both faster and one less value in this process' memory.
     */
    only?: string[];
    log?: Logger;
}
export interface ResolvedValue {
    key: string;
    value: string;
    kind: "plain" | "secret";
    /** The `.secenv` the winning definition came from. */
    file: string;
    /** For secrets, the vault key that was fetched. */
    secret?: string;
    /** For secrets, the vault the CLI read it from. */
    vault?: string | null;
}
export interface LoadedSecenv {
    /** The `.secenv` files that were read, root-first. */
    files: string[];
    values: Record<string, string>;
    resolved: Map<string, ResolvedValue>;
    /** Malformed lines. They are skipped rather than fatal, as in the plugin. */
    issues: SecenvIssue[];
}
export declare function loadSecenv(options?: LoadSecenvOptions): Promise<LoadedSecenv>;
/**
 * Resolves a single environment variable from the `.secenv` chain.
 *
 * Returns null when no `.secenv` defines it, so a caller can fall back to
 * whatever other source it prefers.
 */
export declare function resolveEnvValue(key: string, options?: LoadSecenvOptions): Promise<ResolvedValue | null>;

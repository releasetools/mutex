/**
 * A thin wrapper around the `dotsecenv` binary.
 *
 * Decryption is delegated rather than reimplemented: the CLI owns GPG, vault
 * resolution and signature verification, and it is the only thing that can
 * read a secret. This module's job is to invoke it correctly and to turn its
 * exit codes into errors a caller can act on.
 */
export declare const DEFAULT_TIMEOUT_MS = 60000;
export interface DotsecenvCliOptions {
    /** Overrides the binary. Falls back to $DOTSECENV_BIN, then `dotsecenv`. */
    binary?: string;
    /**
     * Where to run the binary.
     *
     * This is load-bearing: config files list vault paths like
     * `.dotsecenv/vault`, which the CLI resolves against its working directory.
     * Running from the directory that holds the `.secenv` is what makes a
     * project-local vault reachable - the same trick the shell plugin uses.
     */
    cwd: string;
    /** Passed through as `-c`. */
    config?: string;
    /** Passed through as `-v`, once per entry. */
    vaults?: string[];
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
}
export interface SecretValue {
    key: string;
    value: string;
    vault: string | null;
    addedAt: string | null;
}
export interface SecretReference {
    key: string;
    vault: string;
}
export declare function dotsecenvBinary(explicit?: string): string;
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
export declare function getSecret(key: string, options: DotsecenvCliOptions): Promise<SecretValue>;
/** Lists the secret keys reachable from `options.cwd`, without decrypting. */
export declare function listSecrets(options: DotsecenvCliOptions): Promise<SecretReference[]>;
export declare function version(options: DotsecenvCliOptions): Promise<string>;

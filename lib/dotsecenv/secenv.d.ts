/**
 * A parser for `.secenv` files.
 *
 * The rules mirror `_dotsecenv_parse_line` in the dotsecenv shell plugin, so a
 * file behaves the same whether it is loaded by the shell or by this client:
 *
 *   KEY=value                    plain value
 *   KEY="value" / KEY='value'    plain value, surrounding quotes stripped
 *   KEY={dotsecenv}              secret named KEY
 *   KEY={dotsecenv/}             secret named KEY
 *   KEY={dotsecenv/SECRET}       secret named SECRET
 *   KEY={dotsecenv/ns::SECRET}   secret named ns::SECRET
 *   # comment / empty            ignored
 */
export declare const SECENV_FILENAME = ".secenv";
/** Environment variable names: a letter or underscore, then word characters. */
export declare const KEY_PATTERN: RegExp;
/** Secret keys, optionally carrying a single `namespace::` prefix. */
export declare const SECRET_NAME_PATTERN: RegExp;
export interface SecenvEntry {
    key: string;
    kind: "plain" | "secret";
    /** For `plain`, the literal value. For `secret`, the vault key to fetch. */
    value: string;
    file: string;
    line: number;
}
export interface SecenvIssue {
    file: string;
    line: number;
    message: string;
}
export interface ParsedSecenv {
    file: string;
    entries: SecenvEntry[];
    issues: SecenvIssue[];
}
export declare function parseSecenv(content: string, file: string): ParsedSecenv;
export declare function readSecenv(file: string): Promise<ParsedSecenv>;
export interface DiscoveryOptions {
    /** Where to start looking. Defaults to the current working directory. */
    cwd?: string;
    /**
     * Stop walking up once this directory has been visited. Defaults to the
     * enclosing git repository root, matching the shell plugin's behaviour.
     */
    boundary?: string;
}
/**
 * Collects `.secenv` files from `cwd` up to the boundary, returned root-first.
 *
 * Order matters: ancestors load before their descendants so a nested file can
 * shadow a value inherited from the project root.
 */
export declare function findSecenvFiles(options?: DiscoveryOptions): string[];
/**
 * Finds the enclosing git repository root by looking for `.git`, which is a
 * directory in a normal clone and a file inside a worktree.
 */
export declare function findRepositoryRoot(from: string): string | null;

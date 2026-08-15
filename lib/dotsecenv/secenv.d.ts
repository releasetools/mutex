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
/**
 * The `.secenv` in `cwd`, or null when there is none.
 *
 * Deliberately does not walk upwards. An upward search has to stop somewhere,
 * and outside a git repository there is no sensible somewhere: from
 * /tmp/build-1234 it reaches /tmp, which anybody can write to, and a planted
 * `.secenv` there would decide which database mutex locks against. Reading one
 * directory is predictable and cannot be steered from outside it.
 *
 * Point `--secenv-dir` at the project root to use a file that lives higher up.
 */
export declare function findSecenvFile(cwd?: string): string | null;

export type DotsecenvErrorKind = "not-installed" | "general" | "config" | "vault" | "gpg" | "auth" | "validation" | "fingerprint" | "access-denied" | "algorithm" | "timeout" | "parse";
export declare function kindForExitCode(code: number): DotsecenvErrorKind;
export interface DotsecenvErrorOptions {
    kind: DotsecenvErrorKind;
    exitCode?: number | null;
    /** Whatever the CLI wrote to stderr. Never contains a decrypted value. */
    stderr?: string;
    /** A concrete next step for the user, appended when the error is printed. */
    hint?: string;
    cause?: unknown;
}
export declare class DotsecenvError extends Error {
    readonly kind: DotsecenvErrorKind;
    readonly exitCode: number | null;
    readonly stderr: string;
    readonly hint: string | null;
    constructor(message: string, options: DotsecenvErrorOptions);
    /** A multi-line rendering that keeps the CLI's own message and the hint. */
    describe(): string;
}

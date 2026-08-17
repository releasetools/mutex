export type LogLevel = "silent" | "error" | "warning" | "info" | "debug";
/**
 * The logging contract shared by the GitHub Action and the CLI.
 *
 * The Action maps it onto `@actions/core` so annotations keep working; the CLI
 * maps it onto stderr. Keeping the mutex core behind this interface is what
 * lets `database.ts` and `mutex.ts` run outside a GitHub runner.
 */
export interface Logger {
    info(message: string): void;
    warning(message: string): void;
    error(message: string): void;
    debug(message: string): void;
}
/**
 * Writes every message to stderr.
 *
 * stdout is deliberately left alone: it carries command results (and, while
 * `mutex lock ... -- <command>` runs, the wrapped process' own output), so
 * diagnostics must never be mixed into it.
 */
export declare class ConsoleLogger implements Logger {
    private readonly threshold;
    constructor(level?: LogLevel);
    info(message: string): void;
    warning(message: string): void;
    error(message: string): void;
    debug(message: string): void;
    private write;
}
/** Discards everything. Useful in tests and for `--quiet`-style callers. */
export declare class SilentLogger implements Logger {
    info(): void;
    warning(): void;
    error(): void;
    debug(): void;
}

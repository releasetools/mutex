import { LogLevel } from "../logger.js";
/**
 * Command names map onto the operations in `mutex.ts`:
 *
 *   lock, try-lock  -> tryLock  (`try-lock` has nothing to wait for)
 *   unlock          -> tryUnlock
 */
export type CommandName = "lock" | "try-lock" | "unlock" | "renew" | "status" | "list" | "prune" | "help" | "version";
/**
 * Whether a command takes a lock id.
 *
 * `optional` belongs to the two acquiring commands: with no id they mint a
 * UUID, which is what makes `mutex lock -- <program>` useful on its own - an
 * anonymous lock nobody else can name, released when the program exits.
 */
type IdentifierMode = "required" | "optional" | "none";
interface CommandSpec {
    summary: string;
    usage: string;
    identifier: IdentifierMode;
    acceptsProgram: boolean;
    options: readonly string[];
}
export declare const COMMANDS: Record<CommandName, CommandSpec>;
export declare const DEFAULT_EXPIRATION_SECONDS = 60;
export declare const DEFAULT_POLL_INTERVAL_SECONDS = 10;
/** -1 means "wait as long as the lock would have lasted", as in the Action. */
export declare const DEFAULT_MAX_WAIT_SECONDS = -1;
export interface ResolvedOptions {
    reason: string;
    expiration: number;
    pollTimeoutMs: number;
    pollIntervalMs: number;
    autoRenew: boolean;
    owner: string;
    force: boolean;
    dryRun: boolean;
    databaseUrl: string | null;
    envVar: string;
    secenvDir: string;
    useSecenv: boolean;
    dotsecenvBin: string | null;
    dotsecenvConfig: string | null;
    json: boolean;
    logLevel: LogLevel;
}
export interface CommandLine {
    command: CommandName;
    identifier: string;
    /** True when no id was given and one was minted for this run. */
    generatedIdentifier: boolean;
    /** The program to wrap, taken from everything after `--`. */
    program: string[];
    options: ResolvedOptions;
    /** `help`'s optional argument. */
    topic: CommandName | null;
}
export declare function parseCommandLine(argv: string[]): CommandLine;
/** Identifies the caller, so `unlock` can tell whose lock it is breaking. */
export declare function defaultOwner(): string;
export declare function helpText(topic: CommandName | null): string;
export {};

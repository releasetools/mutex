import { LogLevel } from "../logger.js";
/**
 * Command names map onto the operations in `mutex.ts`:
 *
 *   lock, try-lock  -> tryLock  (`try-lock` has nothing to wait for)
 *   unlock          -> tryUnlock
 */
export type CommandName = "lock" | "try-lock" | "unlock" | "renew" | "status" | "list" | "prune" | "help" | "version";
/** Whether a command takes a lock id. */
type IdentifierMode = "required" | "none";
interface CommandSpec {
    summary: string;
    usage: string;
    identifier: IdentifierMode;
    acceptsProgram: boolean;
    options: readonly string[];
}
export declare const COMMANDS: Record<CommandName, CommandSpec>;
/**
 * `renew` leases longer than `lock` does, because the two answer different
 * questions: a lock says how long the work is expected to take, a renewal says
 * how much longer it needs. Renewing is also the point at which a short
 * default is most expensive - it is called by things that have already been
 * running a while.
 */
export declare const DEFAULT_RENEW_EXPIRATION_SECONDS = 3600;
export interface ResolvedOptions {
    reason: string;
    expiration: number;
    pollTimeoutMs: number;
    pollIntervalMs: number;
    autoRenew: boolean;
    owner: string | null;
    dryRun: boolean;
    envVar: string;
    json: boolean;
    logLevel: LogLevel;
}
export interface CommandLine {
    command: CommandName;
    identifier: string;
    /** The program to wrap, taken from everything after `--`. */
    program: string[];
    options: ResolvedOptions;
    /** `help`'s optional argument. */
    topic: CommandName | null;
}
export declare function parseCommandLine(argv: string[]): CommandLine;
/**
 * Who is taking the lock, or null when nobody says.
 *
 * Unowned is the default on purpose: it matches what the GitHub Action writes,
 * so an unowned caller can unlock and renew an unowned lock, whichever of the
 * two took it. Naming an owner is what opts into the stricter guards.
 */
export declare function defaultOwner(): string | null;
export declare function helpText(topic: CommandName | null): string;
export {};

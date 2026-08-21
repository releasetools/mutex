import { Logger } from "../logger.js";
import { LockStore } from "../mutex.js";
import { ResolvedOptions } from "./args.js";
import { Output } from "./output.js";
export interface CommandContext {
    mutex: LockStore;
    options: ResolvedOptions;
    log: Logger;
    out: Output;
}
/**
 * `mutex lock` and `mutex try-lock`, which differ only in how long they wait -
 * `parseCommandLine` has already zeroed the timeout for `try-lock`.
 *
 * With a program after `--`, the lock is held for exactly as long as that
 * program runs and is released on every exit path.
 */
export declare function commandLock(ctx: CommandContext, identifier: string, program: string[], command?: "lock" | "try-lock"): Promise<number>;
/** `mutex unlock`. */
export declare function commandUnlock(ctx: CommandContext, identifier: string): Promise<number>;
/**
 * `mutex renew`: extend a lock this owner already holds.
 *
 * Never takes a lock. If the id is not held, or is held by somebody else, or
 * has expired, that is a failure - the caller has lost the lock and needs to
 * know, not to silently acquire a new one.
 */
export declare function commandRenew(ctx: CommandContext, identifier: string): Promise<number>;
/** `mutex status`: exit 0 while the lock is held, 4 once it is free. */
export declare function commandStatus(ctx: CommandContext, identifier: string): Promise<number>;
/**
 * `mutex list`, narrowed to one owner when the caller names one.
 *
 * Holding nothing is an answer rather than a failure, so an empty list still
 * exits 0 - and says whose locks it looked for, since "no locks" and "none of
 * yours" are different things to read off a screen.
 */
export declare function commandList(ctx: CommandContext): Promise<number>;
/** `mutex prune`. */
export declare function commandPrune(ctx: CommandContext): Promise<number>;

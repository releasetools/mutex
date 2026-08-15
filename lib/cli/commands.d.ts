import { DatabaseMutex } from "../database.js";
import { Logger } from "../logger.js";
import { ResolvedOptions } from "./args.js";
import { Output } from "./output.js";
export interface CommandContext {
    mutex: DatabaseMutex;
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
export declare function commandLock(ctx: CommandContext, identifier: string, program: string[], generatedIdentifier?: boolean): Promise<number>;
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
/** `mutex list`. */
export declare function commandList(ctx: CommandContext): Promise<number>;
/** `mutex prune`. */
export declare function commandPrune(ctx: CommandContext): Promise<number>;

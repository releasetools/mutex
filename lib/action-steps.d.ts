import { MutexSettings } from "./configuration.js";
import { Logger } from "./logger.js";
import { LockResult, MutexInterface, UnlockResult } from "./mutex.js";
import { Notifications } from "./notifications.js";
/**
 * The Action's two steps.
 *
 * Both live here because `main.ts` and `post.ts` release identically - the
 * post step is the same operation, just reached by a different route - and
 * keeping one copy is what stops the two drifting apart. The CLI has no use
 * for either: they record job state and post notifications.
 */
/** Take the lock, record it in job state, and announce it. */
export declare function acquireAndAnnounce(settings: MutexSettings, mutex: MutexInterface, log: Logger, notifications: Notifications): Promise<LockResult>;
/**
 * Hand the lock back, clear the job state, and announce it.
 *
 * A refusal fails the step rather than passing quietly: the lock is still held
 * by somebody, and a green step with `status` unset would let a downstream
 * `if: steps.mutex.outputs.status == 'released'` skip without anyone noticing.
 */
export declare function releaseAndAnnounce(settings: MutexSettings, mutex: MutexInterface, log: Logger, notifications: Notifications): Promise<UnlockResult>;

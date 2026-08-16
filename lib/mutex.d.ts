import { Logger } from "./logger.js";
/** A row of the lock table, with timestamps normalised to ISO-8601 UTC. */
export interface LockRecord {
    id: string;
    reason: string | null;
    owner: string | null;
    createdAt: string | null;
    expiresAt: string | null;
    expired: boolean;
}
export type LockResult = {
    acquired: boolean;
    status: string;
    expires?: string;
    /** The row we wrote, or - when contended - the row standing in the way. */
    record?: LockRecord;
};
export type UnlockOutcome = "unlocked" | "not-found" | "owned-by-another"
/** The id is held, but by a later acquisition than the caller's. */
 | "superseded" | "contended";
export type UnlockResult = {
    unlocked: boolean;
    outcome: UnlockOutcome;
    record?: LockRecord;
};
/**
 * Everything `tryLock`/`tryUnlock` need about a request. Both `MutexSettings`
 * (the Action) and the CLI's resolved options satisfy this structurally.
 */
export interface LockRequest {
    identifier: string;
    reason: string;
    pollTimeoutMs: number;
    pollIntervalMs: number;
    owner?: string | null;
    /**
     * `created_at` of the acquisition being released, if the caller has one.
     *
     * A lock that lapsed and was taken over is a different holding under the
     * same name; `created_at` is reset on takeover and never otherwise, so it
     * distinguishes them. Supplying it makes a release refuse to delete
     * somebody else's lock even when ownership cannot tell them apart.
     */
    fence?: string | null;
}
/** Connection details needed to talk to the lock store. */
export interface MutexConfig {
    dbConnectionString: string;
    expiration: number;
}
export interface MutexInterface {
    acquireLock(name: string, reason: string, owner?: string | null): Promise<LockResult>;
    releaseLock(name: string, owner?: string | null, fence?: string | null): Promise<UnlockResult>;
}
/**
 * Side effects a caller wants attached to an outcome: the Action posts PR and
 * Slack notifications and records job state, the CLI prints a line.
 */
export interface LockEvents {
    onLocked?(result: LockResult): void | Promise<void>;
    onUnlocked?(result: UnlockResult): void | Promise<void>;
    /**
     * The lock is held by another owner. A separate event from onTimeout because
     * it is a decision rather than a deadline - but it still has to be reported,
     * or a caller that only handles success and timeout finishes green having
     * done nothing.
     */
    onRefused?(result: UnlockResult): void | Promise<void>;
    onContended?(result: LockResult, attempt: number): void | Promise<void>;
    onTimeout?(message: string): void | Promise<void>;
}
/**
 * Acquire the lock, retrying until `pollTimeoutMs` elapses.
 *
 * Always makes at least one attempt, so a zero timeout means "try once" rather
 * than "do nothing" - that is what `mutex try-lock` relies on.
 */
export declare function tryLock(request: LockRequest, mutex: MutexInterface, log: Logger, events?: LockEvents): Promise<LockResult>;
/**
 * Release the lock, retrying while the attempt is merely contended.
 *
 * Unlocking something that is not locked succeeds: unlock is idempotent. A
 * refusal (`owned-by-another`) is a decision rather than a transient failure,
 * so it short-circuits the retry loop.
 */
export declare function tryUnlock(request: LockRequest, mutex: MutexInterface, log: Logger, events?: LockEvents): Promise<UnlockResult>;

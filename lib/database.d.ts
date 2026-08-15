import { LockRecord, LockResult, MutexConfig, MutexInterface, UnlockResult } from "./mutex.js";
import { Logger } from "./logger.js";
export type RenewOutcome = "renewed" | "not-found" | "owned-by-another" | "expired" | "contended";
export type RenewResult = {
    renewed: boolean;
    outcome: RenewOutcome;
    /** False when the lock already ran later than the requested expiry. */
    extended?: boolean;
    record?: LockRecord;
};
export declare class DatabaseMutex implements MutexInterface {
    private readonly config;
    private readonly log;
    private readonly pool;
    private closed;
    /** Schema creation is tried at most once per instance. */
    private schemaAttempted;
    constructor(config: MutexConfig, log?: Logger);
    acquireLock(name: string, reason: string, owner?: string | null): Promise<LockResult>;
    releaseLock(name: string, owner?: string | null): Promise<UnlockResult>;
    /**
     * Extends a lock that `owner` currently holds.
     *
     * Strictly an UPDATE: it never inserts, so renewing something that is not
     * held fails rather than quietly taking a new lock. Both the id and the
     * owner have to match, and an expired lock is refused - by then somebody
     * else may already have taken it over.
     *
     * The new expiry is whichever is later, now + `expiration` or the expiry the
     * lock already had, so renewing can only ever buy more time. Asking for less
     * than the lock already has is a no-op rather than a silent shortening.
     */
    renewLock(name: string, expiration: number, owner?: string | null): Promise<RenewResult>;
    /** Returns the lock's current row, or null when nothing holds it. */
    inspectLock(name: string): Promise<LockRecord | null>;
    /** Returns every lock in the table, expired ones included. */
    listLocks(): Promise<LockRecord[]>;
    /**
     * Deletes every expired lock. Expired rows are already dead - acquiring
     * overwrites them - so this is only housekeeping and needs no advisory lock.
     */
    pruneExpired(dryRun?: boolean): Promise<LockRecord[]>;
    /** Releases the connection pool. Required for a CLI process to exit. */
    close(): Promise<void>;
    private acquireLockInternal;
    private releaseLockInternal;
    private renewLockInternal;
    /**
     * Takes a transaction-scoped advisory lock on the mutex id, so no other
     * process can acquire or release the same lock concurrently. Retries once,
     * since contention here is almost always momentary.
     */
    private holdAdvisoryLock;
    private tryAdvisoryLock;
    /**
     * Runs an operation and, if it fails, makes sure the schema exists before
     * trying once more - the usual cause is a database that has never seen this
     * action before.
     */
    private withSchemaRetry;
    /**
     * Creates the lock table when missing, and adds the `owner` column to tables
     * created by earlier versions. Both statements are idempotent.
     */
    private initializeTable;
    private connect;
    private disconnect;
}
/**
 * Who may unlock or renew a lock: its owner, or anyone at all when it has none.
 *
 * Ownership is what confers protection, so a lock nobody claimed is nobody's to
 * defend - which is also what lets the CLI manage the unowned locks the Action
 * writes today. Naming an owner is the act that makes a lock yours.
 *
 * There is no override. Breaking somebody else's lock means naming them, which
 * makes it a deliberate act rather than a flag appended to a failing command.
 *
 * Exported for tests: the matrix is small, security-relevant, and worth pinning.
 */
export declare function mayModify(record: LockRecord, owner: string | null): boolean;

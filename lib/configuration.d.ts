import { LockRequest, MutexConfig } from "./mutex.js";
export declare class MutexSettings implements MutexConfig, LockRequest {
    dbConnectionString: string;
    command: string;
    identifier: string;
    expiration: number;
    reason: string;
    pollTimeoutMs: number;
    pollIntervalMs: number;
    autoReleaseLock: boolean;
    /**
     * The Action does not record an owner, so every lock it takes stays
     * releasable by anyone - including by the CLI without `--force`.
     */
    readonly owner: null;
    /**
     * ...and for the same reason the Action releases unconditionally, exactly as
     * it did before ownership existed.
     */
    readonly force = true;
    constructor();
}

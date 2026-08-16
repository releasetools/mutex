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
     * The Action does not record an owner yet (see issue #67), so every lock it
     * takes is unowned - releasable by itself, and by any caller that likewise
     * names no owner.
     */
    readonly owner: null;
    constructor();
}

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
    owner: string | null;
    constructor();
}

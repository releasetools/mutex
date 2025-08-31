export declare class MutexSettings {
    dbConnectionString: string;
    command: string;
    identifier: string;
    expiration: number;
    reason: string;
    pollTimeoutMs: number;
    pollIntervalMs: number;
    autoReleaseLock: boolean;
    constructor();
}

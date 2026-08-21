import { LockRecord, LockResult, LockStore, RenewResult, UnlockResult } from "../mutex.js";
import { Operation, ServerStatus } from "./protocol.js";
export declare class TcpMutexStore implements LockStore {
    private readonly bindAddress;
    private readonly timeoutMs;
    private readonly hostname;
    private readonly profile;
    constructor(bindAddress: string, timeoutMs?: number, hostname?: string, profile?: string);
    acquireLock(name: string, reason: string, owner?: string | null, expiration?: number, operation?: "lock" | "try-lock"): Promise<LockResult>;
    releaseLock(name: string, owner?: string | null, fence?: string | null): Promise<UnlockResult>;
    renewLock(name: string, expiration: number, owner?: string | null): Promise<RenewResult>;
    inspectLock(name: string): Promise<LockRecord | null>;
    listLocks(owner?: string | null): Promise<LockRecord[]>;
    pruneExpired(dryRun?: boolean): Promise<LockRecord[]>;
    health(): Promise<ServerStatus>;
    stop(): Promise<{
        stopping: true;
    }>;
    close(): Promise<void>;
    request<T>(operation: Operation, payload: Record<string, unknown>): Promise<T>;
}

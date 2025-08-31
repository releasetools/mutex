import { Pool } from "pg";
import { LockResult, MutexInterface } from "./mutex";
import { MutexSettings } from "./configuration";
export declare class DatabaseMutex implements MutexInterface {
    settings: MutexSettings;
    connection_string: string;
    pool: Pool;
    constructor(settings: MutexSettings);
    acquireLock(name: string, reason: string): Promise<LockResult>;
    acquireLockInternal(name: string, reason: string): Promise<LockResult>;
    releaseLock(name: string): Promise<boolean>;
    releaseLockInternal(name: string): Promise<boolean>;
    dbAdvisoryLockUnsafe(client: any, name: string): Promise<boolean>;
    /**
     * Connects to the PostgreSQL database and creates the table
     * if it does not already exist.
     */
    private initializeTable;
}

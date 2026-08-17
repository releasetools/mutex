import { Logger } from "../logger.js";
import { LockStore } from "../mutex.js";
import { MutexProfile } from "../cli/profiles.js";
export interface ServerPaths {
    logPath: string;
    pidPath: string;
}
export interface ServerDatabase extends LockStore {
    warm(): Promise<void>;
    poolStatus(): {
        total: number;
        idle: number;
        waiting: number;
    };
}
export declare function serverPaths(profile: MutexProfile): ServerPaths;
export declare function runServer(profile: MutexProfile, connectionString: string, log: Logger, createDatabase?: (connectionString: string, log: Logger) => ServerDatabase): Promise<void>;

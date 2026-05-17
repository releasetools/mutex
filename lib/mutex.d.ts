import { MutexSettings } from "./configuration.js";
import { GitHubClient } from "./github.js";
import { Notifications } from "./notifications.js";
export type LockResult = {
    acquired: boolean;
    status: string;
    expires?: string;
};
export interface MutexInterface {
    acquireLock(name: string, reason: string): Promise<LockResult>;
    releaseLock(name: string): Promise<boolean>;
}
export declare function tryLock(settings: MutexSettings, gh: GitHubClient, mutex: MutexInterface, notifications: Notifications): Promise<void>;
export declare function tryRelease(settings: MutexSettings, gh: GitHubClient, mutex: MutexInterface, notifications: Notifications): Promise<void>;
export declare function shouldRunAction(gh: GitHubClient): Promise<boolean>;

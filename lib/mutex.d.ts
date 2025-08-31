import { MutexSettings } from "./configuration";
import { GitHubClient } from "./github";
import { Notifications } from "./notifications";
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

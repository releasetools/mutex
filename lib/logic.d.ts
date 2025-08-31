import { MutexSettings } from "./configuration";
import { GitHubClient } from "./github";
import { MutexInterface } from "./mutex";
export declare function tryLock(
  settings: MutexSettings,
  gh: GitHubClient,
  mutex: MutexInterface,
): Promise<void>;
export declare function tryRelease(
  settings: MutexSettings,
  gh: GitHubClient,
  mutex: MutexInterface,
): Promise<void>;

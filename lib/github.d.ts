import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
export declare class GitHubClient {
    octokit: InstanceType<typeof GitHub>;
    context: typeof github.context;
    pr: typeof github.context.payload.pull_request;
    owner: string;
    repo: string;
    constructor();
}
export declare function isLockAcquired(): boolean;
export declare function setLockAcquired(): void;
export declare function setLockReleased(): void;
/**
 * Publishes which build of the action actually ran.
 *
 * The release workflow asserts this against the tag being released: `uses:
 * releasetools/mutex@v1` resolves through GitHub's own caches, so waiting for
 * the tag to move cannot prove the runner was handed the new code. This can.
 */
export declare function setVersion(version: string): void;
export declare function setSkipped(): void;
export declare function setFailed(message: string): void;
export declare function shouldRunAction(gh: GitHubClient): Promise<boolean>;

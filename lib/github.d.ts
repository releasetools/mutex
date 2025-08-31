import * as github from "@actions/github";
import { WebhookPayload } from "@actions/github/lib/interfaces";
import { GitHub } from "@actions/github/lib/utils";
export declare class GitHubClient {
    octokit: InstanceType<typeof GitHub>;
    context: typeof github.context;
    pr: WebhookPayload["pull_request"] | undefined;
    owner: string;
    repo: string;
    constructor();
}
export declare function isLockAcquired(): boolean;
export declare function setLockAcquired(): void;
export declare function setLockReleased(): void;
export declare function setSkipped(): void;
export declare function setFailed(message: string): void;

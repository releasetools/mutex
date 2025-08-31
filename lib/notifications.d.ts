import { MutexSettings } from "./configuration";
import { GitHubClient } from "./github";
export declare class Notifications {
    private settings;
    private slack;
    private gh;
    private updatePullRequests;
    constructor(settings: MutexSettings, gh: GitHubClient);
    send(message: string): Promise<number>;
}

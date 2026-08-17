import { MutexSettings } from "./configuration.js";
import { GitHubClient } from "./github.js";
export declare class Notifications {
    private settings;
    private slack;
    private gh;
    private updatePullRequests;
    constructor(settings: MutexSettings, gh: GitHubClient);
    send(message: string): Promise<number>;
}

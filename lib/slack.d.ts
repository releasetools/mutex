import { MutexSettings } from "./configuration.js";
export declare class SlackClient {
    private settings;
    private slack;
    private channel;
    /**
     * `slack-channel` is the switch. Leaving it out means nobody asked for
     * Slack, so nothing is said: a workflow that never wanted notifications is
     * not misconfigured, and warning at it buries the case that is. A channel
     * with no token is the real mistake, and that still warns.
     *
     * It also means a `SLACK_BOT_TOKEN` inherited from job-level `env:` no
     * longer decides anything. It used to, and a step with no channel then
     * failed the whole job.
     */
    constructor(settings: MutexSettings);
    postMessage(text: string): Promise<boolean>;
}

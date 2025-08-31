import { MutexSettings } from "./configuration";
export declare class SlackClient {
    private settings;
    private slack;
    private channel;
    constructor(settings: MutexSettings);
    private initializeClient;
    postMessage(text: string): Promise<boolean>;
}

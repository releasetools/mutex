import { Logger } from "../logger.js";
export type ServerAction = "start" | "run" | "status" | "stop";
export declare function serverCommand(action: ServerAction, requestedProfile: string | null, json: boolean, log: Logger): Promise<number>;

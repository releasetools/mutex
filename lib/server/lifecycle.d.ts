import { Logger } from "../logger.js";
export type ServerAction = "start" | "run" | "status" | "stop";
export declare function serverCommand(action: ServerAction, requestedProfile: string | null, json: boolean, log: Logger): Promise<number>;
/**
 * The version the server is running, next to this one when they differ.
 *
 * The comparison is the point: a server keeps running the code it started
 * with, so after an upgrade the process answering here is the old one until
 * somebody restarts it - which is what a protocol mismatch is, seen from the
 * other side. A server too old to report a version is by definition not this
 * one, so it is named as the difference it is rather than left blank.
 */
export declare function describeServerVersion(reported: string | undefined, mine?: string): string;

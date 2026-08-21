/**
 * Bumped whenever a request or a response changes meaning, since both ends
 * compare it and refuse a mismatch by name.
 *
 * 2 carries `list`'s owner filter. A version 1 server ignores the field and
 * answers with the whole table, which the client would then present as one
 * owner's locks - and a wrong answer is worse than a refusal that says which
 * process to restart.
 */
export declare const PROTOCOL_VERSION = 2;
/**
 * The version lifecycle requests carry, frozen at 1.
 *
 * `stop` and `health` have to survive a version gap, because they are how one
 * is diagnosed and fixed: gating `stop` on the version makes the remedy the
 * mismatch itself recommends - restart the server - unreachable through mutex,
 * leaving `kill` and a pid file. So they are spoken in a dialect neither end
 * ever changes, and both ends exempt them from the check. Their shape is
 * fixed by that promise: an empty payload in, a status object out.
 */
export declare const LIFECYCLE_PROTOCOL_VERSION = 1;
export declare const MAX_MESSAGE_BYTES: number;
export declare const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
export type Operation = "lock" | "unlock" | "renew" | "status" | "list" | "prune" | "health" | "stop";
export interface ProtocolRequest {
    version: number;
    profile: string;
    operation: Operation;
    hostname: string;
    payload: Record<string, unknown>;
}
export type ProtocolResponse = {
    version: number;
    ok: true;
    result: unknown;
} | {
    version: number;
    ok: false;
    error: string;
};
export interface ServerStatus {
    profile: string;
    /**
     * The mutex version the server process is running.
     *
     * Optional because it is not the only thing that answers: `health` survives
     * a version gap on purpose, so a server built before this field existed can
     * still reply, and the reply simply does not carry one.
     */
    version?: string;
    pid: number;
    uptimeSeconds: number;
    bindAddress: string;
    logPath: string;
    protocolVersion: number;
    pool: {
        healthy: boolean;
        total: number;
        idle: number;
        waiting: number;
    };
}
export interface TcpAddress {
    host: string;
    port: number;
}
export declare function parseTcpAddress(value: string): TcpAddress;
/** Operations that work whatever version the other end speaks. */
export declare function isLifecycleOperation(value: Operation): boolean;
export declare function isOperation(value: unknown): value is Operation;

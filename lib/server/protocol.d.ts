export declare const PROTOCOL_VERSION = 1;
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
export declare function isOperation(value: unknown): value is Operation;

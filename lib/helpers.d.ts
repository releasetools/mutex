import { Logger } from "./logger.js";
export declare const sleep: (ms: number) => Promise<void>;
export declare function describeError(error: unknown): string;
export declare function errorStack(error: unknown): string;
export declare function logError(log: Logger, error: unknown, description?: string | null): void;
export declare function logWarning(log: Logger, error: unknown, description?: string | null): void;

export declare const sleep: (ms: number) => Promise<void>;
export declare function loadRequiredNonEmptyFromGHAInput(name: string): string;
export declare function loadRequiredFromEnvOrGHAInput(name: string): string;
export declare function loadFromEnvOrGHAInput(name: string): string | null;
export declare function printError(error: any, description: string | null): void;
export declare function printWarning(error: any, description: string | null): void;

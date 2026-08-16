/**
 * Readers for GitHub Actions inputs.
 *
 * Kept separate from `helpers.ts` so the mutex core (and therefore the CLI)
 * never has to import the Actions toolkit.
 */
export declare function loadRequiredNonEmptyFromGHAInput(name: string): string;
export declare function loadRequiredFromEnvOrGHAInput(name: string): string;
export declare function loadFromEnvOrGHAInput(name: string): string | null;

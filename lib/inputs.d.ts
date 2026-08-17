/**
 * Readers for GitHub Actions inputs.
 *
 * Kept separate from `helpers.ts` so the mutex core (and therefore the CLI)
 * never has to import the Actions toolkit.
 */
export declare function loadRequiredFromEnvOrGHAInput(name: string): string;
/**
 * Reads something optional. Absence is not reported here: only the caller
 * knows whether it was wanted, and warning about every unset optional value
 * puts a ⚠️ in the log of a job that is configured exactly as intended.
 */
export declare function loadFromEnvOrGHAInput(name: string): string | null;

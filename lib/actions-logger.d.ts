import { Logger } from "./logger.js";
/**
 * Routes the mutex core's log output through the GitHub Actions toolkit, so
 * warnings and errors still surface as workflow annotations.
 *
 * This lives in its own module so the CLI never pulls `@actions/core` in.
 */
export declare class ActionsLogger implements Logger {
    info(message: string): void;
    warning(message: string): void;
    error(message: string): void;
    debug(message: string): void;
}

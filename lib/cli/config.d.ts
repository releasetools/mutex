import { Logger } from "../logger.js";
import { ResolvedOptions } from "./args.js";
export interface Connection {
    value: string;
    /** Where it came from, for `--verbose` and for error messages. */
    source: string;
}
/**
 * Works out the PostgreSQL connection string, in order of precedence:
 *
 *   1. --database-url
 *   2. the environment (DATABASE_URL by default)
 *   3. the .secenv chain, decrypted through the dotsecenv CLI
 *
 * The explicit sources come first so a one-off override never has to fight
 * with whatever the project's `.secenv` says.
 */
export declare function resolveConnectionString(options: ResolvedOptions, log: Logger): Promise<Connection>;

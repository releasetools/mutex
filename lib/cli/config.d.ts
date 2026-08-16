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
 *   1. the environment (DATABASE_URL by default)
 *   2. ./.secenv, decrypted through the dotsecenv CLI
 *
 * The environment comes first, so a one-off override never has to fight with
 * whatever the project's `.secenv` says - and when it is set there is nothing
 * to resolve, so no vault is opened and no GPG prompt can appear for a value
 * that was already to hand.
 *
 * There is no flag. A connection string passed on the command line lands in
 * shell history, and in `ps` for every user on the machine to read for as long
 * as the process runs; an environment variable does neither.
 */
export declare function resolveConnectionString(options: ResolvedOptions, log: Logger): Promise<Connection>;

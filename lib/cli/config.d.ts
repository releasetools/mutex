import { Logger } from "../logger.js";
import { ResolvedOptions } from "./args.js";
export interface Connection {
    value: string;
    /** Where it came from, for `--verbose` and for error messages. */
    source: string;
}
/**
 * Works out the PostgreSQL connection string.
 *
 * It comes from the environment, and only from there. Not from a flag,
 * because an argument lands in shell history and in `ps` output that every
 * user on the machine can read for as long as the process runs. And not from
 * a secret store either: reading one means reimplementing somebody else's
 * file formats and owning a decryption subprocess, which is a great deal of
 * surface for a lock tool to carry.
 *
 * Whatever holds the secret can put it in the environment instead:
 *
 *     DATABASE_URL="$(dotsecenv secret get myapp::DATABASE_URL)" mutex lock x
 *
 * or, interactively, the dotsecenv shell plugin exports it on `cd` and there
 * is nothing to pass at all.
 */
export declare function resolveConnectionString(options: ResolvedOptions, log: Logger): Promise<Connection>;

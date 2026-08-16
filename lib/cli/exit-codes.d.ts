/**
 * Exit codes are part of the CLI's contract: scripts branch on them, so they
 * distinguish "the lock is held by someone else" from "something broke".
 *
 * `mutex lock <id> -- <program>` is the exception - once the program starts,
 * its own exit status is passed through, exactly like flock.
 */
export declare const EXIT_OK = 0;
export declare const EXIT_ERROR = 1;
export declare const EXIT_USAGE = 2;
export declare const EXIT_CONFIGURATION = 3;
/** Could not acquire the lock, or it is not held (status/renew). */
export declare const EXIT_UNAVAILABLE = 4;
/** Refused: another owner holds the lock, and the caller did not name them. */
export declare const EXIT_REFUSED = 5;
/** The wrapped program exists but could not be run - not executable, or a
 *  directory. The shell convention. */
export declare const EXIT_NOT_EXECUTABLE = 126;
/** The wrapped program was not found. Also the shell convention. */
export declare const EXIT_NO_PROGRAM = 127;
/** Raised for anything the user can fix by changing the command line. */
export declare class UsageError extends Error {
    constructor(message: string);
}
/** Raised when the connection string cannot be worked out. */
export declare class ConfigurationError extends Error {
    readonly hint: string | null;
    constructor(message: string, hint?: string);
}

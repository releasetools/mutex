/**
 * How the lock durations relate to each other.
 *
 * Shared by the Action's inputs and the CLI's flags, which express the same
 * three numbers and used to derive them separately - so a change to one could
 * silently leave the other behind.
 */
export declare const DEFAULT_EXPIRATION_SECONDS = 60;
export declare const DEFAULT_POLL_INTERVAL_SECONDS = 10;
/** "Wait as long as the lease would have lasted." */
export declare const WAIT_FOR_THE_LEASE = -1;
export declare const DEFAULT_MAX_WAIT_SECONDS = -1;
/** A whole number of seconds, or the fallback for anything else. */
export declare function seconds(value: number, fallback: number): number;
/**
 * How long to keep trying, in milliseconds.
 *
 * `maxWait` of -1 - the default - means "for as long as this lock would have
 * lasted", which is the most useful thing to do when nobody says otherwise:
 * waiting longer than the lease you are about to take is rarely what you want.
 */
export declare function pollTimeoutMs(expiration: number, maxWait: number): number;
/** How long to wait between attempts, in milliseconds. */
export declare function pollIntervalMs(pollInterval: number): number;

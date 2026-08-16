import { LockRecord } from "../mutex.js";
/**
 * Command results.
 *
 * Two streams, because the two kinds of output serve different readers:
 *
 * - Acting commands (`lock`, `unlock`) report to **stderr**. What they produce
 *   is a status report, not data, and keeping it off stdout means the same
 *   command behaves identically whether or not it is wrapping a program.
 * - Querying commands (`status`, `list`, `prune`) write to **stdout**, so
 *   `mutex list > locks.txt` captures what it should.
 * - `--json` always goes to stdout - that is the machine-readable channel -
 *   except while wrapping a program, which owns stdout outright.
 */
export declare class Output {
    private readonly humanStream;
    private readonly jsonStream;
    private readonly json;
    /**
     * Suppresses the human rendering, leaving the exit code to speak. What
     * `if mutex status deploy --quiet; then` relies on. `--json` is unaffected:
     * asking for machine-readable output and then silencing it is not a
     * combination worth honouring.
     */
    private readonly quiet;
    constructor(humanStream: NodeJS.WritableStream, jsonStream: NodeJS.WritableStream, json: boolean, 
    /**
     * Suppresses the human rendering, leaving the exit code to speak. What
     * `if mutex status deploy --quiet; then` relies on. `--json` is unaffected:
     * asking for machine-readable output and then silencing it is not a
     * combination worth honouring.
     */
    quiet?: boolean);
    /** The ordinary outcome. Silenced by `--quiet`, which the exit code covers. */
    result(payload: unknown, human: string | string[]): void;
    /**
     * An outcome that is not what was asked for: a lock not acquired, a release
     * refused, a renewal declined.
     *
     * Printed even under `--quiet`, and always to stderr. Quiet means "do not
     * narrate the ordinary", not "say nothing when something is wrong" - and
     * these are the cases where the exit code alone leaves someone guessing
     * which of several reasons applied.
     */
    problem(payload: unknown, human: string | string[]): void;
    private write;
}
/**
 * Explains an operation refused because the two owners are not the same, and
 * says exactly what to pass to go ahead anyway.
 *
 * Naming the holder is the confirmation: there is no flag that means "do it
 * regardless", so breaking a lock is always a deliberate statement of whose.
 */
export declare function describeOwnerMismatch(identifier: string, held: string | null | undefined, caller: string | null, verb: string): string;
/**
 * The headline plus stats printed when a lock is taken or extended: the id
 * matters most when it was generated, and the expiry is what the caller has to
 * plan around.
 */
export declare function describeLockAction(verb: string, record: LockRecord | undefined, fallbackId: string): string[];
export declare function describeRecord(record: LockRecord): string[];
/** A one-line summary, used by `mutex list` and by contention messages. */
export declare function summarizeRecord(record: LockRecord): string;

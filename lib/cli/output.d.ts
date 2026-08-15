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
    constructor(humanStream: NodeJS.WritableStream, jsonStream: NodeJS.WritableStream, json: boolean);
    result(payload: unknown, human: string | string[]): void;
}
/** Renders an owner for a message, including the unowned case. */
export declare function describeOwner(owner: string | null | undefined): string;
/** Explains an operation refused because the two owners are not the same. */
export declare function describeOwnerMismatch(identifier: string, held: string | null | undefined, caller: string | null, remedy: string): string;
/**
 * The headline plus stats printed when a lock is taken or extended: the id
 * matters most when it was generated, and the expiry is what the caller has to
 * plan around.
 */
export declare function describeLockAction(verb: string, record: LockRecord | undefined, fallbackId: string): string[];
export declare function describeRecord(record: LockRecord): string[];
export declare function describeExpiry(record: LockRecord): string;
/** A one-line summary, used by `mutex list` and by contention messages. */
export declare function summarizeRecord(record: LockRecord): string;
export declare function formatDuration(ms: number): string;

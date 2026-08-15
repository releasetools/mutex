/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

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
export class Output {
  constructor(
    private readonly humanStream: NodeJS.WritableStream,
    private readonly jsonStream: NodeJS.WritableStream,
    private readonly json: boolean,
    /**
     * Suppresses the human rendering, leaving the exit code to speak. What
     * `if mutex status deploy --quiet; then` relies on. `--json` is unaffected:
     * asking for machine-readable output and then silencing it is not a
     * combination worth honouring.
     */
    private readonly quiet = false,
  ) {}

  result(payload: unknown, human: string | string[]): void {
    if (this.json) {
      this.jsonStream.write(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    if (this.quiet) {
      return;
    }

    for (const line of Array.isArray(human) ? human : [human]) {
      this.humanStream.write(`${line}\n`);
    }
  }
}

/**
 * Explains an operation refused because the two owners are not the same, and
 * says exactly what to pass to go ahead anyway.
 *
 * Naming the holder is the confirmation: there is no flag that means "do it
 * regardless", so breaking a lock is always a deliberate statement of whose.
 */
export function describeOwnerMismatch(
  identifier: string,
  held: string | null | undefined,
  caller: string | null,
  verb: string,
): string {
  const lock = held ? `is held by '${held}'` : "is unowned";
  const call = caller ? `this call is '${caller}'` : "this call is unowned";
  const remedy = held
    ? `Pass --owner '${held}' to ${verb} it.`
    : `Retry without --owner to ${verb} it.`;
  return `'${identifier}' ${lock}; ${call}. ${remedy}`;
}

/**
 * The headline plus stats printed when a lock is taken or extended: the id
 * matters most when it was generated, and the expiry is what the caller has to
 * plan around.
 */
export function describeLockAction(
  verb: string,
  record: LockRecord | undefined,
  fallbackId: string,
): string[] {
  if (!record) {
    return [`${verb} lock '${fallbackId}'`];
  }

  return [
    `${verb} lock '${record.id}'`,
    `  owner:   ${record.owner ?? "(none)"}`,
    `  reason:  ${record.reason || "(none)"}`,
    `  created: ${record.createdAt ?? "(unknown)"}`,
    `  expires: ${describeExpiry(record)}`,
  ];
}

export function describeRecord(record: LockRecord): string[] {
  return [
    `id:      ${record.id}`,
    `state:   ${record.expired ? "expired" : "held"}`,
    `owner:   ${record.owner ?? "(none)"}`,
    `reason:  ${record.reason || "(none)"}`,
    `created: ${record.createdAt ?? "(unknown)"}`,
    `expires: ${describeExpiry(record)}`,
  ];
}

function describeExpiry(record: LockRecord): string {
  if (!record.expiresAt) {
    return "(never)";
  }

  const remaining = Date.parse(record.expiresAt) - Date.now();
  if (Number.isNaN(remaining)) {
    return record.expiresAt;
  }

  return remaining >= 0
    ? `${record.expiresAt} (in ${formatDuration(remaining)})`
    : `${record.expiresAt} (${formatDuration(-remaining)} ago)`;
}

/** A one-line summary, used by `mutex list` and by contention messages. */
export function summarizeRecord(record: LockRecord): string {
  const owner = record.owner ?? "-";
  const state = record.expired ? "expired" : "held";
  const reason = record.reason ? ` "${record.reason}"` : "";
  return `${record.id}\t${state}\t${owner}\t${record.expiresAt ?? "-"}${reason}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

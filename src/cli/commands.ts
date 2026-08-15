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

import os from "node:os";
import { spawn } from "node:child_process";
import { DatabaseMutex } from "../database.js";
import { logWarning } from "../helpers.js";
import { Logger } from "../logger.js";
import {
  LockRecord,
  LockRequest,
  LockResult,
  tryLock,
  tryUnlock,
} from "../mutex.js";
import { ResolvedOptions } from "./args.js";
import {
  EXIT_ERROR,
  EXIT_NO_PROGRAM,
  EXIT_OK,
  EXIT_REFUSED,
  EXIT_UNAVAILABLE,
} from "./exit-codes.js";
import {
  describeLockAction,
  describeOwnerMismatch,
  describeRecord,
  Output,
  summarizeRecord,
} from "./output.js";

export interface CommandContext {
  mutex: DatabaseMutex;
  options: ResolvedOptions;
  log: Logger;
  out: Output;
}

const SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

/**
 * `mutex lock` and `mutex try-lock`, which differ only in how long they wait -
 * `parseCommandLine` has already zeroed the timeout for `try-lock`.
 *
 * With a program after `--`, the lock is held for exactly as long as that
 * program runs and is released on every exit path.
 */
export async function commandLock(
  ctx: CommandContext,
  identifier: string,
  program: string[],
): Promise<number> {
  const result = await tryLock(
    requestFor(ctx, identifier),
    ctx.mutex,
    ctx.log,
    {
      onContended: (contended) => {
        if (contended.record) {
          ctx.log.info(`  ${summarizeRecord(contended.record)}`);
        }
      },
    },
  );

  if (!result.acquired) {
    ctx.out.result(
      {
        command: "lock",
        ok: false,
        id: identifier,
        status: result.status,
        holder: result.record ?? null,
      },
      [
        `Could not acquire '${identifier}': ${result.status}`,
        ...(result.record ? describeRecord(result.record) : []),
      ],
    );
    return EXIT_UNAVAILABLE;
  }

  if (program.length === 0) {
    ctx.out.result(
      {
        command: "lock",
        ok: true,
        id: identifier,
        owner: ctx.options.owner,
        expires: result.expires ?? null,
        lock: result.record ?? null,
      },
      describeLockAction("Acquired", result.record, identifier),
    );
    return EXIT_OK;
  }

  return runProgram(ctx, identifier, program, result);
}

/** `mutex unlock`. */
export async function commandUnlock(
  ctx: CommandContext,
  identifier: string,
): Promise<number> {
  const result = await tryUnlock(
    requestFor(ctx, identifier),
    ctx.mutex,
    ctx.log,
  );

  if (result.outcome === "owned-by-another") {
    ctx.out.result(
      {
        command: "unlock",
        ok: false,
        id: identifier,
        outcome: result.outcome,
        holder: result.record ?? null,
      },
      describeOwnerMismatch(
        identifier,
        result.record?.owner,
        ctx.options.owner,
        "unlock",
      ),
    );
    return EXIT_REFUSED;
  }

  if (!result.unlocked) {
    ctx.out.result(
      { command: "unlock", ok: false, id: identifier, outcome: result.outcome },
      `Could not unlock '${identifier}' (${result.outcome}).`,
    );
    return EXIT_ERROR;
  }

  ctx.out.result(
    {
      command: "unlock",
      ok: true,
      id: identifier,
      outcome: result.outcome,
      lock: result.record ?? null,
    },
    result.outcome === "not-found"
      ? `'${identifier}' was not held; nothing to unlock.`
      : `Unlocked '${identifier}'.`,
  );
  return EXIT_OK;
}

/**
 * `mutex renew`: extend a lock this owner already holds.
 *
 * Never takes a lock. If the id is not held, or is held by somebody else, or
 * has expired, that is a failure - the caller has lost the lock and needs to
 * know, not to silently acquire a new one.
 */
export async function commandRenew(
  ctx: CommandContext,
  identifier: string,
): Promise<number> {
  const result = await ctx.mutex.renewLock(
    identifier,
    ctx.options.expiration,
    ctx.options.owner,
  );

  if (result.renewed) {
    ctx.out.result(
      {
        command: "renew",
        ok: true,
        id: identifier,
        owner: ctx.options.owner,
        extended: result.extended !== false,
        expires: result.record?.expiresAt ?? null,
        lock: result.record ?? null,
      },
      describeLockAction(
        result.extended === false ? "Kept" : "Renewed",
        result.record,
        identifier,
      ),
    );
    return EXIT_OK;
  }

  const explanation: Record<string, string> = {
    "not-found": `'${identifier}' is not held, so there is nothing to renew.`,
    "owned-by-another": describeOwnerMismatch(
      identifier,
      result.record?.owner,
      ctx.options.owner,
      "renew",
    ),
    expired: `'${identifier}' expired at ${result.record?.expiresAt}; it may already have been taken over.`,
    contended: `'${identifier}' is being changed by another process; try again.`,
  };

  ctx.out.result(
    {
      command: "renew",
      ok: false,
      id: identifier,
      owner: ctx.options.owner,
      outcome: result.outcome,
      lock: result.record ?? null,
    },
    explanation[result.outcome] ?? `Could not renew '${identifier}'.`,
  );

  if (result.outcome === "owned-by-another") {
    return EXIT_REFUSED;
  }
  return result.outcome === "contended" ? EXIT_ERROR : EXIT_UNAVAILABLE;
}

/** `mutex status`: exit 0 while the lock is held, 4 once it is free. */
export async function commandStatus(
  ctx: CommandContext,
  identifier: string,
): Promise<number> {
  const record = await ctx.mutex.inspectLock(identifier);

  if (!record) {
    ctx.out.result(
      { command: "status", id: identifier, held: false, lock: null },
      `'${identifier}' is not held.`,
    );
    return EXIT_UNAVAILABLE;
  }

  ctx.out.result(
    { command: "status", id: identifier, held: !record.expired, lock: record },
    describeRecord(record),
  );
  return record.expired ? EXIT_UNAVAILABLE : EXIT_OK;
}

/** `mutex list`. */
export async function commandList(ctx: CommandContext): Promise<number> {
  const records = await ctx.mutex.listLocks();

  ctx.out.result({ command: "list", count: records.length, locks: records }, [
    ...(records.length === 0 ? ["No locks."] : renderTable(records)),
  ]);
  return EXIT_OK;
}

/** `mutex prune`. */
export async function commandPrune(ctx: CommandContext): Promise<number> {
  const removed = await ctx.mutex.pruneExpired(ctx.options.dryRun);
  const verb = ctx.options.dryRun ? "Would delete" : "Deleted";

  ctx.out.result(
    {
      command: "prune",
      dryRun: ctx.options.dryRun,
      count: removed.length,
      locks: removed,
    },
    removed.length === 0
      ? "No expired locks."
      : [`${verb} ${removed.length} expired lock(s):`, ...renderTable(removed)],
  );
  return EXIT_OK;
}

function requestFor(ctx: CommandContext, identifier: string): LockRequest {
  return {
    identifier,
    reason: ctx.options.reason,
    pollTimeoutMs: ctx.options.pollTimeoutMs,
    pollIntervalMs: ctx.options.pollIntervalMs,
    owner: ctx.options.owner,
  };
}

async function runProgram(
  ctx: CommandContext,
  identifier: string,
  program: string[],
  lock: LockResult,
): Promise<number> {
  ctx.out.result(
    {
      command: "lock",
      ok: true,
      id: identifier,
      owner: ctx.options.owner,
      expires: lock.expires ?? null,
      program,
    },
    [
      ...describeLockAction("Acquired", lock.record, identifier),
      `  running: ${program.join(" ")}`,
    ],
  );

  const renewal = ctx.options.autoRenew ? startRenewal(ctx, identifier) : null;

  try {
    return await spawnProgram(program);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      ctx.log.error(`${program[0]}: command not found`);
      return EXIT_NO_PROGRAM;
    }
    throw error;
  } finally {
    renewal?.stop();
    // The lock must go back even when the program crashed, so a failure here
    // is reported rather than thrown - it must not mask the program's status.
    await unlockQuietly(ctx, identifier);
  }
}

/**
 * Keeps the lock alive for as long as the wrapped program runs.
 *
 * Without this the promise `mutex lock <id> -- <program>` makes would be false:
 * a program outliving `--expiration` would carry on with a lapsed lock while
 * somebody else picked it up.
 */
function startRenewal(
  ctx: CommandContext,
  identifier: string,
): { stop(): void } {
  // A third of the lease, so a renewal can fail twice before the lock lapses.
  const intervalMs = Math.max(
    Math.floor((ctx.options.expiration * 1000) / 3),
    1000,
  );

  let inFlight = false;
  const timer = setInterval(() => {
    if (inFlight) {
      return;
    }
    inFlight = true;

    ctx.mutex
      .renewLock(identifier, ctx.options.expiration, ctx.options.owner)
      .then((result) => {
        if (result.renewed) {
          ctx.log.debug(`Renewed '${identifier}'.`);
        } else {
          ctx.log.warning(
            `Could not renew '${identifier}' (${result.outcome}); it may lapse before the program finishes.`,
          );
        }
      })
      .catch((error) =>
        logWarning(ctx.log, error, `Could not renew '${identifier}'`),
      )
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);

  return { stop: () => clearInterval(timer) };
}

async function unlockQuietly(
  ctx: CommandContext,
  identifier: string,
): Promise<void> {
  try {
    const result = await ctx.mutex.releaseLock(identifier, ctx.options.owner);

    if (result.unlocked) {
      ctx.log.info(`Unlocked '${identifier}'.`);
    } else {
      ctx.log.warning(`Could not unlock '${identifier}' (${result.outcome}).`);
    }
  } catch (error) {
    logWarning(ctx.log, error, `Could not unlock '${identifier}'`);
  }
}

/**
 * Runs the program with our own stdio, and forwards the signals that would
 * otherwise kill mutex without giving it a chance to release the lock.
 *
 * Running what the caller asked for is the whole point of the `--` form, the
 * same contract flock has, so the program name being caller-controlled is the
 * feature rather than a flaw. What matters is that it stays a plain execve:
 * never a shell, and arguments passed as an array, so nothing in them can be
 * reinterpreted as syntax.
 */
function spawnProgram(program: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!program[0]) {
      reject(Object.assign(new Error("no program to run"), { code: "ENOENT" }));
      return;
    }

    const child = spawn(program[0], program.slice(1), {
      stdio: "inherit",
      shell: false,
    });

    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    for (const signal of SIGNALS) {
      process.on(signal, forward);
    }
    const stopForwarding = () => {
      for (const signal of SIGNALS) {
        process.removeListener(signal, forward);
      }
    };

    child.on("error", (error) => {
      stopForwarding();
      reject(error);
    });

    child.on("close", (code, signal) => {
      stopForwarding();
      if (signal) {
        // The shell convention for "killed by a signal".
        resolve(128 + (os.constants.signals[signal] ?? 0));
        return;
      }
      resolve(code ?? 0);
    });
  });
}

function renderTable(records: LockRecord[]): string[] {
  const rows = [
    ["ID", "STATE", "OWNER", "EXPIRES", "REASON"],
    ...records.map((record) => [
      record.id,
      record.expired ? "expired" : "held",
      record.owner ?? "-",
      record.expiresAt ?? "-",
      record.reason || "-",
    ]),
  ];

  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length)),
  );

  return rows.map((row) =>
    row
      .map((cell, column) =>
        column === row.length - 1 ? cell : cell.padEnd(widths[column]),
      )
      .join("  "),
  );
}

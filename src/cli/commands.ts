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
import { ChildProcess, spawn } from "node:child_process";
import { describeError, logWarning } from "../helpers.js";
import { Logger } from "../logger.js";
import {
  LockRecord,
  LockRequest,
  LockResult,
  LockStore,
  tryLock,
  tryUnlock,
} from "../mutex.js";
import { ResolvedOptions } from "./args.js";
import {
  EXIT_ERROR,
  EXIT_NO_PROGRAM,
  EXIT_NOT_EXECUTABLE,
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
  mutex: LockStore;
  options: ResolvedOptions;
  log: Logger;
  out: Output;
}

const SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

/**
 * How long the post-program release keeps trying.
 *
 * A `contended` release right after a wrapped program is almost always this
 * job's own background renewal still inside its transaction, which clears in
 * milliseconds - so a brief retry is worth far more than a report. Short,
 * because this runs between the program exiting and mutex exiting.
 */
const CLEANUP_TIMEOUT_MS = 5_000;
const CLEANUP_INTERVAL_MS = 250;

/** Interrupts during the release before mutex stops waiting and gives up. */
const IMPATIENT_SIGNALS = 3;

/**
 * Floor for the background renewal.
 *
 * Low on purpose. At the previous 1000 ms, a one-second lease renewed at the
 * exact moment it expired - a coin flip on whether the lock survived - which
 * quietly defeated renewal for the shortest leases instead of protecting them.
 */
const MIN_RENEWAL_INTERVAL_MS = 250;

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
  command: "lock" | "try-lock" = "lock",
): Promise<number> {
  const result = await tryLock(
    requestFor(ctx, identifier, command),
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
    ctx.out.problem(
      {
        command,
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
        command,
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

  return runProgram(ctx, identifier, program, result, command);
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
    ctx.out.problem(
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
    ctx.out.problem(
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

  ctx.out.problem(
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

/**
 * `mutex list`, narrowed to one owner when the caller names one.
 *
 * Holding nothing is an answer rather than a failure, so an empty list still
 * exits 0 - and says whose locks it looked for, since "no locks" and "none of
 * yours" are different things to read off a screen.
 */
export async function commandList(ctx: CommandContext): Promise<number> {
  const owner = ctx.options.owner;
  const records = await ctx.mutex.listLocks(owner);

  ctx.out.result(
    { command: "list", owner, count: records.length, locks: records },
    records.length === 0
      ? owner
        ? `No locks owned by '${owner}'.`
        : "No locks."
      : renderTable(records),
  );
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

function requestFor(
  ctx: CommandContext,
  identifier: string,
  operation?: "lock" | "try-lock",
): LockRequest {
  return {
    identifier,
    reason: ctx.options.reason,
    pollTimeoutMs: ctx.options.pollTimeoutMs,
    pollIntervalMs: ctx.options.pollIntervalMs,
    owner: ctx.options.owner,
    expiration: ctx.options.expiration,
    operation,
  };
}

async function runProgram(
  ctx: CommandContext,
  identifier: string,
  program: string[],
  lock: LockResult,
  command: "lock" | "try-lock",
): Promise<number> {
  ctx.out.result(
    {
      command,
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
  const signals = relaySignals(ctx.log, identifier);

  try {
    return await spawnProgram(program, signals);
  } catch (error) {
    // Shell convention, which scripts branch on: 127 is "no such command",
    // 126 is "there it is, but I cannot run it". Collapsing the second into a
    // generic failure makes it indistinguishable from mutex itself breaking.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      ctx.log.error(`${program[0]}: command not found`);
      return EXIT_NO_PROGRAM;
    }
    if (code === "EACCES" || code === "EPERM" || code === "EISDIR") {
      ctx.log.error(`${program[0]}: not executable`);
      return EXIT_NOT_EXECUTABLE;
    }
    throw error;
  } finally {
    renewal?.stop();
    // Signals stay handled across the release, so an impatient second Ctrl-C
    // cannot kill mutex between the program exiting and the lock going back.
    signals.enterRelease();
    try {
      // The lock must go back even when the program crashed, so a failure here
      // is reported rather than thrown - it must not mask the program's status.
      await unlockQuietly(ctx, identifier, lock.record?.createdAt ?? null);
    } finally {
      signals.dispose();
    }
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
  // The floor is only there to stop a pathological zero becoming a busy loop;
  // it must stay well under the shortest usable lease, or it would schedule
  // the renewal at or after the expiry it exists to prevent.
  const intervalMs = Math.max(
    Math.floor((ctx.options.expiration * 1000) / 3),
    MIN_RENEWAL_INTERVAL_MS,
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

/**
 * Releases the lock once a wrapped program has finished.
 *
 * Never throws - the program's exit status is what the caller asked for, and a
 * cleanup problem must not replace it. But it is reported at error level, not
 * warning: `--quiet` lowers the threshold to errors, and "the lock is still
 * held" is precisely what someone running quietly still needs to be told.
 */
async function unlockQuietly(
  ctx: CommandContext,
  identifier: string,
  fence: string | null,
): Promise<void> {
  const stranded = (detail: string) => {
    const owner = ctx.options.owner ? ` --owner '${ctx.options.owner}'` : "";
    ctx.log.error(
      `${detail}\n` +
        `  '${identifier}' stays held until it expires. Release it with:\n` +
        `    mutex unlock ${identifier}${owner}`,
    );
  };

  try {
    const result = await tryUnlock(
      {
        ...requestFor(ctx, identifier),
        pollTimeoutMs: CLEANUP_TIMEOUT_MS,
        pollIntervalMs: CLEANUP_INTERVAL_MS,
        fence,
      },
      ctx.mutex,
      ctx.log,
    );

    if (result.unlocked) {
      ctx.log.info(`Unlocked '${identifier}'.`);
      return;
    }

    if (result.outcome === "superseded") {
      // Not stranded: the lease lapsed, somebody else holds it now, and
      // deleting theirs would be the worse outcome by far.
      ctx.log.error(
        `'${identifier}' expired while the program ran and has been taken by somebody else; left alone.`,
      );
      return;
    }

    stranded(`Could not unlock '${identifier}' (${result.outcome}).`);
  } catch (error) {
    stranded(`Could not unlock '${identifier}': ${describeError(error)}`);
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
/**
 * Keeps SIGINT/SIGTERM/SIGHUP handled for the whole of the wrapper's life, not
 * just while the program runs.
 *
 * While there is a child, signals go to it. Once it has gone and the lock is
 * being handed back, they are absorbed instead - because removing the last
 * SIGINT listener restores Node's kill-immediately default, and a release is a
 * database round-trip, so a second impatient Ctrl-C in that window would kill
 * mutex with the lock still held. Three of them and it gives up anyway; a tool
 * that cannot be interrupted is its own kind of broken.
 */
function relaySignals(log: Logger, identifier: string) {
  let child: ChildProcess | null = null;
  let releasing = false;
  let nudges = 0;

  const handler = (signal: NodeJS.Signals) => {
    if (child) {
      child.kill(signal);
      return;
    }

    if (!releasing) {
      return;
    }

    nudges++;
    if (nudges >= IMPATIENT_SIGNALS) {
      log.error(
        `Abandoning the release: '${identifier}' stays held until it expires.`,
      );
      dispose();
      process.exit(128 + (os.constants.signals[signal] ?? 0));
    }

    log.warning(
      `Releasing '${identifier}' - one moment. Interrupt ${IMPATIENT_SIGNALS - nudges} more time(s) to abandon it.`,
    );
  };

  const dispose = () => {
    for (const signal of SIGNALS) {
      process.removeListener(signal, handler);
    }
  };

  for (const signal of SIGNALS) {
    process.on(signal, handler);
  }

  return {
    attach: (started: ChildProcess) => {
      child = started;
    },
    /** The child has gone; from here signals mean "wait, I am cleaning up". */
    enterRelease: () => {
      child = null;
      releasing = true;
    },
    dispose,
  };
}

function spawnProgram(
  program: string[],
  signals: ReturnType<typeof relaySignals>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!program[0]) {
      reject(Object.assign(new Error("no program to run"), { code: "ENOENT" }));
      return;
    }

    const child = spawn(program[0], program.slice(1), {
      stdio: "inherit",
      shell: false,
    });
    signals.attach(child);

    child.on("error", (error) => reject(error));

    child.on("close", (code, signal) => {
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

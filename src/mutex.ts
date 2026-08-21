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

import { Logger } from "./logger.js";
import { sleep } from "./helpers.js";
import { SslNegotiation } from "./connection.js";

/**
 * The two mutex operations, shared by the GitHub Action and the CLI.
 *
 * The CLI commands map onto them directly:
 *   mutex lock      -> tryLock (polls until `max-wait` elapses)
 *   mutex try-lock  -> tryLock with a zero timeout (a single attempt)
 *   mutex unlock    -> tryUnlock
 *
 * `mutex renew` is not here: extending a lock is a single UPDATE with nothing
 * to poll for, so it goes straight to `DatabaseMutex.renewLock`.
 *
 * Nothing here imports the Actions toolkit: callers supply a `Logger` for
 * output and `LockEvents` for whatever side effects they need.
 */

/**
 * Floor for the delay between attempts. A `poll-interval` of 0 would otherwise
 * turn the wait loop into a hot loop hammering Postgres.
 */
const MIN_POLL_INTERVAL_MS = 100;

/** A row of the lock table, with timestamps normalised to ISO-8601 UTC. */
export interface LockRecord {
  id: string;
  reason: string | null;
  owner: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  expired: boolean;
}

export type LockResult = {
  acquired: boolean;
  status: string;
  expires?: string;
  /** The row we wrote, or - when contended - the row standing in the way. */
  record?: LockRecord;
};

export type UnlockOutcome =
  | "unlocked"
  | "not-found"
  | "owned-by-another"
  /** The id is held, but by a later acquisition than the caller's. */
  | "superseded"
  | "contended";

export type UnlockResult = {
  unlocked: boolean;
  outcome: UnlockOutcome;
  record?: LockRecord;
};

/**
 * Everything `tryLock`/`tryUnlock` need about a request. Both `MutexSettings`
 * (the Action) and the CLI's resolved options satisfy this structurally.
 */
export interface LockRequest {
  identifier: string;
  reason: string;
  pollTimeoutMs: number;
  pollIntervalMs: number;
  owner?: string | null;
  /** Lease length for this acquisition. Store clients may share one process. */
  expiration?: number;
  /** Preserves the CLI spelling in server operation logs. */
  operation?: "lock" | "try-lock";
  /**
   * `created_at` of the acquisition being released, if the caller has one.
   *
   * A lock that lapsed and was taken over is a different holding under the
   * same name; `created_at` is reset on takeover and never otherwise, so it
   * distinguishes them. Supplying it makes a release refuse to delete
   * somebody else's lock even when ownership cannot tell them apart.
   */
  fence?: string | null;
}

/** Connection details needed to talk to the lock store. */
export interface MutexConfig {
  dbConnectionString: string;
  /** Default used by the Action and older callers that do not pass a lease. */
  expiration?: number;
  /** Optional pool connection deadline, primarily for the long-lived server. */
  connectionTimeoutMillis?: number;
  /**
   * How the TLS handshake starts, when a profile says. Overrides
   * `sslnegotiation` in the connection string.
   */
  sslNegotiation?: SslNegotiation;
  /**
   * Lower bound on pooled connections.
   *
   * node-postgres closes a connection ten seconds after it goes idle, and its
   * default floor is zero, so a process that is asked for a lock now and again
   * pays a fresh handshake for most of them. The server sets 1 to keep one
   * open; a CLI process has exited long before the timeout matters.
   */
  minPoolSize?: number;
  /**
   * Start TLS directly when the connection has it and nothing said otherwise.
   *
   * Set by the server, which can afford the one failed connection a server
   * older than 17 costs; a CLI command would pay it every time and has no
   * later connection to spend the saving on.
   */
  preferDirectSsl?: boolean;
}

export interface MutexInterface {
  acquireLock(
    name: string,
    reason: string,
    owner?: string | null,
    expiration?: number,
    operation?: "lock" | "try-lock",
  ): Promise<LockResult>;
  releaseLock(
    name: string,
    owner?: string | null,
    fence?: string | null,
  ): Promise<UnlockResult>;
}

export type RenewOutcome =
  "renewed" | "not-found" | "owned-by-another" | "expired" | "contended";

export type RenewResult = {
  renewed: boolean;
  outcome: RenewOutcome;
  /** False when the lock already ran later than the requested expiry. */
  extended?: boolean;
  record?: LockRecord;
};

/** Every primitive operation used by the CLI, independent of its transport. */
export interface LockStore extends MutexInterface {
  renewLock(
    name: string,
    expiration: number,
    owner?: string | null,
  ): Promise<RenewResult>;
  inspectLock(name: string): Promise<LockRecord | null>;
  listLocks(owner?: string | null): Promise<LockRecord[]>;
  pruneExpired(dryRun?: boolean): Promise<LockRecord[]>;
  close(): Promise<void>;
}

/**
 * Side effects a caller wants attached to an outcome: the Action posts PR and
 * Slack notifications and records job state, the CLI prints a line.
 */
export interface LockEvents {
  onLocked?(result: LockResult): void | Promise<void>;
  onUnlocked?(result: UnlockResult): void | Promise<void>;
  /**
   * The lock is held by another owner. A separate event from onTimeout because
   * it is a decision rather than a deadline - but it still has to be reported,
   * or a caller that only handles success and timeout finishes green having
   * done nothing.
   */
  onRefused?(result: UnlockResult): void | Promise<void>;
  onContended?(result: LockResult, attempt: number): void | Promise<void>;
  onTimeout?(message: string): void | Promise<void>;
}

function pollIntervalFor(request: LockRequest): number {
  return request.pollIntervalMs > 0
    ? request.pollIntervalMs
    : MIN_POLL_INTERVAL_MS;
}

/**
 * The wait, in milliseconds, treating anything not a real number as zero.
 *
 * NaN arrives easily - `parseInt("")` on an unset workflow input - and every
 * comparison against it is false, which in a loop that breaks on a comparison
 * means it never breaks. Zero is the safe reading: try once, then give up.
 */
function pollTimeoutFor(request: LockRequest): number {
  return Number.isFinite(request.pollTimeoutMs)
    ? Math.max(request.pollTimeoutMs, 0)
    : 0;
}

/**
 * Acquire the lock, retrying until `pollTimeoutMs` elapses.
 *
 * Always makes at least one attempt, so a zero timeout means "try once" rather
 * than "do nothing" - that is what `mutex try-lock` relies on.
 */
export async function tryLock(
  request: LockRequest,
  mutex: MutexInterface,
  log: Logger,
  events: LockEvents = {},
): Promise<LockResult> {
  const timeoutMs = pollTimeoutFor(request);
  const intervalMs = pollIntervalFor(request);
  const deadline = Date.now() + timeoutMs;

  log.info(
    `Attempting to acquire lock '${request.identifier}'. Timeout: ${timeoutMs / 1000}s`,
  );

  let attempt = 0;
  let result: LockResult = { acquired: false, status: "No attempt was made" };

  for (;;) {
    attempt++;
    result = await mutex.acquireLock(
      request.identifier,
      request.reason,
      request.owner ?? null,
      request.expiration,
      request.operation,
    );

    if (result.acquired) {
      log.info(`Lock '${request.identifier}' acquired on attempt ${attempt}.`);
      await events.onLocked?.(result);
      return result;
    }

    // Stop once there is no room left for another attempt before the deadline,
    // rather than sleeping past it and reporting a stale failure.
    if (Date.now() + intervalMs >= deadline) {
      break;
    }

    await events.onContended?.(result, attempt);
    log.info(
      `Waiting for lock '${request.identifier}' (${result.status}). Retrying in ${intervalMs / 1000}s...`,
    );
    await sleep(intervalMs);
  }

  await events.onTimeout?.(
    `⌛ Timed out waiting for lock '${request.identifier}' after ${timeoutMs / 1000} seconds.`,
  );
  return result;
}

/**
 * Release the lock, retrying while the attempt is merely contended.
 *
 * Unlocking something that is not locked succeeds: unlock is idempotent. A
 * refusal (`owned-by-another`) is a decision rather than a transient failure,
 * so it short-circuits the retry loop.
 */
export async function tryUnlock(
  request: LockRequest,
  mutex: MutexInterface,
  log: Logger,
  events: LockEvents = {},
): Promise<UnlockResult> {
  const timeoutMs = pollTimeoutFor(request);
  const intervalMs = pollIntervalFor(request);
  const deadline = Date.now() + timeoutMs;
  log.info(`Attempting to unlock '${request.identifier}'.`);

  let result: UnlockResult = { unlocked: false, outcome: "contended" };

  for (;;) {
    result = await mutex.releaseLock(
      request.identifier,
      request.owner ?? null,
      request.fence ?? null,
    );

    if (
      result.unlocked ||
      result.outcome === "owned-by-another" ||
      result.outcome === "superseded"
    ) {
      break;
    }

    if (Date.now() + intervalMs >= deadline) {
      break;
    }

    log.info(
      `Could not unlock '${request.identifier}' yet (${result.outcome}). Retrying in ${intervalMs / 1000}s...`,
    );
    await sleep(intervalMs);
  }

  if (result.unlocked) {
    log.info(`Lock '${request.identifier}' released.`);
    await events.onUnlocked?.(result);
  } else if (
    result.outcome === "owned-by-another" ||
    result.outcome === "superseded"
  ) {
    const message =
      result.outcome === "superseded"
        ? `Refusing to unlock '${request.identifier}': it has since been taken by somebody else.`
        : `Refusing to unlock '${request.identifier}': it is held by another owner.`;
    log.warning(message);
    await (events.onRefused
      ? events.onRefused(result)
      : events.onTimeout?.(message));
  } else {
    await events.onTimeout?.(
      `⌛ Timed out waiting to unlock '${request.identifier}' after ${timeoutMs / 1000} seconds.`,
    );
  }

  return result;
}

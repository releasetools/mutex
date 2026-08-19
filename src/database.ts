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

import { Pool, PoolClient } from "pg";
import {
  LockRecord,
  LockResult,
  LockStore,
  MutexConfig,
  RenewResult,
  UnlockResult,
} from "./mutex.js";
import { TABLE_NAME } from "./constants.js";
import { Logger, SilentLogger } from "./logger.js";
import { describeError, logWarning, sleep } from "./helpers.js";
import {
  describePosture,
  explainSslFailure,
  resolveConnection,
  SslPosture,
} from "./connection.js";
import format from "pg-format";

/**
 * The columns every read returns.
 *
 * `created_at`/`expires_at` are `TIMESTAMP WITHOUT TIME ZONE` holding UTC wall
 * time. `AT TIME ZONE 'UTC'` re-labels them as `timestamptz`, so node-postgres
 * parses them into correct `Date`s no matter what time zone the client or the
 * database session happens to run in.
 */
function lockColumns(source = ""): string {
  const prefix = source ? `${source}.` : "";
  return `${prefix}id, ${prefix}reason, ${prefix}owner,
        ${prefix}created_at AT TIME ZONE 'UTC' AS created_at,
        ${prefix}expires_at AT TIME ZONE 'UTC' AS expires_at,
        (${prefix}expires_at IS NOT NULL AND ${prefix}expires_at < (NOW() AT TIME ZONE 'UTC')) AS expired`;
}

const LOCK_COLUMNS = lockColumns();

type MutationRow = Record<string, unknown> & { outcome: string };

export class DatabaseMutex implements LockStore {
  private readonly config: MutexConfig;
  private readonly log: Logger;
  private readonly pool: Pool;
  private readonly posture: SslPosture;
  private closed = false;
  /** Schema creation is tried at most once per instance. */
  private schemaAttempted = false;

  constructor(config: MutexConfig, log: Logger = new SilentLogger()) {
    this.config = config;
    this.log = log;

    // mutex decides what the connection string's sslmode means rather than
    // inheriting whichever meaning the installed node-postgres holds; see
    // `connection.ts`.
    const connection = resolveConnection(config.dbConnectionString);
    this.posture = connection.posture;
    for (const warning of connection.warnings) {
      log.warning(warning);
    }
    log.debug(`Database connection: ${describePosture(connection.posture)}.`);

    this.pool = new Pool({
      ...connection.config,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
    });

    // Without a listener, an error on an idle client is an unhandled 'error'
    // event and takes the whole process down.
    this.pool.on("error", (error) => {
      logWarning(this.log, error, "Idle database client error");
    });
  }

  async acquireLock(
    name: string,
    reason: string,
    owner: string | null = null,
    expiration = this.config.expiration ?? 60,
    _operation: "lock" | "try-lock" = "lock",
  ): Promise<LockResult> {
    return this.withSchemaRetry(`Acquiring lock '${name}'`, () =>
      this.acquireLockInternal(name, reason, owner, expiration),
    );
  }

  async releaseLock(
    name: string,
    owner: string | null = null,
    fence: string | null = null,
  ): Promise<UnlockResult> {
    return this.withSchemaRetry(`Releasing lock '${name}'`, () =>
      this.releaseLockInternal(name, owner, fence),
    );
  }

  /**
   * Extends a lock that `owner` currently holds.
   *
   * Strictly an UPDATE: it never inserts, so renewing something that is not
   * held fails rather than quietly taking a new lock. Both the id and the
   * owner have to match, and an expired lock is refused - by then somebody
   * else may already have taken it over.
   *
   * The new expiry is whichever is later, now + `expiration` or the expiry the
   * lock already had, so renewing can only ever buy more time. Asking for less
   * than the lock already has is a no-op rather than a silent shortening.
   */
  async renewLock(
    name: string,
    expiration: number,
    owner: string | null = null,
  ): Promise<RenewResult> {
    return this.withSchemaRetry(`Renewing lock '${name}'`, () =>
      this.renewLockInternal(name, expiration, owner),
    );
  }

  /** Returns the lock's current row, or null when nothing holds it. */
  async inspectLock(name: string): Promise<LockRecord | null> {
    return this.withSchemaRetry(`Inspecting lock '${name}'`, async () => {
      const result = await this.pool.query(
        format(`SELECT ${LOCK_COLUMNS} FROM %I WHERE id = $1;`, TABLE_NAME),
        [name],
      );
      return result.rows.length > 0 ? toLockRecord(result.rows[0]) : null;
    });
  }

  /** Returns every lock in the table, expired ones included. */
  async listLocks(): Promise<LockRecord[]> {
    return this.withSchemaRetry("Listing locks", async () => {
      const result = await this.pool.query(
        format(`SELECT ${LOCK_COLUMNS} FROM %I ORDER BY id;`, TABLE_NAME),
      );
      return result.rows.map(toLockRecord);
    });
  }

  /**
   * Deletes every expired lock. Expired rows are already dead - acquiring
   * overwrites them - so this is only housekeeping and needs no advisory lock.
   */
  async pruneExpired(dryRun = false): Promise<LockRecord[]> {
    return this.withSchemaRetry("Pruning expired locks", async () => {
      const predicate = `WHERE expires_at IS NOT NULL AND expires_at < (NOW() AT TIME ZONE 'UTC')`;
      const query = dryRun
        ? format(`SELECT ${LOCK_COLUMNS} FROM %I ${predicate};`, TABLE_NAME)
        : format(
            `DELETE FROM %I ${predicate} RETURNING ${LOCK_COLUMNS};`,
            TABLE_NAME,
          );

      const result = await this.pool.query(query);
      return result.rows.map(toLockRecord);
    });
  }

  /** Releases the connection pool. Required for a CLI process to exit. */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.pool.end();
  }

  /** Opens one connection during server startup so the first lock is warm. */
  async warm(): Promise<void> {
    const client = await this.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      this.disconnect(client);
    }
  }

  poolStatus(): { total: number; idle: number; waiting: number } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  private async acquireLockInternal(
    name: string,
    reason: string,
    owner: string | null,
    expiration: number,
  ): Promise<LockResult> {
    // A standalone statement is its own transaction. The gate takes a
    // transaction-scoped advisory lock before the upsert, and Postgres releases
    // it as the statement finishes. `existing` and `changed` share one snapshot;
    // RETURNING is how the data-modifying CTE communicates the row it wrote to
    // the final result.
    const query = format(
      `WITH gate AS (
        SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired
      ),
      existing AS (
        SELECT ${lockColumns("held")}
        FROM %I AS held
        CROSS JOIN gate
        WHERE gate.acquired AND held.id = $1
      ),
      changed AS (
        INSERT INTO %I AS locked (id, reason, owner, expires_at)
        SELECT
          $1,
          $2,
          $3,
          (NOW() AT TIME ZONE 'UTC') + ($4 || ' seconds')::INTERVAL
        FROM gate
        WHERE gate.acquired
        ON CONFLICT (id) DO UPDATE
        SET
          expires_at = EXCLUDED.expires_at,
          reason = EXCLUDED.reason,
          owner = EXCLUDED.owner,
          created_at = (NOW() AT TIME ZONE 'UTC')
        WHERE locked.expires_at < (NOW() AT TIME ZONE 'UTC')
        RETURNING ${lockColumns("locked")}
      )
      SELECT
        CASE
          WHEN NOT gate.acquired THEN 'contended'
          WHEN changed.id IS NOT NULL THEN 'acquired'
          ELSE 'held'
        END AS outcome,
        CASE WHEN changed.id IS NOT NULL THEN changed.id ELSE existing.id END AS id,
        CASE WHEN changed.id IS NOT NULL THEN changed.reason ELSE existing.reason END AS reason,
        CASE WHEN changed.id IS NOT NULL THEN changed.owner ELSE existing.owner END AS owner,
        CASE WHEN changed.id IS NOT NULL THEN changed.created_at ELSE existing.created_at END AS created_at,
        CASE WHEN changed.id IS NOT NULL THEN changed.expires_at ELSE existing.expires_at END AS expires_at,
        CASE WHEN changed.id IS NOT NULL THEN changed.expired ELSE existing.expired END AS expired
      FROM gate
      LEFT JOIN existing ON TRUE
      LEFT JOIN changed ON TRUE;`,
      TABLE_NAME,
      TABLE_NAME,
    );

    const row = await this.runMutation(name, query, [
      name,
      reason,
      owner,
      expiration,
    ]);

    if (row.outcome === "contended") {
      return {
        acquired: false,
        status: "Lock held by another transaction",
      };
    }

    if (row.outcome === "held") {
      this.log.info(`Lock for "${name}" exists and has not expired.`);
      return {
        acquired: false,
        status: "Lock taken by another process (try again later)",
        record: row.id == null ? undefined : toLockRecord(row),
      };
    }

    const record = toLockRecord(row);
    const approximate = new Date(Date.now() + expiration * 1000).toISOString();
    this.log.info(`Lock '${name}' acquired successfully.`);
    return {
      acquired: true,
      status: "Lock acquired",
      expires: record.expiresAt ?? `approximately ${approximate}`,
      record,
    };
  }

  private async releaseLockInternal(
    name: string,
    owner: string | null,
    fence: string | null,
  ): Promise<UnlockResult> {
    const query = format(
      `WITH gate AS (
        SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired
      ),
      existing AS (
        SELECT ${lockColumns("held")}
        FROM %I AS held
        CROSS JOIN gate
        WHERE gate.acquired AND held.id = $1
      ),
      deleted AS (
        DELETE FROM %I AS locked
        USING gate, existing
        WHERE gate.acquired
          AND locked.id = existing.id
          AND (existing.owner IS NULL OR existing.owner IS NOT DISTINCT FROM $2::text)
          AND (
            $3::text IS NULL
            OR to_char(
              existing.created_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ) = $3::text
          )
        RETURNING locked.id
      )
      SELECT
        CASE
          WHEN NOT gate.acquired THEN 'contended'
          WHEN existing.id IS NULL THEN 'not-found'
          WHEN NOT (existing.owner IS NULL OR existing.owner IS NOT DISTINCT FROM $2::text) THEN 'owned-by-another'
          WHEN $3::text IS NOT NULL
            AND to_char(
              existing.created_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ) <> $3::text THEN 'superseded'
          WHEN deleted.id IS NOT NULL THEN 'unlocked'
          ELSE 'not-found'
        END AS outcome,
        existing.id,
        existing.reason,
        existing.owner,
        existing.created_at,
        existing.expires_at,
        existing.expired
      FROM gate
      LEFT JOIN existing ON TRUE
      LEFT JOIN deleted ON TRUE;`,
      TABLE_NAME,
      TABLE_NAME,
    );

    const row = await this.runMutation(name, query, [name, owner, fence]);
    if (row.outcome === "contended") {
      return { unlocked: false, outcome: "contended" };
    }

    if (row.outcome === "not-found") {
      this.log.warning(
        `Lock '${name}' was not found. No release was necessary.`,
      );
      return { unlocked: true, outcome: "not-found" };
    }

    const record = toLockRecord(row);
    if (!mayModify(record, owner)) {
      return { unlocked: false, outcome: "owned-by-another", record };
    }
    if (fence !== null && record.createdAt !== fence) {
      return { unlocked: false, outcome: "superseded", record };
    }

    this.log.info(`Lock '${name}' released successfully.`);
    return { unlocked: true, outcome: "unlocked", record };
  }

  private async renewLockInternal(
    name: string,
    expiration: number,
    owner: string | null,
  ): Promise<RenewResult> {
    const query = format(
      `WITH gate AS (
        SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired
      ),
      existing AS (
        SELECT ${lockColumns("held")}
        FROM %I AS held
        CROSS JOIN gate
        WHERE gate.acquired AND held.id = $1
      ),
      renewed AS (
        UPDATE %I AS locked
        SET expires_at = GREATEST(
          (NOW() AT TIME ZONE 'UTC') + ($2 || ' seconds')::INTERVAL,
          locked.expires_at
        )
        FROM gate, existing
        WHERE gate.acquired
          AND locked.id = existing.id
          AND (existing.owner IS NULL OR existing.owner IS NOT DISTINCT FROM $3::text)
          AND NOT existing.expired
        RETURNING ${lockColumns("locked")}
      )
      SELECT
        CASE
          WHEN NOT gate.acquired THEN 'contended'
          WHEN existing.id IS NULL THEN 'not-found'
          WHEN NOT (existing.owner IS NULL OR existing.owner IS NOT DISTINCT FROM $3::text) THEN 'owned-by-another'
          WHEN existing.expired THEN 'expired'
          WHEN renewed.id IS NOT NULL THEN 'renewed'
          ELSE 'not-found'
        END AS outcome,
        CASE WHEN renewed.id IS NOT NULL THEN renewed.id ELSE existing.id END AS id,
        CASE WHEN renewed.id IS NOT NULL THEN renewed.reason ELSE existing.reason END AS reason,
        CASE WHEN renewed.id IS NOT NULL THEN renewed.owner ELSE existing.owner END AS owner,
        CASE WHEN renewed.id IS NOT NULL THEN renewed.created_at ELSE existing.created_at END AS created_at,
        CASE WHEN renewed.id IS NOT NULL THEN renewed.expires_at ELSE existing.expires_at END AS expires_at,
        CASE WHEN renewed.id IS NOT NULL THEN renewed.expired ELSE existing.expired END AS expired,
        CASE
          WHEN renewed.id IS NOT NULL THEN renewed.expires_at IS DISTINCT FROM existing.expires_at
          ELSE FALSE
        END AS extended
      FROM gate
      LEFT JOIN existing ON TRUE
      LEFT JOIN renewed ON TRUE;`,
      TABLE_NAME,
      TABLE_NAME,
    );

    const row = await this.runMutation(name, query, [name, expiration, owner]);
    if (row.outcome === "contended") {
      return { renewed: false, outcome: "contended" };
    }
    if (row.outcome === "not-found") {
      return { renewed: false, outcome: "not-found" };
    }

    const record = toLockRecord(row);
    if (!mayModify(record, owner)) {
      return { renewed: false, outcome: "owned-by-another", record };
    }
    if (record.expired) {
      return { renewed: false, outcome: "expired", record };
    }

    const extended = row.extended === true;
    this.log.info(
      extended
        ? `Lock '${name}' renewed for ${expiration}s.`
        : `Lock '${name}' already ran past ${expiration}s; left as it was.`,
    );
    return {
      renewed: true,
      outcome: "renewed",
      extended,
      record,
    };
  }

  /**
   * Runs one complete mutation statement, retrying it once when another
   * transaction briefly holds the advisory lock for this mutex id.
   */
  private async runMutation(
    name: string,
    query: string,
    values: unknown[],
  ): Promise<MutationRow> {
    let row = await this.queryMutation(query, values);
    if (row.outcome !== "contended") {
      return row;
    }

    this.log.debug(`Could not acquire advisory lock '${name}'.`);
    await sleep(1);
    row = await this.queryMutation(query, values);
    if (row.outcome === "contended") {
      this.log.debug(`Could not acquire advisory lock '${name}'.`);
    }
    return row;
  }

  private async queryMutation(
    query: string,
    values: unknown[],
  ): Promise<MutationRow> {
    const result = await this.pool.query(query, values);
    const row = result.rows[0] as MutationRow | undefined;
    if (!row || typeof row.outcome !== "string") {
      throw new Error(
        `Database mutation returned no outcome (rows=${result.rows.length})`,
      );
    }
    return row;
  }

  /**
   * Runs an operation and, if it fails, makes sure the schema exists before
   * trying once more - the usual cause is a database that has never seen this
   * action before.
   */
  private async withSchemaRetry<T>(
    operation: string,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.retryOnceForSchema(operation, run);
    } catch (error) {
      throw this.explained(error);
    }
  }

  /**
   * Adds what mutex knows about the connection to a handshake failure.
   *
   * TLS errors describe the certificate, never the setting that demanded one,
   * so the cause is invisible from the message alone.
   */
  private explained(error: unknown): unknown {
    const hint = explainSslFailure(error, this.posture);
    return hint
      ? new Error(`${describeError(error)}\n  ${hint}`, { cause: error })
      : error;
  }

  private async retryOnceForSchema<T>(
    operation: string,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      // Creating the table is a guess at the cause, worth making once. After
      // that the schema is not what is wrong, so later failures go straight
      // back to the caller instead of re-running DDL on every operation.
      if (this.schemaAttempted) {
        throw error;
      }
      this.schemaAttempted = true;

      // Expected the first time a database is used, so this is not worth a
      // warning: if the retry fails too, the original error is thrown.
      this.log.debug(
        `${operation} failed; ensuring the schema exists and retrying once: ${describeError(error)}`,
      );

      try {
        await this.initializeTable();
      } catch (schemaError) {
        // The original error is the more useful one, so it is what gets
        // thrown - but if the schema really was the problem and we could not
        // fix it, say so plainly and give the statement to run by hand.
        // Otherwise the only symptom is a missing column, and the actual
        // cause - no rights to add it - is invisible.
        if (isMissingSchema(error)) {
          this.log.error(
            `The ${TABLE_NAME} table is missing a column this version needs, and it could not be added: ${describeError(schemaError)}\n` +
              `  Ask someone with DDL rights to run:\n` +
              `    ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS owner TEXT;`,
          );
        }
        throw error;
      }

      return run();
    }
  }

  /**
   * Creates the lock table when missing, and adds the `owner` column to tables
   * created by earlier versions. Both statements are idempotent.
   */
  private async initializeTable(): Promise<void> {
    let client: PoolClient | undefined;
    try {
      client = await this.connect();

      await client.query(
        format(
          `CREATE TABLE IF NOT EXISTS %I (
            id VARCHAR(255) PRIMARY KEY,
            reason TEXT,
            owner TEXT,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL,
            expires_at TIMESTAMP WITHOUT TIME ZONE
          );`,
          TABLE_NAME,
        ),
      );
      await client.query(
        format(
          `ALTER TABLE %I ADD COLUMN IF NOT EXISTS owner TEXT;`,
          TABLE_NAME,
        ),
      );

      this.log.debug(`Table ${TABLE_NAME} is present and up to date.`);
    } catch (error) {
      // Reported by whoever asked for the schema; `withSchemaRetry` prefers to
      // surface the original failure instead.
      this.log.debug(
        `Could not create the table ${TABLE_NAME}: ${describeError(error)}`,
      );
      throw error;
    } finally {
      this.disconnect(client);
    }
  }

  private async connect(): Promise<PoolClient> {
    this.log.debug("Attempting to connect to the database.");
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw this.explained(error);
    }
    this.log.debug("Successfully connected to the database.");
    return client;
  }

  private disconnect(client: PoolClient | undefined): void {
    // Return the connection to the pool, whether an error occurred or not
    client?.release();
    if (client) {
      this.log.debug("Database connection released.");
    }
  }
}

/**
 * True when Postgres is telling us the table or a column is not there:
 * undefined_column (42703) or undefined_table (42P01).
 */
function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "42703" || code === "42P01";
}

/**
 * Who may unlock or renew a lock: its owner, or anyone at all when it has none.
 *
 * Ownership is what confers protection, so a lock nobody claimed is nobody's to
 * defend - which is also what lets either front end manage the unowned locks
 * both write by default. Naming an owner is the act that makes a lock yours.
 *
 * There is no override. Breaking somebody else's lock means naming them, which
 * makes it a deliberate act rather than a flag appended to a failing command.
 *
 * Exported for tests: the matrix is small, security-relevant, and worth pinning.
 */
export function mayModify(record: LockRecord, owner: string | null): boolean {
  if (record.owner === null) {
    return true;
  }
  return record.owner === owner;
}

function toLockRecord(row: Record<string, unknown>): LockRecord {
  return {
    id: String(row.id),
    reason: (row.reason as string | null) ?? null,
    owner: (row.owner as string | null) ?? null,
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    expired: row.expired === true,
  };
}

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

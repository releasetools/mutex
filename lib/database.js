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
import { Pool } from "pg";
import { TABLE_NAME } from "./constants.js";
import { SilentLogger } from "./logger.js";
import { describeError, logWarning, sleep } from "./helpers.js";
import format from "pg-format";
/**
 * The columns every read returns.
 *
 * `created_at`/`expires_at` are `TIMESTAMP WITHOUT TIME ZONE` holding UTC wall
 * time. `AT TIME ZONE 'UTC'` re-labels them as `timestamptz`, so node-postgres
 * parses them into correct `Date`s no matter what time zone the client or the
 * database session happens to run in.
 */
const LOCK_COLUMNS = `id, reason, owner,
        created_at AT TIME ZONE 'UTC' AS created_at,
        expires_at AT TIME ZONE 'UTC' AS expires_at,
        (expires_at IS NOT NULL AND expires_at < (NOW() AT TIME ZONE 'UTC')) AS expired`;
export class DatabaseMutex {
    config;
    log;
    pool;
    closed = false;
    /** Schema creation is tried at most once per instance. */
    schemaAttempted = false;
    constructor(config, log = new SilentLogger()) {
        this.config = config;
        this.log = log;
        // Database configuration using connection string
        this.pool = new Pool({ connectionString: config.dbConnectionString });
        // Without a listener, an error on an idle client is an unhandled 'error'
        // event and takes the whole process down.
        this.pool.on("error", (error) => {
            logWarning(this.log, error, "Idle database client error");
        });
    }
    async acquireLock(name, reason, owner = null) {
        return this.withSchemaRetry(`Acquiring lock '${name}'`, () => this.acquireLockInternal(name, reason, owner));
    }
    async releaseLock(name, guard) {
        return this.withSchemaRetry(`Releasing lock '${name}'`, () => this.releaseLockInternal(name, guard));
    }
    /**
     * Extends a lock that `owner` currently holds.
     *
     * Strictly an UPDATE: it never inserts, so renewing something that is not
     * held fails rather than quietly taking a new lock. Both the id and the
     * owner have to match, and an expired lock is refused - by then somebody
     * else may already have taken it over.
     */
    async renewLock(name, expiration, owner = null) {
        return this.withSchemaRetry(`Renewing lock '${name}'`, () => this.renewLockInternal(name, expiration, owner));
    }
    /** Returns the lock's current row, or null when nothing holds it. */
    async inspectLock(name) {
        return this.withSchemaRetry(`Inspecting lock '${name}'`, async () => {
            const result = await this.pool.query(format(`SELECT ${LOCK_COLUMNS} FROM %I WHERE id = $1;`, TABLE_NAME), [name]);
            return result.rows.length > 0 ? toLockRecord(result.rows[0]) : null;
        });
    }
    /** Returns every lock in the table, expired ones included. */
    async listLocks() {
        return this.withSchemaRetry("Listing locks", async () => {
            const result = await this.pool.query(format(`SELECT ${LOCK_COLUMNS} FROM %I ORDER BY id;`, TABLE_NAME));
            return result.rows.map(toLockRecord);
        });
    }
    /**
     * Deletes every expired lock. Expired rows are already dead - acquiring
     * overwrites them - so this is only housekeeping and needs no advisory lock.
     */
    async pruneExpired(dryRun = false) {
        return this.withSchemaRetry("Pruning expired locks", async () => {
            const predicate = `WHERE expires_at IS NOT NULL AND expires_at < (NOW() AT TIME ZONE 'UTC')`;
            const query = dryRun
                ? format(`SELECT ${LOCK_COLUMNS} FROM %I ${predicate};`, TABLE_NAME)
                : format(`DELETE FROM %I ${predicate} RETURNING ${LOCK_COLUMNS};`, TABLE_NAME);
            const result = await this.pool.query(query);
            return result.rows.map(toLockRecord);
        });
    }
    /** Releases the connection pool. Required for a CLI process to exit. */
    async close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        await this.pool.end();
    }
    async acquireLockInternal(name, reason, owner) {
        let client;
        try {
            client = await this.connect();
            await client.query("BEGIN");
            if (!(await this.holdAdvisoryLock(client, name))) {
                await client.query("ROLLBACK");
                return {
                    acquired: false,
                    status: "Lock held by another transaction",
                };
            }
            // Insert the lock, or take it over when the existing one has expired.
            // A row whose expires_at is NULL is never taken over: an unknown
            // expiry is treated as "still held". Acquiring never extends a lock the
            // caller already holds - that is `renewLock`'s job.
            const upsertQuery = format(`INSERT INTO %I (id, reason, owner, expires_at)
        VALUES ($1, $2, $3, (NOW() AT TIME ZONE 'UTC') + ($4 || ' seconds')::INTERVAL)
        ON CONFLICT (id) DO UPDATE
        SET
            expires_at = EXCLUDED.expires_at,
            reason = EXCLUDED.reason,
            owner = EXCLUDED.owner,
            created_at = (NOW() AT TIME ZONE 'UTC')
        WHERE
            %I.expires_at < (NOW() AT TIME ZONE 'UTC')
        RETURNING ${LOCK_COLUMNS};`, TABLE_NAME, TABLE_NAME);
            const result = await client.query(upsertQuery, [
                name,
                reason,
                owner,
                this.config.expiration,
            ]);
            // No row means a valid, unexpired lock already existed.
            if (result.rowCount === 0) {
                const holder = await client.query(format(`SELECT ${LOCK_COLUMNS} FROM %I WHERE id = $1;`, TABLE_NAME), [name]);
                await client.query("ROLLBACK");
                this.log.info(`Lock for "${name}" exists and has not expired.`);
                return {
                    acquired: false,
                    status: "Lock taken by another process (try again later)",
                    record: holder.rows.length > 0 ? toLockRecord(holder.rows[0]) : undefined,
                };
            }
            await client.query("COMMIT");
            this.log.info(`Lock '${name}' acquired successfully.`);
            const record = toLockRecord(result.rows[0]);
            const approximate = new Date(Date.now() + this.config.expiration * 1000).toISOString();
            return {
                acquired: true,
                status: "Lock acquired",
                expires: record.expiresAt ?? `approximately ${approximate}`,
                record,
            };
        }
        catch (error) {
            // Not reported here: `withSchemaRetry` either succeeds on the retry, in
            // which case this was not a problem, or rethrows for the caller to report.
            this.log.debug(`An error occurred while acquiring a lock for '${name}'; rolling back: ${describeError(error)}`);
            await rollback(client, this.log);
            throw error;
        }
        finally {
            this.disconnect(client);
        }
    }
    async releaseLockInternal(name, guard) {
        let client;
        try {
            client = await this.connect();
            await client.query("BEGIN");
            if (!(await this.holdAdvisoryLock(client, name))) {
                await client.query("ROLLBACK");
                return { unlocked: false, outcome: "contended" };
            }
            const existing = await client.query(format(`SELECT ${LOCK_COLUMNS} FROM %I WHERE id = $1;`, TABLE_NAME), [name]);
            if (existing.rows.length === 0) {
                await client.query("COMMIT");
                this.log.warning(`Lock '${name}' was not found. No release was necessary.`);
                return { unlocked: true, outcome: "not-found" };
            }
            const record = toLockRecord(existing.rows[0]);
            if (!guard?.force && !mayModify(record, guard?.owner ?? null)) {
                await client.query("COMMIT");
                return { unlocked: false, outcome: "owned-by-another", record };
            }
            await client.query(format(`DELETE FROM %I WHERE id = $1;`, TABLE_NAME), [
                name,
            ]);
            await client.query("COMMIT");
            this.log.info(`Lock '${name}' released successfully.`);
            return { unlocked: true, outcome: "unlocked", record };
        }
        catch (error) {
            // Not reported here: `withSchemaRetry` either succeeds on the retry, in
            // which case this was not a problem, or rethrows for the caller to report.
            this.log.debug(`An error occurred while releasing a lock for '${name}'; rolling back: ${describeError(error)}`);
            await rollback(client, this.log);
            throw error;
        }
        finally {
            this.disconnect(client);
        }
    }
    async renewLockInternal(name, expiration, owner) {
        let client;
        try {
            client = await this.connect();
            await client.query("BEGIN");
            if (!(await this.holdAdvisoryLock(client, name))) {
                await client.query("ROLLBACK");
                return { renewed: false, outcome: "contended" };
            }
            const existing = await client.query(format(`SELECT ${LOCK_COLUMNS} FROM %I WHERE id = $1;`, TABLE_NAME), [name]);
            if (existing.rows.length === 0) {
                await client.query("COMMIT");
                return { renewed: false, outcome: "not-found" };
            }
            const record = toLockRecord(existing.rows[0]);
            // No `--force` escape: renewing a lock somebody else holds is never the
            // right thing to do. An unowned lock has nobody to wrong, so it stays
            // open, which is what keeps Action-written locks manageable.
            if (!mayModify(record, owner)) {
                await client.query("COMMIT");
                return { renewed: false, outcome: "owned-by-another", record };
            }
            // An expired lock may already have been taken over by someone else, so
            // pushing its expiry forward would re-take it behind their back.
            if (record.expired) {
                await client.query("COMMIT");
                return { renewed: false, outcome: "expired", record };
            }
            // UPDATE, never an upsert: a lock that vanished between the read and
            // here stays gone rather than being recreated.
            const renewed = await client.query(format(`UPDATE %I
          SET expires_at = (NOW() AT TIME ZONE 'UTC') + ($2 || ' seconds')::INTERVAL
          WHERE id = $1
          RETURNING ${LOCK_COLUMNS};`, TABLE_NAME), [name, expiration]);
            if (renewed.rows.length === 0) {
                await client.query("COMMIT");
                return { renewed: false, outcome: "not-found" };
            }
            await client.query("COMMIT");
            this.log.info(`Lock '${name}' renewed for ${expiration}s.`);
            return {
                renewed: true,
                outcome: "renewed",
                record: toLockRecord(renewed.rows[0]),
            };
        }
        catch (error) {
            // Not reported here: `withSchemaRetry` either succeeds on the retry, in
            // which case this was not a problem, or rethrows for the caller to report.
            this.log.debug(`An error occurred while renewing a lock for '${name}'; rolling back: ${describeError(error)}`);
            await rollback(client, this.log);
            throw error;
        }
        finally {
            this.disconnect(client);
        }
    }
    /**
     * Takes a transaction-scoped advisory lock on the mutex id, so no other
     * process can acquire or release the same lock concurrently. Retries once,
     * since contention here is almost always momentary.
     */
    async holdAdvisoryLock(client, name) {
        if (await this.tryAdvisoryLock(client, name)) {
            return true;
        }
        await sleep(1);
        return this.tryAdvisoryLock(client, name);
    }
    async tryAdvisoryLock(client, name) {
        const result = await client.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) as acquired", [name]);
        if (!result.rows[0].acquired) {
            this.log.debug(`Could not acquire advisory lock '${name}'.`);
            return false;
        }
        return true;
    }
    /**
     * Runs an operation and, if it fails, makes sure the schema exists before
     * trying once more - the usual cause is a database that has never seen this
     * action before.
     */
    async withSchemaRetry(operation, run) {
        try {
            return await run();
        }
        catch (error) {
            // Creating the table is a guess at the cause, worth making once. After
            // that the schema is not what is wrong, so later failures go straight
            // back to the caller instead of re-running DDL on every operation.
            if (this.schemaAttempted) {
                throw error;
            }
            this.schemaAttempted = true;
            // Expected the first time a database is used, so this is not worth a
            // warning: if the retry fails too, the original error is thrown.
            this.log.debug(`${operation} failed; ensuring the schema exists and retrying once: ${describeError(error)}`);
            try {
                await this.initializeTable();
            }
            catch {
                throw error;
            }
            return run();
        }
    }
    /**
     * Creates the lock table when missing, and adds the `owner` column to tables
     * created by earlier versions. Both statements are idempotent.
     */
    async initializeTable() {
        let client;
        try {
            client = await this.connect();
            await client.query(format(`CREATE TABLE IF NOT EXISTS %I (
            id VARCHAR(255) PRIMARY KEY,
            reason TEXT,
            owner TEXT,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL,
            expires_at TIMESTAMP WITHOUT TIME ZONE
          );`, TABLE_NAME));
            await client.query(format(`ALTER TABLE %I ADD COLUMN IF NOT EXISTS owner TEXT;`, TABLE_NAME));
            this.log.debug(`Table ${TABLE_NAME} is present and up to date.`);
        }
        catch (error) {
            // Reported by whoever asked for the schema; `withSchemaRetry` prefers to
            // surface the original failure instead.
            this.log.debug(`Could not create the table ${TABLE_NAME}: ${describeError(error)}`);
            throw error;
        }
        finally {
            this.disconnect(client);
        }
    }
    async connect() {
        this.log.debug("Attempting to connect to the database.");
        const client = await this.pool.connect();
        this.log.debug("Successfully connected to the database.");
        return client;
    }
    disconnect(client) {
        // Return the connection to the pool, whether an error occurred or not
        client?.release();
        if (client) {
            this.log.debug("Database connection released.");
        }
    }
}
/**
 * Who may unlock or renew a lock: its owner, or anyone at all when it has none.
 *
 * Ownership is what confers protection, so a lock nobody claimed is nobody's to
 * defend - which is also what lets the CLI manage the unowned locks the Action
 * writes today. Naming an owner is the act that makes a lock yours.
 *
 * Exported for tests: the matrix is small, security-relevant, and worth pinning.
 */
export function mayModify(record, owner) {
    if (record.owner === null) {
        return true;
    }
    return record.owner === owner;
}
async function rollback(client, log) {
    if (!client) {
        return;
    }
    try {
        await client.query("ROLLBACK");
    }
    catch (error) {
        logWarning(log, error, "Failed to roll back the transaction");
    }
}
function toLockRecord(row) {
    return {
        id: String(row.id),
        reason: row.reason ?? null,
        owner: row.owner ?? null,
        createdAt: toIsoString(row.created_at),
        expiresAt: toIsoString(row.expires_at),
        expired: row.expired === true,
    };
}
function toIsoString(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return String(value);
}
//# sourceMappingURL=database.js.map
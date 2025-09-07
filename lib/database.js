"use strict";
/*
 * Copyright (c) 2025 Mihai Bojin
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseMutex = void 0;
const core = __importStar(require("@actions/core"));
const pg_1 = require("pg");
const constants_1 = require("./constants");
const helpers_1 = require("./helpers");
const format = require("pg-format");
class DatabaseMutex {
    settings;
    connection_string;
    pool;
    constructor(settings) {
        this.settings = settings;
        this.connection_string = settings.dbConnectionString;
        // Database configuration using connection string
        this.pool = new pg_1.Pool({
            connectionString: this.connection_string,
        });
    }
    async acquireLock(name, reason) {
        try {
            return await this.acquireLockInternal(name, reason);
        }
        catch (error) {
            // If we encounter an error, it might be due to the table not existing.
            // Attempt to create the table
            this.initializeTable();
            // And retry acquiring the lock once.
            return await this.acquireLockInternal(name, reason);
        }
    }
    async acquireLockInternal(name, reason) {
        let client;
        try {
            core.info("Attempting to connect to the database.");
            client = await this.pool.connect();
            core.info("Successfully connected to the database.");
            await client.query("BEGIN");
            // Get an advisory lock to ensure no other process is
            // trying to acquire or release this same lock concurrently.
            let lockAcquired = await this.dbAdvisoryLockUnsafe(client, name);
            if (!lockAcquired) {
                // Protect against concurrency issues by waiting a short moment
                await (0, helpers_1.sleep)(1);
                // And then retrying to acquire the advisory lock
                lockAcquired = await this.dbAdvisoryLockUnsafe(client, name);
            }
            // If we still couldn't get the advisory lock, bail out.
            if (!lockAcquired) {
                await client.query("ROLLBACK");
                return {
                    acquired: false,
                    status: "Lock held by another transaction",
                };
            }
            // If the advisory lock was acquired, proceed to insert or update the mutex row.
            // If a lock with the same name exists (ON CONFLICT), it tries to UPDATE it.
            // The UPDATE only succeeds if the existing lock has expired (expires_at < NOW()).
            const upsertQuery = format(`INSERT INTO %I (id, reason, expires_at)
        VALUES ($1, $2, NOW() + ($3 || ' seconds')::INTERVAL)
        ON CONFLICT (id) DO UPDATE
        SET
            expires_at = EXCLUDED.expires_at,
            reason = EXCLUDED.reason,
            created_at = (NOW() AT TIME ZONE 'UTC')
        WHERE
            %I.expires_at < (NOW() AT TIME ZONE 'UTC')
        RETURNING id, reason, expires_at;`, constants_1.TABLE_NAME, constants_1.TABLE_NAME);
            const result = await client.query(upsertQuery, [
                name,
                reason,
                this.settings.expiration,
            ]);
            // If rowCount is 0, it means a valid, unexpired lock row already existed.
            if (result.rowCount === 0) {
                core.info(`Lock for "${name}" exists and has not expired.`);
                await client.query("ROLLBACK");
                return {
                    acquired: false,
                    status: "Lock taken by another process (try again later)",
                };
            }
            // The lock was successfully written to the table.
            await client.query("COMMIT");
            core.info(`Lock '${name}' acquired successfully.`);
            const approxExpiry = new Date(Date.now() + this.settings.expiration * 1000).toISOString();
            const expires = new Date(result?.rows[0]?.expires_at).toISOString() ||
                `approximately ${approxExpiry}`;
            return { acquired: true, status: "Lock acquired", expires: expires };
        }
        catch (error) {
            (0, helpers_1.printWarning)(error, `An error occurred while acquiring a lock for '${name}'; rolling back and retrying`);
            await client?.query("ROLLBACK");
            throw error;
        }
        finally {
            // Ensure the database connection is returned to the pool, whether an error occurred or not
            await client?.release();
            core.info(`Database connection released.`);
        }
    }
    async releaseLock(name) {
        try {
            return await this.releaseLockInternal(name);
        }
        catch (error) {
            // If we encounter an error, retry acquiring the lock once.
            return await this.releaseLockInternal(name);
        }
    }
    async releaseLockInternal(name) {
        let client;
        try {
            core.info("Attempting to connect to the database.");
            client = await this.pool.connect();
            core.info("Successfully connected to the database.");
            await client.query("BEGIN");
            // Get an advisory lock to ensure no other process is
            // trying to acquire or release this same lock concurrently.
            let lockAcquired = await this.dbAdvisoryLockUnsafe(client, name);
            if (!lockAcquired) {
                // Protect against concurrency issues by waiting a short moment
                await (0, helpers_1.sleep)(1);
                // And then retrying to acquire the advisory lock
                lockAcquired = await this.dbAdvisoryLockUnsafe(client, name);
            }
            // If we still couldn't get the advisory lock, bail out.
            if (!lockAcquired) {
                await client.query("ROLLBACK");
                return false;
            }
            // Once the advisory lock is held, we can safely delete the row.
            const deleteQuery = `DELETE FROM ${constants_1.TABLE_NAME} WHERE id = $1;`;
            const result = await client.query(deleteQuery, [name]);
            await client.query("COMMIT");
            if (result.rowCount && result.rowCount > 0) {
                core.info(`Lock '${name}' released successfully.`);
            }
            else {
                core.warning(`Lock '${name}' was not found. No release was necessary.`);
            }
            return true;
        }
        catch (error) {
            (0, helpers_1.printWarning)(error, `An error occurred while releasing a lock for '${name}'; rolling back and retrying`);
            await client?.query("ROLLBACK");
            throw error;
        }
        finally {
            // Ensure the database connection is returned to the pool, whether an error occurred or not
            await client?.release();
            core.info(`Database connection released.`);
        }
    }
    // Acquire an advisory lock to ensure no other process is
    // trying to acquire or release this same lock concurrently.
    // This function leaves all aspects such as client/transaction management
    // to the caller.
    async dbAdvisoryLockUnsafe(client, name) {
        const advisoryLockResult = await client.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) as acquired", [name]);
        const lockAcquired = advisoryLockResult.rows[0].acquired;
        if (!lockAcquired) {
            console.log(`Could not acquire advisory lock '${name}'.`);
            return false;
        }
        return true;
    }
    /**
     * Connects to the PostgreSQL database and creates the table
     * if it does not already exist.
     */
    async initializeTable() {
        let client;
        try {
            core.info("Attempting to connect to the database.");
            client = await this.pool.connect();
            core.info("Successfully connected to the database.");
            // Define the SQL query for creating the table.
            const createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${constants_1.TABLE_NAME} (
          id VARCHAR(255) PRIMARY KEY,
          reason TEXT,
          created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL,
          expires_at TIMESTAMP WITHOUT TIME ZONE
        );
      `;
            // Execute the table creation query
            await client.query(createTableQuery);
            core.info(`Table ${constants_1.TABLE_NAME} has been created successfully (or already exists).`);
        }
        catch (error) {
            (0, helpers_1.printWarning)(error, `An error occurred while creating the table ${constants_1.TABLE_NAME}`);
            throw error;
        }
        finally {
            // Ensure the database connection is returned to the pool, whether an error occurred or not
            await client?.release();
            core.info(`Database connection released.`);
        }
    }
}
exports.DatabaseMutex = DatabaseMutex;
//# sourceMappingURL=database.js.map
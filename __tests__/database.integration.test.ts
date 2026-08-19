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
 */

import { Pool } from "pg";
import { jest } from "@jest/globals";
import { DatabaseMutex } from "../src/database.js";
import { SilentLogger } from "../src/logger.js";
import { TABLE_NAME } from "../src/constants.js";

const DATABASE_URL = process.env.MUTEX_TEST_DATABASE_URL ?? "";
const databaseTest = DATABASE_URL ? describe : describe.skip;

databaseTest("DatabaseMutex PostgreSQL integration", () => {
  const admin = new Pool({ connectionString: DATABASE_URL });
  let mutex: DatabaseMutex;

  beforeAll(async () => {
    // Exercise the ordinary first-run schema path once, then give every test a
    // clean table without duplicating the production DDL here.
    const bootstrap = new DatabaseMutex(
      { dbConnectionString: DATABASE_URL },
      new SilentLogger(),
    );
    await bootstrap.inspectLock("schema-bootstrap");
    await bootstrap.close();
  });

  beforeEach(async () => {
    await admin.query(`TRUNCATE TABLE ${TABLE_NAME}`);
    mutex = new DatabaseMutex(
      { dbConnectionString: DATABASE_URL },
      new SilentLogger(),
    );
  });

  afterEach(async () => {
    await mutex.close();
  });

  afterAll(async () => {
    await admin.end();
  });

  it("acquires once and returns the current holder from a competing acquire", async () => {
    const acquired = await mutex.acquireLock("deploy", "first", "alice", 60);
    expect(acquired).toMatchObject({
      acquired: true,
      status: "Lock acquired",
      record: { id: "deploy", reason: "first", owner: "alice" },
    });

    const held = await mutex.acquireLock("deploy", "second", "bob", 60);
    expect(held).toMatchObject({
      acquired: false,
      status: "Lock taken by another process (try again later)",
      record: { id: "deploy", reason: "first", owner: "alice" },
    });
  });

  it("takes over an expired lock and resets its fence", async () => {
    const first = await mutex.acquireLock("deploy", "first", "alice", 60);
    await admin.query(
      `UPDATE ${TABLE_NAME}
       SET
         created_at = (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 minute',
         expires_at = (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 second'
       WHERE id = $1`,
      ["deploy"],
    );

    const second = await mutex.acquireLock("deploy", "second", "bob", 60);
    expect(second).toMatchObject({
      acquired: true,
      record: { id: "deploy", reason: "second", owner: "bob" },
    });
    expect(second.record?.createdAt).not.toBe(first.record?.createdAt);
  });

  it("preserves ownership and fencing outcomes while releasing", async () => {
    const acquired = await mutex.acquireLock("deploy", "reason", "alice", 60);
    const fence = acquired.record?.createdAt;
    expect(fence).toBeDefined();

    await expect(mutex.releaseLock("deploy", "bob")).resolves.toMatchObject({
      unlocked: false,
      outcome: "owned-by-another",
      record: { owner: "alice" },
    });
    await expect(
      mutex.releaseLock("deploy", "alice", "2000-01-01T00:00:00.000Z"),
    ).resolves.toMatchObject({ unlocked: false, outcome: "superseded" });
    await expect(
      mutex.releaseLock("deploy", "alice", fence?.replace("Z", "+00:00")),
    ).resolves.toMatchObject({ unlocked: false, outcome: "superseded" });
    await expect(
      mutex.releaseLock("deploy", "alice", fence),
    ).resolves.toMatchObject({ unlocked: true, outcome: "unlocked" });
    await expect(mutex.releaseLock("deploy", "alice")).resolves.toEqual({
      unlocked: true,
      outcome: "not-found",
    });
  });

  it("renews only a live lock its owner may modify", async () => {
    await expect(mutex.renewLock("missing", 60, "alice")).resolves.toEqual({
      renewed: false,
      outcome: "not-found",
    });

    await mutex.acquireLock("deploy", "reason", "alice", 120);
    await expect(mutex.renewLock("deploy", 60, "bob")).resolves.toMatchObject({
      renewed: false,
      outcome: "owned-by-another",
      record: { owner: "alice" },
    });
    await expect(mutex.renewLock("deploy", 60, "alice")).resolves.toMatchObject(
      {
        renewed: true,
        outcome: "renewed",
        extended: false,
      },
    );
    await expect(
      mutex.renewLock("deploy", 300, "alice"),
    ).resolves.toMatchObject({
      renewed: true,
      outcome: "renewed",
      extended: true,
    });

    await admin.query(
      `UPDATE ${TABLE_NAME}
       SET expires_at = (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 second'
       WHERE id = $1`,
      ["deploy"],
    );
    await expect(
      mutex.renewLock("deploy", 300, "alice"),
    ).resolves.toMatchObject({ renewed: false, outcome: "expired" });
  });

  it("keeps unowned locks open to named callers", async () => {
    await mutex.acquireLock("renewable", "reason", null, 60);
    await expect(
      mutex.renewLock("renewable", 300, "anyone"),
    ).resolves.toMatchObject({ renewed: true, outcome: "renewed" });

    await mutex.acquireLock("releasable", "reason", null, 60);
    await expect(
      mutex.releaseLock("releasable", "anyone"),
    ).resolves.toMatchObject({ unlocked: true, outcome: "unlocked" });
  });

  it("lists one owner's locks, and everything when nobody is named", async () => {
    await mutex.acquireLock("alpha", "reason", "alice", 60);
    await mutex.acquireLock("beta", "reason", "bob", 60);
    await mutex.acquireLock("gamma", "reason", null, 60);

    // One row back, so an unowned lock is nobody's rather than everybody's.
    await expect(mutex.listLocks("alice")).resolves.toMatchObject([
      { id: "alpha", owner: "alice" },
    ]);
    // Holding nothing is an answer rather than a failure.
    await expect(mutex.listLocks("nobody")).resolves.toEqual([]);
    expect((await mutex.listLocks()).map((lock) => lock.id)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("returns contended after the one retry when another transaction holds the gate", async () => {
    const blocker = await admin.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "deploy",
      ]);

      await expect(
        mutex.acquireLock("deploy", "reason", "alice", 60),
      ).resolves.toEqual({
        acquired: false,
        status: "Lock held by another transaction",
      });
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  it("uses one client query for each successful mutation", async () => {
    const pool = (mutex as unknown as { pool: Pool }).pool;
    const query = jest.spyOn(pool, "query");

    const acquired = await mutex.acquireLock("deploy", "reason", "alice", 60);
    expect(query).toHaveBeenCalledTimes(1);

    query.mockClear();
    await mutex.renewLock("deploy", 300, "alice");
    expect(query).toHaveBeenCalledTimes(1);

    query.mockClear();
    await mutex.releaseLock("deploy", "alice", acquired.record?.createdAt);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("allows exactly one winner across concurrent acquisitions", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        mutex.acquireLock("deploy", `attempt-${index}`, `owner-${index}`, 60),
      ),
    );

    expect(attempts.filter((result) => result.acquired)).toHaveLength(1);
    expect((await mutex.inspectLock("deploy"))?.id).toBe("deploy");
  });
});

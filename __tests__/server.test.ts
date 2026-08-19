/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { SilentLogger } from "../src/logger.js";
import { ConfigurationError } from "../src/cli/exit-codes.js";
import {
  LockRecord,
  LockResult,
  RenewResult,
  UnlockResult,
} from "../src/mutex.js";
import { MutexProfile } from "../src/cli/profiles.js";
import {
  runServer,
  ServerDatabase,
  serverPaths,
} from "../src/server/server.js";
import { serverCommand } from "../src/server/lifecycle.js";
import { TcpMutexStore } from "../src/server/tcp-store.js";
import {
  LIFECYCLE_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "../src/server/protocol.js";

class FakeDatabase implements ServerDatabase {
  acquisitions: Array<{ name: string; expiration: number }> = [];
  listed: Array<string | null> = [];
  closed = false;
  warmCount = 0;

  async acquireLock(
    name: string,
    _reason: string,
    owner: string | null = null,
    expiration = 60,
  ): Promise<LockResult> {
    this.acquisitions.push({ name, expiration });
    return {
      acquired: true,
      status: "Lock acquired",
      record: record(name, owner),
    };
  }

  async releaseLock(name: string): Promise<UnlockResult> {
    return { unlocked: true, outcome: "unlocked", record: record(name) };
  }

  async renewLock(name: string): Promise<RenewResult> {
    return { renewed: true, outcome: "renewed", record: record(name) };
  }

  async inspectLock(name: string): Promise<LockRecord | null> {
    return record(name);
  }

  async listLocks(owner: string | null = null): Promise<LockRecord[]> {
    this.listed.push(owner);
    return [record("listed", owner)];
  }

  async pruneExpired(): Promise<LockRecord[]> {
    return [];
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async warm(): Promise<void> {
    this.warmCount++;
  }

  poolStatus() {
    return { total: 1, idle: 1, waiting: 0 };
  }
}

describe("mutex TCP server", () => {
  let temporary: string;
  const originalConfigHome = process.env.XDG_CONFIG_HOME;
  const originalDatabaseUrl = process.env.MUTEX_DATABASE_URL;

  beforeEach(async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "mutex-server-"));
    process.env.XDG_CONFIG_HOME = temporary;
  });

  afterEach(async () => {
    await rm(temporary, { recursive: true, force: true });
    if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalConfigHome;
    if (originalDatabaseUrl === undefined)
      delete process.env.MUTEX_DATABASE_URL;
    else process.env.MUTEX_DATABASE_URL = originalDatabaseUrl;
  });

  it("reports missing server configuration instead of an implicit direct profile", async () => {
    process.env.MUTEX_DATABASE_URL = "postgres://example.invalid/locks";

    await expect(
      serverCommand("status", null, false, new SilentLogger()),
    ).rejects.toMatchObject<Partial<ConfigurationError>>({
      message: `no mutex server configuration found at ${path.join(
        temporary,
        "releasetools-mutex",
        "profiles.toml",
      )}`,
      hint: "Run 'mutex profile' to create it.",
    });
  });

  it("serves every operation through one warm store and writes exact logs", async () => {
    const port = await unusedPort();
    const profile: MutexProfile = {
      name: "pooled",
      mode: "server",
      enabled: true,
      bindAddress: `127.0.0.1:${port}`,
      workingDir: temporary,
    };
    const database = new FakeDatabase();
    const running = runServer(
      profile,
      "not-used-by-the-fake",
      new SilentLogger(),
      () => database,
    );
    const client = new TcpMutexStore(
      profile.bindAddress!,
      500,
      "host|name\nline",
      "pooled",
    );

    await waitForServer(client);
    await expect(
      new TcpMutexStore(
        profile.bindAddress!,
        500,
        "wrong-host",
        "another-profile",
      ).health(),
    ).rejects.toThrow(/reached server profile 'pooled'/);
    const acquired = await client.acquireLock(
      "deploy|prod\nnow",
      "reason",
      "alice",
      17,
    );
    expect(acquired.acquired).toBe(true);
    await client.acquireLock("once", "reason", null, 9, "try-lock");
    expect(database.acquisitions).toEqual([
      { name: "deploy|prod\nnow", expiration: 17 },
      { name: "once", expiration: 9 },
    ]);
    expect((await client.releaseLock("once")).unlocked).toBe(true);
    expect((await client.renewLock("deploy", 30, "alice")).renewed).toBe(true);
    expect((await client.inspectLock("deploy"))?.id).toBe("deploy");
    expect((await client.listLocks())[0].id).toBe("listed");
    expect((await client.listLocks("alice"))[0].owner).toBe("alice");
    // Blank names nobody here too, so a client that cannot say null still asks
    // for the whole table rather than for an owner called "".
    expect((await client.listLocks(""))[0].id).toBe("listed");
    // The filter is answered by the store, not by the client after the fact.
    expect(database.listed).toEqual([null, "alice", null]);
    expect(await client.pruneExpired(true)).toEqual([]);

    const health = await client.health();
    expect(health).toMatchObject({
      profile: "pooled",
      bindAddress: profile.bindAddress,
      protocolVersion: 2,
      pool: { healthy: true, total: 1 },
    });
    await client.stop();
    await running;

    expect(database.closed).toBe(true);
    expect(database.warmCount).toBeGreaterThan(1);
    const lines = (await readFile(serverPaths(profile).logPath, "utf8"))
      .trimEnd()
      .split("\n");
    expect(lines).toHaveLength(9);
    expect(lines[0]).toMatch(
      /^\|\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|lock\|deploy%7Cprod%0Anow\|alice\|127\.0\.0\.1\|host%7Cname%0Aline\|$/,
    );
    expect(lines[1]).toMatch(
      /^\|\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|try-lock\|once\|-\|127\.0\.0\.1\|host%7Cname%0Aline\|$/,
    );
    expect(lines[2]).toContain("|unlock|once|-|127.0.0.1|");
    expect(lines[3]).toContain("|renew|deploy|alice|127.0.0.1|");
    expect(lines[4]).toContain("|status|deploy|-|127.0.0.1|");
    expect(lines[5]).toMatch(
      /^\|\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|list\|-\|-\|127\.0\.0\.1\|host%7Cname%0Aline\|$/,
    );
    expect(lines[6]).toContain("|list|-|alice|127.0.0.1|");
    expect(lines[7]).toContain("|list|-|-|127.0.0.1|");
    expect(lines[8]).toContain("|prune|-|-|127.0.0.1|");
  });

  /**
   * The remedy a version mismatch names is restarting the server, so the two
   * commands that see it and fix it cannot themselves be gated on the version.
   * Otherwise upgrading mutex strands the running server behind `kill`.
   */
  it("is stopped and inspected by a client of any version, but works locks only at its own", async () => {
    const port = await unusedPort();
    const profile: MutexProfile = {
      name: "pooled",
      mode: "server",
      enabled: true,
      bindAddress: `127.0.0.1:${port}`,
      workingDir: temporary,
    };
    const running = runServer(
      profile,
      "not-used-by-the-fake",
      new SilentLogger(),
      () => new FakeDatabase(),
    );
    const client = new TcpMutexStore(
      profile.bindAddress!,
      500,
      "host",
      "pooled",
    );
    await waitForServer(client);

    const stale = {
      version: PROTOCOL_VERSION - 1,
      profile: "pooled",
      hostname: "a-client-built-from-older-code",
      payload: {},
    };

    // Lock work still refuses, by name: a wrong answer is worse than none.
    await expect(
      rawRequest(profile.bindAddress!, { ...stale, operation: "list" }),
    ).resolves.toMatchObject({
      ok: false,
      error: `protocol ${PROTOCOL_VERSION - 1} is incompatible with server protocol ${PROTOCOL_VERSION}`,
    });

    // Asking how it is, and telling it to stop, do not.
    await expect(
      rawRequest(profile.bindAddress!, { ...stale, operation: "health" }),
    ).resolves.toMatchObject({
      ok: true,
      // Answered in the frozen dialect, so an older client accepts the reply.
      version: LIFECYCLE_PROTOCOL_VERSION,
      result: { profile: "pooled", protocolVersion: PROTOCOL_VERSION },
    });
    await expect(
      rawRequest(profile.bindAddress!, { ...stale, operation: "stop" }),
    ).resolves.toMatchObject({
      ok: true,
      version: LIFECYCLE_PROTOCOL_VERSION,
      result: { stopping: true },
    });

    await running;
  });
});

/** A request in whatever shape the caller wants, version included. */
async function rawRequest(
  bindAddress: string,
  request: Record<string, unknown>,
): Promise<{ version: number; ok: boolean; error?: string; result?: unknown }> {
  const split = bindAddress.lastIndexOf(":");
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: bindAddress.slice(0, split),
      port: Number(bindAddress.slice(split + 1)),
    });
    let buffer = "";
    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      socket.destroy();
      resolve(JSON.parse(buffer.slice(0, newline)));
    });
  });
}

async function waitForServer(client: TcpMutexStore): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await client.health();
      return;
    } catch {
      await delay(10);
    }
  }
  throw new Error("test server did not start");
}

async function unusedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("no TCP address");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function record(id: string, owner: string | null = null): LockRecord {
  return {
    id,
    reason: null,
    owner,
    createdAt: "2026-08-16T00:00:00.000Z",
    expiresAt: "2026-08-16T00:01:00.000Z",
    expired: false,
  };
}

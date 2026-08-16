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

import { jest } from "@jest/globals";
import {
  LockRequest,
  LockResult,
  MutexInterface,
  tryLock,
  tryUnlock,
  UnlockResult,
} from "../src/mutex.js";
import { SilentLogger } from "../src/logger.js";

const log = new SilentLogger();

function request(overrides: Partial<LockRequest> = {}): LockRequest {
  return {
    identifier: "resource",
    reason: "",
    pollTimeoutMs: 0,
    pollIntervalMs: 0,
    ...overrides,
  };
}

/** A store that answers however the test needs, and counts the asking. */
function stub(
  lock: Partial<LockResult> = {},
  unlock: Partial<UnlockResult> = {},
) {
  const calls = { acquire: 0, release: 0 };
  const mutex: MutexInterface = {
    async acquireLock() {
      calls.acquire++;
      return { acquired: false, status: "taken", ...lock };
    },
    async releaseLock() {
      calls.release++;
      return { unlocked: false, outcome: "contended", ...unlock };
    },
  };
  return { mutex, calls };
}

describe("tryLock", () => {
  it("tries once when there is no time to wait", async () => {
    const { mutex, calls } = stub();
    await tryLock(request(), mutex, log);
    expect(calls.acquire).toBe(1);
  });

  /**
   * `parseInt("")` on an unset workflow input yields NaN, and every comparison
   * against NaN is false - including the one the wait loop breaks on. Left
   * unguarded this polls the database for ever.
   */
  it.each([NaN, Infinity, -Infinity])(
    "terminates when the timeout is %p",
    async (pollTimeoutMs) => {
      const { mutex, calls } = stub();
      await tryLock(request({ pollTimeoutMs }), mutex, log);
      expect(calls.acquire).toBe(1);
    },
  );

  it("terminates when the interval is NaN", async () => {
    const { mutex, calls } = stub();
    await tryLock(
      request({ pollTimeoutMs: 0, pollIntervalMs: NaN }),
      mutex,
      log,
    );
    expect(calls.acquire).toBe(1);
  });

  it("retries while there is time, then gives up", async () => {
    const { mutex, calls } = stub();
    const timedOut = jest.fn<(message: string) => void>();

    await tryLock(
      request({ pollTimeoutMs: 300, pollIntervalMs: 100 }),
      mutex,
      log,
      { onTimeout: timedOut },
    );

    expect(calls.acquire).toBeGreaterThan(1);
    expect(timedOut).toHaveBeenCalled();
  });

  it("reports an acquisition once", async () => {
    const { mutex, calls } = stub({ acquired: true, status: "ok" });
    const locked = jest.fn<(result: LockResult) => void>();

    await tryLock(request(), mutex, log, { onLocked: locked });

    expect(calls.acquire).toBe(1);
    expect(locked).toHaveBeenCalledTimes(1);
  });
});

describe("tryUnlock", () => {
  it("reports a release", async () => {
    const { mutex } = stub({}, { unlocked: true, outcome: "unlocked" });
    const unlocked = jest.fn<(result: UnlockResult) => void>();

    await tryUnlock(request(), mutex, log, { onUnlocked: unlocked });

    expect(unlocked).toHaveBeenCalledTimes(1);
  });

  /**
   * A refusal is neither success nor a deadline. Without its own event a
   * caller that handles only those two finishes green having released nothing.
   */
  it("reports a refusal, and does not retry it", async () => {
    const { mutex, calls } = stub(
      {},
      { unlocked: false, outcome: "owned-by-another" },
    );
    const refused = jest.fn<(result: UnlockResult) => void>();
    const unlocked = jest.fn<(result: UnlockResult) => void>();

    await tryUnlock(
      request({ pollTimeoutMs: 500, pollIntervalMs: 100 }),
      mutex,
      log,
      { onRefused: refused, onUnlocked: unlocked },
    );

    expect(refused).toHaveBeenCalledTimes(1);
    expect(unlocked).not.toHaveBeenCalled();
    // Retrying cannot change the answer, so it must not poll.
    expect(calls.release).toBe(1);
  });

  it("falls back to onTimeout when a caller has no onRefused", async () => {
    const { mutex } = stub(
      {},
      { unlocked: false, outcome: "owned-by-another" },
    );
    const timedOut = jest.fn<(message: string) => void>();

    await tryUnlock(request(), mutex, log, { onTimeout: timedOut });

    expect(timedOut).toHaveBeenCalledTimes(1);
  });

  it("terminates on a NaN timeout", async () => {
    const { mutex, calls } = stub();
    await tryUnlock(request({ pollTimeoutMs: NaN }), mutex, log);
    expect(calls.release).toBe(1);
  });
});

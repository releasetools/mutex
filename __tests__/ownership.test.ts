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

import { mayModify } from "../src/database.js";
import { LockRecord } from "../src/mutex.js";

function lockOwnedBy(owner: string | null): LockRecord {
  return {
    id: "resource",
    reason: null,
    owner,
    createdAt: "2026-08-15T09:00:00.000Z",
    expiresAt: "2026-08-15T09:01:00.000Z",
    expired: false,
  };
}

/**
 * Unlocking and renewing share one rule: the owner may act, and so may anyone
 * at all when the lock has no owner. There is no override: breaking a lock
 * means naming its holder.
 */
describe("mayModify", () => {
  const cases: Array<{
    held: string | null;
    caller: string | null;
    allowed: boolean;
    why: string;
  }> = [
    {
      held: null,
      caller: null,
      allowed: true,
      why: "an unowned lock is nobody's to protect",
    },
    {
      held: null,
      caller: "bob",
      allowed: true,
      why: "still unowned, so a named caller may act too",
    },
    {
      held: "alice",
      caller: null,
      allowed: false,
      why: "an unowned caller does not own a named lock",
    },
    { held: "alice", caller: "alice", allowed: true, why: "same owner" },
    { held: "alice", caller: "bob", allowed: false, why: "different owners" },
  ];

  for (const { held, caller, allowed, why } of cases) {
    it(`${allowed ? "allows" : "refuses"} ${caller ?? "an unowned caller"} on a lock held by ${held ?? "nobody"} (${why})`, () => {
      expect(mayModify(lockOwnedBy(held), caller)).toBe(allowed);
    });
  }

  it("has no override", () => {
    // Dropping --force means this predicate is the whole authorisation story:
    // whatever it refuses, the caller can only get past by naming the holder.
    expect(mayModify(lockOwnedBy("alice"), null)).toBe(false);
    expect(mayModify(lockOwnedBy("alice"), "bob")).toBe(false);
    expect(mayModify(lockOwnedBy("alice"), "alice")).toBe(true);
  });

  it("protects a lock only once it is owned", () => {
    // The whole model in one line: naming an owner is what buys protection.
    expect(mayModify(lockOwnedBy(null), "anyone")).toBe(true);
    expect(mayModify(lockOwnedBy("alice"), "anyone")).toBe(false);
  });
});

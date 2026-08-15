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

import { mayUnlock } from "../src/database.js";
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
 * Unlocking uses the same owner rule as renewing: both sides have to match.
 * `--force` is the only way past it.
 */
describe("mayUnlock", () => {
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
      why: "unowned matches unowned - this is how the CLI releases Action locks",
    },
    {
      held: null,
      caller: "ci",
      allowed: false,
      why: "a named caller does not own an unowned lock",
    },
    {
      held: "ci",
      caller: null,
      allowed: false,
      why: "an unowned caller does not own a named lock",
    },
    { held: "ci", caller: "ci", allowed: true, why: "same owner" },
    { held: "ci", caller: "bob", allowed: false, why: "different owners" },
  ];

  for (const { held, caller, allowed, why } of cases) {
    it(`${allowed ? "allows" : "refuses"} ${caller ?? "unowned"} on a lock held by ${held ?? "nobody"} (${why})`, () => {
      expect(
        mayUnlock(lockOwnedBy(held), { owner: caller, force: false }),
      ).toBe(allowed);
    });
  }

  it("lets --force past every refusal", () => {
    for (const { held, caller } of cases) {
      expect(mayUnlock(lockOwnedBy(held), { owner: caller, force: true })).toBe(
        true,
      );
    }
  });

  it("allows an unguarded release, which is what the Action does", () => {
    // MutexSettings hardcodes force, so the Action keeps releasing
    // unconditionally exactly as it did before ownership existed.
    expect(mayUnlock(lockOwnedBy("ci"))).toBe(true);
    expect(mayUnlock(lockOwnedBy(null))).toBe(true);
  });

  it("treats unowned as an absence, not an identity", () => {
    // Two different unowned callers are indistinguishable, so this rule alone
    // does not stop one unowned process releasing another's lock.
    const alice = { owner: null, force: false };
    const bob = { owner: null, force: false };
    expect(mayUnlock(lockOwnedBy(null), alice)).toBe(true);
    expect(mayUnlock(lockOwnedBy(null), bob)).toBe(true);
  });
});

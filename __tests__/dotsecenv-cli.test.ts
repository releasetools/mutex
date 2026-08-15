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

import { getSecret } from "../src/dotsecenv/cli.js";
import { DotsecenvError } from "../src/dotsecenv/errors.js";

/**
 * A secret key becomes an argument to another program, so it is checked before
 * the process is spawned rather than trusted from the caller.
 *
 * Without this, a flag-shaped key is read as an option by the dotsecenv CLI
 * instead of as the secret to fetch - `secret get --config=/etc/passwd` really
 * does load that file as its configuration.
 */
describe("getSecret argument handling", () => {
  const options = { cwd: process.cwd(), binary: "/nonexistent/dotsecenv" };

  const rejected = [
    "--config=/etc/passwd",
    "-c/etc/passwd",
    "--json",
    "-v",
    "key --config=/etc/passwd",
    "key;whoami",
    "key$(whoami)",
    "key`whoami`",
    "key|tee /tmp/x",
    "../../etc/passwd",
    "",
    "1leading-digit",
    "a::b::c",
    "a/b",
  ];

  for (const key of rejected) {
    it(`refuses ${JSON.stringify(key)} without spawning anything`, async () => {
      // The binary does not exist, so reaching a spawn would fail with
      // "not-installed" instead - which is how we know it never got there.
      await expect(getSecret(key, options)).rejects.toMatchObject({
        kind: "validation",
      });
    });
  }

  const accepted = ["DATABASE_URL", "_private", "ns::KEY", "a1::b2"];

  for (const key of accepted) {
    it(`accepts ${JSON.stringify(key)} and goes on to run the binary`, async () => {
      // Reaching "not-installed" means validation passed and the spawn was
      // attempted, which is as far as we can get without a real dotsecenv.
      await expect(getSecret(key, options)).rejects.toMatchObject({
        kind: "not-installed",
      });
    });
  }

  it("reports the invalid key as a DotsecenvError", async () => {
    await expect(getSecret("--json", options)).rejects.toBeInstanceOf(
      DotsecenvError,
    );
  });
});

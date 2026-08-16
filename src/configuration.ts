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

import * as core from "@actions/core";
import { CONNECTION_ENV_VAR, findConnectionString } from "./connection.js";
import { loadFromEnvOrGHAInput } from "./inputs.js";
import { Logger } from "./logger.js";
import { LockRequest, MutexConfig } from "./mutex.js";
import {
  DEFAULT_EXPIRATION_SECONDS,
  pollIntervalMs,
  pollTimeoutMs,
} from "./timing.js";

export class MutexSettings implements MutexConfig, LockRequest {
  dbConnectionString: string;
  command: string;
  identifier: string;
  expiration: number;
  reason: string;
  pollTimeoutMs: number;
  pollIntervalMs: number;
  autoReleaseLock: boolean;

  /**
   * The Action does not record an owner yet (see issue #67), so every lock it
   * takes is unowned - releasable by itself, and by any caller that likewise
   * names no owner.
   */
  readonly owner = null;

  constructor(log: Logger) {
    // Either name works as an environment variable or as a `with:` input; the
    // order they are tried in is shared with the CLI, in connection.ts.
    const connection = findConnectionString(loadFromEnvOrGHAInput, log);
    if (!connection) {
      throw new Error(`🚨 ${CONNECTION_ENV_VAR} not found. Cannot continue...`);
    }
    this.dbConnectionString = connection.value;

    this.command = core.getInput("command", { required: true });
    this.identifier = core.getInput("id", { required: true });
    // An unset or non-numeric input parses to NaN, which would otherwise flow
    // into every timeout - and NaN comparisons are all false, so a wait loop
    // built on one never ends.
    this.expiration = parseInt(core.getInput("expiration"));
    if (!Number.isFinite(this.expiration) || this.expiration <= 0) {
      this.expiration = DEFAULT_EXPIRATION_SECONDS;
    }
    this.reason = core.getInput("reason", { trimWhitespace: true });
    this.autoReleaseLock = core.getInput("auto-release") === "true";

    this.pollTimeoutMs = pollTimeoutMs(
      this.expiration,
      parseInt(core.getInput("max-wait")),
    );
    this.pollIntervalMs = pollIntervalMs(
      parseInt(core.getInput("poll-interval")),
    );
  }
}

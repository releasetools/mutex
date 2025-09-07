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

import * as core from "@actions/core";
import { loadRequiredFromEnvOrGHAInput } from "./helpers";

export class MutexSettings {
  dbConnectionString: string;
  command: string;
  identifier: string;
  expiration: number;
  reason: string;
  pollTimeoutMs: number;
  pollIntervalMs: number;
  autoReleaseLock: boolean;

  constructor() {
    this.dbConnectionString = loadRequiredFromEnvOrGHAInput("DATABASE_URL");
    this.command = core.getInput("command", { required: true });
    this.identifier = core.getInput("id", { required: true });
    this.expiration = parseInt(core.getInput("expiration"));
    this.reason = core.getInput("reason", { trimWhitespace: true });
    this.autoReleaseLock = core.getInput("auto-release") === "true";

    // Calculate timeout
    let maxWait = parseInt(core.getInput("max-wait"));
    if (isNaN(maxWait) || maxWait <= -2) {
      maxWait = -1;
    }
    this.pollTimeoutMs = (maxWait === -1 ? this.expiration : maxWait) * 1000;

    // Calculate polling interval
    let pollInterval = parseInt(core.getInput("poll-interval"));
    if (isNaN(pollInterval) || pollInterval <= 0) {
      pollInterval = 0;
    }
    this.pollIntervalMs = pollInterval * 1000;
  }
}

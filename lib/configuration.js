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
import { loadRequiredFromEnvOrGHAInput } from "./inputs.js";
/** Matches the `expiration` default declared in action.yaml. */
const DEFAULT_EXPIRATION_SECONDS = 60;
export class MutexSettings {
    dbConnectionString;
    command;
    identifier;
    expiration;
    reason;
    pollTimeoutMs;
    pollIntervalMs;
    autoReleaseLock;
    /**
     * The Action does not record an owner yet (see issue #67), so every lock it
     * takes is unowned - releasable by itself, and by any caller that likewise
     * names no owner.
     */
    owner = null;
    constructor() {
        this.dbConnectionString = loadRequiredFromEnvOrGHAInput("DATABASE_URL");
        this.command = core.getInput("command", { required: true });
        this.identifier = core.getInput("id", { required: true });
        // Guarded like max-wait and poll-interval below: an unset or non-numeric
        // input yields NaN, which would otherwise flow into every timeout.
        this.expiration = parseInt(core.getInput("expiration"));
        if (isNaN(this.expiration) || this.expiration <= 0) {
            this.expiration = DEFAULT_EXPIRATION_SECONDS;
        }
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
//# sourceMappingURL=configuration.js.map
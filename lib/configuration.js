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
exports.MutexSettings = void 0;
const core = __importStar(require("@actions/core"));
const helpers_1 = require("./helpers");
class MutexSettings {
    dbConnectionString;
    command;
    identifier;
    expiration;
    reason;
    pollTimeoutMs;
    pollIntervalMs;
    autoReleaseLock;
    constructor() {
        this.dbConnectionString = (0, helpers_1.loadRequiredFromEnvOrGHAInput)("DATABASE_URL");
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
exports.MutexSettings = MutexSettings;
//# sourceMappingURL=configuration.js.map
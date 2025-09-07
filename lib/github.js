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
exports.GitHubClient = void 0;
exports.isLockAcquired = isLockAcquired;
exports.setLockAcquired = setLockAcquired;
exports.setLockReleased = setLockReleased;
exports.setSkipped = setSkipped;
exports.setFailed = setFailed;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const helpers_1 = require("./helpers");
class GitHubClient {
    octokit;
    context;
    pr;
    owner;
    repo;
    constructor() {
        const token = (0, helpers_1.loadRequiredFromEnvOrGHAInput)("GITHUB_TOKEN");
        this.octokit = github.getOctokit(token);
        this.context = github.context;
        this.pr = github.context.payload.pull_request;
        this.owner = github.context.repo.owner;
        this.repo = github.context.repo.repo;
    }
}
exports.GitHubClient = GitHubClient;
// Retrieve lock state from GITHUB_STATE
function isLockAcquired() {
    return core.getState("lockAcquired") === "true";
}
// Set lock state in GITHUB_STATE
function setLockAcquired() {
    core.saveState("lockAcquired", "true");
    core.setOutput("status", "locked");
}
// Set lock state in GITHUB_STATE
function setLockReleased() {
    core.saveState("lockAcquired", null);
    core.setOutput("status", "released");
}
// Mark the action as skipped
function setSkipped() {
    core.setOutput("status", "skipped");
}
// Mark the action as skipped
function setFailed(message) {
    core.setFailed(message);
    core.setOutput("status", "failed");
}
//# sourceMappingURL=github.js.map
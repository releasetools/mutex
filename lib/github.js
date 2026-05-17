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
import * as github from "@actions/github";
import { loadRequiredFromEnvOrGHAInput } from "./helpers.js";
export class GitHubClient {
    octokit;
    context;
    pr;
    owner;
    repo;
    constructor() {
        const token = loadRequiredFromEnvOrGHAInput("GITHUB_TOKEN");
        this.octokit = github.getOctokit(token);
        this.context = github.context;
        this.pr = github.context.payload.pull_request;
        this.owner = github.context.repo.owner;
        this.repo = github.context.repo.repo;
    }
}
// Retrieve lock state from GITHUB_STATE
export function isLockAcquired() {
    return core.getState("lockAcquired") === "true";
}
// Set lock state in GITHUB_STATE
export function setLockAcquired() {
    core.saveState("lockAcquired", "true");
    core.setOutput("status", "locked");
}
// Set lock state in GITHUB_STATE
export function setLockReleased() {
    core.saveState("lockAcquired", null);
    core.setOutput("status", "released");
}
// Mark the action as skipped
export function setSkipped() {
    core.setOutput("status", "skipped");
}
// Mark the action as skipped
export function setFailed(message) {
    core.setFailed(message);
    core.setOutput("status", "failed");
}
//# sourceMappingURL=github.js.map
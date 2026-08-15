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
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import { SKIP_LABEL } from "./constants.js";
import { loadRequiredFromEnvOrGHAInput } from "./inputs.js";

export class GitHubClient {
  octokit: InstanceType<typeof GitHub>;
  context: typeof github.context;
  pr: typeof github.context.payload.pull_request;
  owner: string;
  repo: string;

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
export function isLockAcquired(): boolean {
  return core.getState("lockAcquired") === "true";
}

// Set lock state in GITHUB_STATE
export function setLockAcquired(): void {
  core.saveState("lockAcquired", "true");
  core.setOutput("status", "locked");
}

// Set lock state in GITHUB_STATE
export function setLockReleased(): void {
  core.saveState("lockAcquired", null);
  core.setOutput("status", "released");
}

/**
 * Publishes which build of the action actually ran.
 *
 * The release workflow asserts this against the tag being released: `uses:
 * releasetools/mutex@v1` resolves through GitHub's own caches, so waiting for
 * the tag to move cannot prove the runner was handed the new code. This can.
 */
export function setVersion(version: string): void {
  core.setOutput("version", version);
  core.info(`releasetools/mutex ${version}`);
}

// Mark the action as skipped
export function setSkipped(): void {
  core.setOutput("status", "skipped");
}

// Mark the action as skipped
export function setFailed(message: string): void {
  core.setFailed(message);
  core.setOutput("status", "failed");
}

// Determine if the action is allowed to run
export async function shouldRunAction(gh: GitHubClient): Promise<boolean> {
  if (checkSkipInEnv()) {
    // skip-tag found in env
    return false;
  }

  if (checkSkipInLabel(gh.pr)) {
    // skip-tag found in body
    return false;
  }

  if (await checkSkipInComment(gh.octokit, gh.owner, gh.repo, gh.pr)) {
    // skip-tag found in body
    return false;
  }

  if (checkSkipInBody(gh.pr)) {
    // skip-tag found in body
    return false;
  }

  return true;
}

function checkSkipInEnv(): boolean {
  if (process.env[SKIP_LABEL] === undefined) {
    return false;
  }

  core.warning(`Skipping execution: '${SKIP_LABEL}' found in environment.`);
  return true;
}

function checkSkipInLabel(
  pr: typeof github.context.payload.pull_request,
): boolean {
  if (!pr) {
    return false;
  }

  // If in a PR context, check for skip label
  const labels = pr.labels.map((label: { name: string }) => label.name);
  if (labels && labels.includes(SKIP_LABEL)) {
    core.warning(`Skipping execution: '${SKIP_LABEL}' label found.`);
    return true;
  }

  return false;
}

async function checkSkipInComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pr: typeof github.context.payload.pull_request,
): Promise<boolean> {
  if (!pr) {
    return false;
  }

  // Retrieve all comments on PR
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pr.number,
  });
  const skipCommentFound = comments.some(
    (comment: { body?: string | null }) => {
      if (!comment.body) {
        // Nothing to do if comment has no body
        return false;
      }

      // Find if any lines contain the skip label
      return comment.body
        .split(/\s+/)
        .some((word: string) => word === SKIP_LABEL);
    },
  );

  if (skipCommentFound) {
    core.warning(`Skipping execution: '${SKIP_LABEL}' comment found.`);
  }

  return skipCommentFound;
}

function checkSkipInBody(
  pr: typeof github.context.payload.pull_request,
): boolean {
  if (!pr) {
    return false;
  }

  // Check for skip in PR description
  if (pr.body && pr.body.split(/\s+/).some((word) => word === SKIP_LABEL)) {
    core.warning(`Skipping execution: '${SKIP_LABEL}' found in description.`);
    return true;
  }

  return false;
}

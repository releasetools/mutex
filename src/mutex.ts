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
import { MutexSettings } from "./configuration";
import {
  GitHubClient,
  setFailed,
  setLockAcquired,
  setLockReleased,
} from "./github";
import { sleep } from "./helpers";
import { SKIP_LABEL } from "./constants";
import { WebhookPayload } from "@actions/github/lib/interfaces";
import * as github from "@actions/github";
import { Notifications } from "./notifications";

export type LockResult = {
  acquired: boolean;
  status: string;
  expires?: string;
};

export interface MutexInterface {
  acquireLock(name: string, reason: string): Promise<LockResult>;
  releaseLock(name: string): Promise<boolean>;
}

export async function tryLock(
  settings: MutexSettings,
  gh: GitHubClient,
  mutex: MutexInterface,
  notifications: Notifications,
): Promise<void> {
  core.info(
    `Attempting to acquire lock. Timeout: ${settings.pollTimeoutMs / 1000}s`,
  );

  const startTime = Date.now();
  while (Date.now() - startTime < settings.pollTimeoutMs) {
    core.info(`Acquiring lock '${settings.identifier}'...`);

    const { acquired, status, expires } = await mutex.acquireLock(
      settings.identifier,
      settings.reason,
    );

    if (acquired) {
      setLockAcquired();

      const commentBody = `🔒 Lock \`${settings.identifier}\` acquired.\nReason: \`${settings.reason || "N/A"}\`\nThis lock will expire at \`${expires}\`.`;
      notifications.send(commentBody);

      return;
    }

    core.info(
      `Waiting for existing lock _${settings.identifier}_ to expire.\nStatus: ${status || "N/A"})\n\nRetrying in ${settings.pollIntervalMs / 1000}s}...`,
    );

    await sleep(settings.pollIntervalMs);
  }

  setFailed(
    `⌛ Timed out waiting for lock after ${settings.pollTimeoutMs / 1000} seconds.`,
  );
}

export async function tryRelease(
  settings: MutexSettings,
  gh: GitHubClient,
  mutex: MutexInterface,
  notifications: Notifications,
): Promise<void> {
  core.info(
    `Attempting to release lock. Timeout: ${settings.pollTimeoutMs / 1000}s`,
  );

  const startTime = Date.now();
  while (Date.now() - startTime < settings.pollTimeoutMs) {
    core.info(`Releasing lock '${settings.identifier}'...`);

    const released = await mutex.releaseLock(settings.identifier);

    if (released) {
      setLockReleased();

      const commentBody = `🔓 Lock \`${settings.identifier}\` released.`;
      notifications.send(commentBody);

      return;
    }

    core.info(
      `Retrying to release lock '${settings.identifier}' in ${settings.pollIntervalMs / 1000}s}...`,
    );

    await sleep(settings.pollIntervalMs);
  }

  setFailed(
    `⌛ Timed out waiting to release lock after ${settings.pollTimeoutMs / 1000} seconds.`,
  );
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
  pr: WebhookPayload["pull_request"] | undefined,
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
  pr: WebhookPayload["pull_request"] | undefined,
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
  const skipCommentFound = comments.some((comment) => {
    if (!comment.body) {
      // Nothing to do if comment has no body
      return false;
    }

    // Find if any lines contain the skip label
    return comment.body.split(/\s+/).some((word) => word === SKIP_LABEL);
  });

  if (skipCommentFound) {
    core.warning(`Skipping execution: '${SKIP_LABEL}' comment found.`);
  }

  return skipCommentFound;
}

function checkSkipInBody(
  pr: WebhookPayload["pull_request"] | undefined,
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

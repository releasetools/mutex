import * as core from "@actions/core";
import * as github from "@actions/github";
import { WebhookPayload } from "@actions/github/lib/interfaces";
import { GitHub } from "@actions/github/lib/utils";
import { SKIP_LABEL } from "./constants";
import { loadRequiredFromEnvOrGHAInput } from "./helpers";

export class GitHubClient {
  octokit: InstanceType<typeof GitHub>;
  context: typeof github.context;
  pr: WebhookPayload["pull_request"] | undefined;
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

// Mark the action as skipped
export function setSkipped(): void {
  core.setOutput("status", "skipped");
}

// Mark the action as skipped
export function setFailed(message: string): void {
  core.setFailed(message);
  core.setOutput("status", "failed");
}

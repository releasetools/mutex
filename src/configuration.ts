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

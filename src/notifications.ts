import { MutexSettings } from "./configuration";
import { GitHubClient } from "./github";
import { SlackClient } from "./slack";
import * as core from "@actions/core";

export class Notifications {
  private settings: MutexSettings;
  private slack: SlackClient;
  private gh: GitHubClient;
  private updatePullRequests: boolean;

  constructor(settings: MutexSettings, gh: GitHubClient) {
    this.settings = settings;
    this.gh = gh;
    this.slack = new SlackClient(settings);

    this.updatePullRequests = core.getInput("disable-pr-updates") !== "true";
  }

  async send(message: string): Promise<number> {
    let sent: number = 0;
    core.info(message);
    sent++;

    if (this.updatePullRequests && this.gh.pr) {
      const response = await this.gh.octokit.rest.issues.createComment({
        owner: this.gh.owner,
        repo: this.gh.repo,
        issue_number: this.gh.pr?.number,
        body: message,
      });
      if (response.status >= 200 && response.status < 300) {
        sent++;
      }
    }

    if (await this.slack.postMessage(message)) {
      sent++;
    }

    return sent;
  }
}

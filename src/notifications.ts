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

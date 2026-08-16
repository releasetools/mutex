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

import { WebClient } from "@slack/web-api";
import * as core from "@actions/core";
import { MutexSettings } from "./configuration.js";
import { logError } from "./helpers.js";
import { loadFromEnvOrGHAInput } from "./inputs.js";
import { ActionsLogger } from "./actions-logger.js";

export class SlackClient {
  private settings: MutexSettings;
  private slack: WebClient | null;
  private channel: string;

  /**
   * `slack-channel` is the switch. Leaving it out means nobody asked for
   * Slack, so nothing is said: a workflow that never wanted notifications is
   * not misconfigured, and warning at it buries the case that is. A channel
   * with no token is the real mistake, and that still warns.
   *
   * It also means a `SLACK_BOT_TOKEN` inherited from job-level `env:` no
   * longer decides anything. It used to, and a step with no channel then
   * failed the whole job.
   */
  constructor(settings: MutexSettings) {
    this.settings = settings;
    this.channel = core.getInput("slack-channel").trim();

    const token = this.channel
      ? loadFromEnvOrGHAInput("SLACK_BOT_TOKEN")
      : null;
    if (this.channel && !token) {
      core.warning(
        `⚠️ slack-channel is '${this.channel}' but SLACK_BOT_TOKEN is not set. Slack notifications disabled.`,
      );
    }

    this.slack = token ? new WebClient(token) : null;
  }

  async postMessage(text: string): Promise<boolean> {
    if (!this.slack) {
      return false;
    }

    try {
      // https://docs.slack.dev/reference/methods/chat.postMessage/#channels
      await this.slack.chat.postMessage({
        channel: this.channel,
        text: text,
      });
      core.info(`Slack message posted to ${this.channel}`);
      return true;
    } catch (error) {
      logError(
        new ActionsLogger(),
        error,
        `Failed posting Slack message to ${this.channel}`,
      );
    }
    return false;
  }
}

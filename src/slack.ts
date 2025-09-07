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

import { WebClient } from "@slack/web-api";
import * as core from "@actions/core";
import { MutexSettings } from "./configuration";
import {
  loadFromEnvOrGHAInput,
  loadRequiredNonEmptyFromGHAInput,
  printError,
} from "./helpers";

export class SlackClient {
  private settings: MutexSettings;
  private slack: WebClient | null;
  private channel: string = ""; // Initialized later if SLACK_BOT_TOKEN is provided

  constructor(settings: MutexSettings) {
    this.settings = settings;
    this.slack = this.initializeClient();

    if (this.slack) {
      this.channel = loadRequiredNonEmptyFromGHAInput("slack-channel");
    }
  }

  private initializeClient(): WebClient | null {
    const token = loadFromEnvOrGHAInput("SLACK_BOT_TOKEN");
    if (!token) {
      core.warning(
        "⚠️ Slack bot token not found. Slack notifications disabled.",
      );
      return null;
    }

    return new WebClient(token);
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
      printError(error, `Failed posting Slack message to ${this.channel}`);
    }
    return false;
  }
}

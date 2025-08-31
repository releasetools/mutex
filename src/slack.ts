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

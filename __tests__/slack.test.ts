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

import { jest } from "@jest/globals";

type AnyFn = (...args: unknown[]) => unknown;

const core = {
  getInput: jest.fn<AnyFn>(),
  warning: jest.fn<AnyFn>(),
  info: jest.fn<AnyFn>(),
  error: jest.fn<AnyFn>(),
  debug: jest.fn<AnyFn>(),
};

const postMessage = jest.fn<AnyFn>();
const WebClient = jest.fn<AnyFn>(() => ({ chat: { postMessage } }));

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@slack/web-api", () => ({ WebClient }));

const { SlackClient } = await import("../src/slack.js");

/**
 * Whether Slack is on is decided by `slack-channel` alone. The token only
 * decides whether a channel that was asked for can be reached.
 */
describe("SlackClient", () => {
  const settings = {} as never;

  const configure = ({
    channel,
    token,
  }: {
    channel?: string;
    token?: string;
  }) => {
    core.getInput.mockImplementation((name) =>
      name === "slack-channel" ? (channel ?? "") : "",
    );
    if (token === undefined) {
      delete process.env.SLACK_BOT_TOKEN;
    } else {
      process.env.SLACK_BOT_TOKEN = token;
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SLACK_BOT_TOKEN;
  });

  afterAll(() => {
    delete process.env.SLACK_BOT_TOKEN;
  });

  /**
   * The case this was written for: three of the six action steps in CI say
   * nothing about Slack, and every one of them used to log a ⚠️.
   */
  it("says nothing when no channel was asked for", () => {
    configure({});
    const client = new SlackClient(settings);

    expect(core.warning).not.toHaveBeenCalled();
    expect(WebClient).not.toHaveBeenCalled();
    expect(client).toBeDefined();
  });

  it("still says nothing when a token is around but no channel is", () => {
    // A SLACK_BOT_TOKEN inherited from job-level env: used to make this step
    // fail outright, because the channel was then read as required.
    configure({ token: "xoxb-inherited" });

    expect(() => new SlackClient(settings)).not.toThrow();
    expect(core.warning).not.toHaveBeenCalled();
    expect(WebClient).not.toHaveBeenCalled();
  });

  it("warns when a channel was asked for and the token is missing", () => {
    configure({ channel: "C09CF3TR60P" });
    new SlackClient(settings);

    expect(core.warning).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("C09CF3TR60P"),
    );
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("SLACK_BOT_TOKEN"),
    );
    expect(WebClient).not.toHaveBeenCalled();
  });

  it("treats a blank channel as no channel", () => {
    configure({ channel: "   " });
    new SlackClient(settings);

    expect(core.warning).not.toHaveBeenCalled();
  });

  it("builds a client when both are set", () => {
    configure({ channel: "C09CF3TR60P", token: "xoxb-real" });
    new SlackClient(settings);

    expect(core.warning).not.toHaveBeenCalled();
    expect(WebClient).toHaveBeenCalledWith("xoxb-real");
  });

  it("posts to the configured channel", async () => {
    configure({ channel: "C09CF3TR60P", token: "xoxb-real" });
    const client = new SlackClient(settings);

    await expect(client.postMessage("locked")).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledWith({
      channel: "C09CF3TR60P",
      text: "locked",
    });
  });

  it("reports nothing posted when Slack is off", async () => {
    configure({});
    const client = new SlackClient(settings);

    await expect(client.postMessage("locked")).resolves.toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });
});

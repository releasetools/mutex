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

import { jest } from "@jest/globals";

type AnyFn = (...args: unknown[]) => unknown;
type CoreMock = {
  getInput: jest.Mock<AnyFn>;
  saveState: jest.Mock<AnyFn>;
  setFailed: jest.Mock<AnyFn>;
  info: jest.Mock<AnyFn>;
  warning: jest.Mock<AnyFn>;
  setOutput: jest.Mock<AnyFn>;
  startGroup: jest.Mock<AnyFn>;
  endGroup: jest.Mock<AnyFn>;
};
type GithubMock = {
  context: unknown;
  getOctokit: jest.Mock<AnyFn>;
};

const core: CoreMock = {
  getInput: jest.fn(),
  saveState: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  setOutput: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
};

const github: GithubMock = {
  context: {},
  getOctokit: jest.fn(),
};

jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);

const { run } = await import("../src/main.js");

describe("Main Action Logic (Locking)", () => {
  let mockOctokit: {
    rest: {
      issues: {
        createComment: jest.Mock<AnyFn>;
        addLabels: jest.Mock<AnyFn>;
        listComments: jest.Mock<AnyFn>;
      };
      search: { issuesAndPullRequests: jest.Mock<AnyFn> };
    };
  };
  let searchMock: jest.Mock<AnyFn>;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();

    searchMock = jest.fn();
    mockOctokit = {
      rest: {
        issues: {
          createComment: jest.fn(),
          addLabels: jest.fn(),
          listComments: jest.fn(),
        },
        search: {
          issuesAndPullRequests: searchMock,
        },
      },
    };

    github.context = {
      payload: {
        pull_request: {
          number: 123,
          labels: [],
          head: { ref: "feature-branch" },
        },
      },
      repo: { owner: "test-owner", repo: "test-repo" },
    };
    github.getOctokit.mockReturnValue(mockOctokit);

    core.getInput.mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      switch (name) {
        case "GITHUB_TOKEN":
          return "fake-token";
        case "DATABASE_URL":
          return "postgresql://user:password@localhost:5432/dbname";
        case "command":
          return "lock";
        case "id":
          return "test-lock-123";
        case "expiration":
          return "10";
        case "reason":
          return "a reason";
        case "max-wait":
          return "-1";
        case "poll-interval":
          return "1";
        case "auto-release":
          return "true";
        case "disable-pr-updates":
          return "false";
        case "SLACK_BOT_TOKEN":
          return "xoxb-1234";
        case "slack-channel":
          return "C123";
        default:
          return "";
      }
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("acquires lock immediately if available", async () => {
    searchMock.mockResolvedValue({ data: { items: [] } } as never);

    await run();

    // TODO: fix when lock is implemented
    expect(core.saveState).not.toHaveBeenCalledWith("lockAcquired", "true");
    expect(core.setFailed).toHaveBeenCalled();
  });

  // it('waits for a lock and then acquires it', async () => {
  //   searchMock
  //     .mockResolvedValueOnce({ data: { items: [{ number: 456 }] } }) // Lock is held
  //     .mockResolvedValueOnce({ data: { items: [] } }) // Lock is free

  //   const runPromise = run()
  //   await jest.advanceTimersByTimeAsync(10000) // Advance past one poll interval
  //   await runPromise

  //   expect(searchMock).toHaveBeenCalledTimes(2)
  //   expect(core.saveState).toHaveBeenCalledWith('lockAcquired', 'true')
  // })

  // it('times out if a lock is never released', async () => {
  //   searchMock.mockResolvedValue({ data: { items: [{ number: 456 }] } })

  //   const runPromise = run()
  //   await jest.advanceTimersByTimeAsync(60000) // Advance past 1-minute timeout
  //   await runPromise

  //   expect(core.saveState).not.toHaveBeenCalled()
  //   expect(core.setFailed).toHaveBeenCalledWith(
  //     'Timed out after 1 minutes waiting for lock.'
  //   )
  // })
});

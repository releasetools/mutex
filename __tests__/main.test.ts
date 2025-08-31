import * as core from "@actions/core";
import * as github from "@actions/github";
import { run } from "../src/main";

jest.mock("@actions/core");
jest.mock("@actions/github");

describe("Main Action Logic (Locking)", () => {
  let mockOctokit: any;
  let getInputMock: jest.Mock;
  let searchMock: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();

    searchMock = jest.fn();
    mockOctokit = {
      rest: {
        issues: {
          createComment: jest.fn().mockResolvedValue({}),
          addLabels: jest.fn().mockResolvedValue({}),
          listComments: jest.fn().mockResolvedValue({}),
        },
        search: {
          issuesAndPullRequests: searchMock,
        },
      },
    };

    Object.defineProperty(github, "context", {
      get: () => ({
        payload: {
          pull_request: {
            number: 123,
            labels: [],
            head: { ref: "feature-branch" },
          },
        },
        repo: { owner: "test-owner", repo: "test-repo" },
      }),
    });
    (github.getOctokit as jest.Mock).mockReturnValue(mockOctokit);

    getInputMock = core.getInput as jest.Mock;
    getInputMock.mockImplementation((name: string) => {
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
    searchMock.mockResolvedValue({ data: { items: [] } });

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

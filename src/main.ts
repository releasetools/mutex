import * as core from "@actions/core";
import { MutexSettings } from "./configuration";
import { GitHubClient, setFailed, setSkipped } from "./github";
import { DatabaseMutex } from "./database";
import { shouldRunAction, tryLock, tryRelease } from "./mutex";
import { Notifications } from "./notifications";

export async function run(): Promise<void> {
  try {
    const gh = new GitHubClient();
    if (!(await shouldRunAction(gh))) {
      setSkipped();
      return;
    }

    const settings = new MutexSettings();
    const mutex = new DatabaseMutex(settings);
    const notifications = new Notifications(settings, gh);

    if (settings.command === "lock") {
      await tryLock(settings, gh, mutex, notifications);
    } else if (settings.command === "release") {
      await tryRelease(settings, gh, mutex, notifications);
    } else {
      throw new Error(`Unknown action: ${settings.command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setFailed(message);
  }
}

run();

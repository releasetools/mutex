import * as core from "@actions/core";
import { GitHubClient, setFailed, setSkipped } from "./github";
import { MutexSettings } from "./configuration";
import { DatabaseMutex } from "./database";
import { shouldRunAction, tryRelease } from "./mutex";
import { Notifications } from "./notifications";

export async function post(): Promise<void> {
  try {
    core.info("Running post-job cleanup step.");

    const gh = new GitHubClient();
    if (!(await shouldRunAction(gh))) {
      setSkipped();
      return;
    }

    const lockAcquired = core.getState("lockAcquired");
    if (lockAcquired !== "true") {
      core.warning(
        `No lock was acquired in the main step. Nothing to release.`,
      );
      return;
    }

    const settings = new MutexSettings();
    if (settings.autoReleaseLock !== true) {
      core.warning(
        `⚠️ Auto-releasing is disabled. Lock '${settings.identifier}' will not be released.`,
      );
      return;
    }

    const mutex = new DatabaseMutex(settings);
    const notifications = new Notifications(settings, gh);

    await tryRelease(settings, gh, mutex, notifications);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setFailed(message);
  }
}

post();

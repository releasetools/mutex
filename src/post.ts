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

import * as core from "@actions/core";
import {
  GitHubClient,
  setFailed,
  setLockReleased,
  setSkipped,
  shouldRunAction,
} from "./github.js";
import { MutexSettings } from "./configuration.js";
import { DatabaseMutex } from "./database.js";
import { tryUnlock } from "./mutex.js";
import { Notifications } from "./notifications.js";
import { ActionsLogger } from "./actions-logger.js";
import { describeError } from "./helpers.js";

export async function post(): Promise<void> {
  const log = new ActionsLogger();
  let mutex: DatabaseMutex | undefined;

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

    mutex = new DatabaseMutex(settings, log);
    const notifications = new Notifications(settings, gh);

    await tryUnlock(settings, mutex, log, {
      onUnlocked: async () => {
        setLockReleased();
        await notifications.send(
          `🔓 Lock \`${settings.identifier}\` released.`,
        );
      },
      onRefused: () =>
        setFailed(
          `🔒 Lock '${settings.identifier}' is held by another owner and was not released.`,
        ),
      onTimeout: (message) => setFailed(message),
    });
  } catch (error) {
    setFailed(describeError(error));
  } finally {
    await mutex?.close();
  }
}

post();

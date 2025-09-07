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

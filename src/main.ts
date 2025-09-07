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

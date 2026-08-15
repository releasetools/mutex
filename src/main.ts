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
import { MutexSettings } from "./configuration.js";
import {
  GitHubClient,
  setFailed,
  setLockAcquired,
  setLockReleased,
  setSkipped,
  shouldRunAction,
} from "./github.js";
import { DatabaseMutex } from "./database.js";
import { tryLock, tryUnlock } from "./mutex.js";
import { Notifications } from "./notifications.js";
import { ActionsLogger } from "./actions-logger.js";
import { describeError } from "./helpers.js";

export async function run(): Promise<void> {
  const log = new ActionsLogger();
  let mutex: DatabaseMutex | undefined;

  try {
    const gh = new GitHubClient();
    if (!(await shouldRunAction(gh))) {
      setSkipped();
      return;
    }

    const settings = new MutexSettings();
    mutex = new DatabaseMutex(settings, log);
    const notifications = new Notifications(settings, gh);

    if (settings.command === "lock") {
      await tryLock(settings, mutex, log, {
        onLocked: async (result) => {
          setLockAcquired();
          await notifications.send(
            `🔒 Lock \`${settings.identifier}\` acquired.\n` +
              `Reason: \`${settings.reason || "N/A"}\`\n` +
              `This lock will expire at \`${result.expires}\`.`,
          );
        },
        onTimeout: (message) => setFailed(message),
      });
    } else if (
      settings.command === "unlock" ||
      settings.command === "release"
    ) {
      if (settings.command === "release") {
        // Deprecated, not removed: it has been this input's value since v1, so
        // dropping it would break every workflow written against that.
        core.warning(
          "⚠️ command: 'release' is deprecated; use 'unlock' instead.",
        );
      }

      await tryUnlock(settings, mutex, log, {
        onUnlocked: async () => {
          setLockReleased();
          await notifications.send(
            `🔓 Lock \`${settings.identifier}\` released.`,
          );
        },
        onTimeout: (message) => setFailed(message),
      });
    } else {
      throw new Error(`Unknown action: ${settings.command}`);
    }
  } catch (error) {
    setFailed(describeError(error));
  } finally {
    await mutex?.close();
  }
}

run();

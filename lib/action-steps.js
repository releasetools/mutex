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
import { setFailed, setLockAcquired, setLockReleased } from "./github.js";
import { tryLock, tryUnlock, } from "./mutex.js";
/**
 * The Action's two steps.
 *
 * Both live here because `main.ts` and `post.ts` release identically - the
 * post step is the same operation, just reached by a different route - and
 * keeping one copy is what stops the two drifting apart. The CLI has no use
 * for either: they record job state and post notifications.
 */
/** Take the lock, record it in job state, and announce it. */
export async function acquireAndAnnounce(settings, mutex, log, notifications) {
    return tryLock(settings, mutex, log, {
        onLocked: async (result) => {
            setLockAcquired();
            await notifications.send(`🔒 Lock \`${settings.identifier}\` acquired.\n` +
                `Reason: \`${settings.reason || "N/A"}\`\n` +
                `This lock will expire at \`${result.expires}\`.`);
        },
        onTimeout: (message) => setFailed(message),
    });
}
/**
 * Hand the lock back, clear the job state, and announce it.
 *
 * A refusal fails the step rather than passing quietly: the lock is still held
 * by somebody, and a green step with `status` unset would let a downstream
 * `if: steps.mutex.outputs.status == 'released'` skip without anyone noticing.
 */
export async function releaseAndAnnounce(settings, mutex, log, notifications) {
    return tryUnlock(settings, mutex, log, {
        onUnlocked: async () => {
            setLockReleased();
            await notifications.send(`🔓 Lock \`${settings.identifier}\` released.`);
        },
        onRefused: () => setFailed(`🔒 Lock '${settings.identifier}' is held by another owner and was not released.`),
        onTimeout: (message) => setFailed(message),
    });
}
//# sourceMappingURL=action-steps.js.map
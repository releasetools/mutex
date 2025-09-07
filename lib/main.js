"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const configuration_1 = require("./configuration");
const github_1 = require("./github");
const database_1 = require("./database");
const mutex_1 = require("./mutex");
const notifications_1 = require("./notifications");
async function run() {
    try {
        const gh = new github_1.GitHubClient();
        if (!(await (0, mutex_1.shouldRunAction)(gh))) {
            (0, github_1.setSkipped)();
            return;
        }
        const settings = new configuration_1.MutexSettings();
        const mutex = new database_1.DatabaseMutex(settings);
        const notifications = new notifications_1.Notifications(settings, gh);
        if (settings.command === "lock") {
            await (0, mutex_1.tryLock)(settings, gh, mutex, notifications);
        }
        else if (settings.command === "release") {
            await (0, mutex_1.tryRelease)(settings, gh, mutex, notifications);
        }
        else {
            throw new Error(`Unknown action: ${settings.command}`);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        (0, github_1.setFailed)(message);
    }
}
run();
//# sourceMappingURL=main.js.map
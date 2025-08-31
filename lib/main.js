"use strict";
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
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.post = post;
const core = __importStar(require("@actions/core"));
const github_1 = require("./github");
const configuration_1 = require("./configuration");
const database_1 = require("./database");
const mutex_1 = require("./mutex");
const notifications_1 = require("./notifications");
async function post() {
    try {
        core.info("Running post-job cleanup step.");
        const gh = new github_1.GitHubClient();
        if (!(await (0, mutex_1.shouldRunAction)(gh))) {
            (0, github_1.setSkipped)();
            return;
        }
        const lockAcquired = core.getState("lockAcquired");
        if (lockAcquired !== "true") {
            core.warning(`No lock was acquired in the main step. Nothing to release.`);
            return;
        }
        const settings = new configuration_1.MutexSettings();
        if (settings.autoReleaseLock !== true) {
            core.warning(`⚠️ Auto-releasing is disabled. Lock '${settings.identifier}' will not be released.`);
            return;
        }
        const mutex = new database_1.DatabaseMutex(settings);
        const notifications = new notifications_1.Notifications(settings, gh);
        await (0, mutex_1.tryRelease)(settings, gh, mutex, notifications);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        (0, github_1.setFailed)(message);
    }
}
post();
//# sourceMappingURL=post.js.map
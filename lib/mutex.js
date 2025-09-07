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
exports.tryLock = tryLock;
exports.tryRelease = tryRelease;
exports.shouldRunAction = shouldRunAction;
const core = __importStar(require("@actions/core"));
const github_1 = require("./github");
const helpers_1 = require("./helpers");
const constants_1 = require("./constants");
async function tryLock(settings, gh, mutex, notifications) {
    core.info(`Attempting to acquire lock. Timeout: ${settings.pollTimeoutMs / 1000}s`);
    const startTime = Date.now();
    while (Date.now() - startTime < settings.pollTimeoutMs) {
        core.info(`Acquiring lock '${settings.identifier}'...`);
        const { acquired, status, expires } = await mutex.acquireLock(settings.identifier, settings.reason);
        if (acquired) {
            (0, github_1.setLockAcquired)();
            const commentBody = `🔒 Lock \`${settings.identifier}\` acquired.\nReason: \`${settings.reason || "N/A"}\`\nThis lock will expire at \`${expires}\`.`;
            notifications.send(commentBody);
            return;
        }
        core.info(`Waiting for existing lock _${settings.identifier}_ to expire.\nStatus: ${status || "N/A"})\n\nRetrying in ${settings.pollIntervalMs / 1000}s}...`);
        await (0, helpers_1.sleep)(settings.pollIntervalMs);
    }
    (0, github_1.setFailed)(`⌛ Timed out waiting for lock after ${settings.pollTimeoutMs / 1000} seconds.`);
}
async function tryRelease(settings, gh, mutex, notifications) {
    core.info(`Attempting to release lock. Timeout: ${settings.pollTimeoutMs / 1000}s`);
    const startTime = Date.now();
    while (Date.now() - startTime < settings.pollTimeoutMs) {
        core.info(`Releasing lock '${settings.identifier}'...`);
        const released = await mutex.releaseLock(settings.identifier);
        if (released) {
            (0, github_1.setLockReleased)();
            const commentBody = `🔓 Lock \`${settings.identifier}\` released.`;
            notifications.send(commentBody);
            return;
        }
        core.info(`Retrying to release lock '${settings.identifier}' in ${settings.pollIntervalMs / 1000}s}...`);
        await (0, helpers_1.sleep)(settings.pollIntervalMs);
    }
    (0, github_1.setFailed)(`⌛ Timed out waiting to release lock after ${settings.pollTimeoutMs / 1000} seconds.`);
}
// Determine if the action is allowed to run
async function shouldRunAction(gh) {
    if (checkSkipInEnv()) {
        // skip-tag found in env
        return false;
    }
    if (checkSkipInLabel(gh.pr)) {
        // skip-tag found in body
        return false;
    }
    if (await checkSkipInComment(gh.octokit, gh.owner, gh.repo, gh.pr)) {
        // skip-tag found in body
        return false;
    }
    if (checkSkipInBody(gh.pr)) {
        // skip-tag found in body
        return false;
    }
    return true;
}
function checkSkipInEnv() {
    if (process.env[constants_1.SKIP_LABEL] === undefined) {
        return false;
    }
    core.warning(`Skipping execution: '${constants_1.SKIP_LABEL}' found in environment.`);
    return true;
}
function checkSkipInLabel(pr) {
    if (!pr) {
        return false;
    }
    // If in a PR context, check for skip label
    const labels = pr.labels.map((label) => label.name);
    if (labels && labels.includes(constants_1.SKIP_LABEL)) {
        core.warning(`Skipping execution: '${constants_1.SKIP_LABEL}' label found.`);
        return true;
    }
    return false;
}
async function checkSkipInComment(octokit, owner, repo, pr) {
    if (!pr) {
        return false;
    }
    // Retrieve all comments on PR
    const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: pr.number,
    });
    const skipCommentFound = comments.some((comment) => {
        if (!comment.body) {
            // Nothing to do if comment has no body
            return false;
        }
        // Find if any lines contain the skip label
        return comment.body.split(/\s+/).some((word) => word === constants_1.SKIP_LABEL);
    });
    if (skipCommentFound) {
        core.warning(`Skipping execution: '${constants_1.SKIP_LABEL}' comment found.`);
    }
    return skipCommentFound;
}
function checkSkipInBody(pr) {
    if (!pr) {
        return false;
    }
    // Check for skip in PR description
    if (pr.body && pr.body.split(/\s+/).some((word) => word === constants_1.SKIP_LABEL)) {
        core.warning(`Skipping execution: '${constants_1.SKIP_LABEL}' found in description.`);
        return true;
    }
    return false;
}
//# sourceMappingURL=mutex.js.map
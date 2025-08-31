"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryLock = tryLock;
exports.tryRelease = tryRelease;
const core = __importStar(require("@actions/core"));
async function tryLock(settings, gh, mutex) {
  core.info(
    `Attempting to acquire lock. Timeout: ${settings.timeoutMs / 1000}s`,
  );
  const startTime = Date.now();
  while (Date.now() - startTime < settings.timeoutMs) {
    core.info(`Acquiring lock '${settings.lockName}'...`);
    const expiry = new Date(Date.now() + settings.lockDuration * 1000);
    const { acquired, status } = await mutex.acquireLock(
      settings.lockName,
      settings.reason,
    );
    if (acquired) {
      core.info(
        `🔒 Lock '${settings.lockName}' acquired. This lock will expire at ${expiry.toUTCString()}.`,
      );
      if (gh.pr && settings.postStatusUpdate) {
        const commentBody = `🔒 **Lock \`${settings.lockName}\` acquired**.\nReason: \`${settings.reason || "N/A"}\`\nThis lock will expire at \`${expiry.toUTCString()}\`.`;
        await gh.octokit.rest.issues.createComment({
          owner: gh.owner,
          repo: gh.repo,
          issue_number: gh.pr?.number,
          body: commentBody,
        });
      }
      // Signal that the lock was acquired
      gh.setLockAcquired();
      return;
    }
    core.info(
      `Waiting for existing lock _${settings.lockName}_ to expire.\nStatus: ${status || "N/A"})\n\nRetrying in ${settings.pollIntervalMs / 1000}s}...`,
    );
    await sleep(settings.pollIntervalMs);
  }
  core.setFailed(
    `Timed out waiting for lock after ${settings.timeoutMs / 1000} seconds.`,
  );
}
async function tryRelease(settings, gh, mutex) {
  core.info(
    `Attempting to release lock. Timeout: ${settings.timeoutMs / 1000}s`,
  );
  const startTime = Date.now();
  while (Date.now() - startTime < settings.timeoutMs) {
    core.info(`Releasing lock '${settings.lockName}'...`);
    const released = await mutex.releaseLock(settings.lockName);
    if (released) {
      core.info(`✅ Lock '${settings.lockName}' released.`);
      if (gh.pr && settings.postStatusUpdate) {
        const commentBody = `✅ **Lock \`${settings.lockName}\` released**.`;
        await gh.octokit.rest.issues.createComment({
          owner: gh.owner,
          repo: gh.repo,
          issue_number: gh.pr?.number,
          body: commentBody,
        });
      }
      // Signal that the lock was released
      gh.setLockReleased();
      return;
    }
    core.info(
      `Retrying to release lock '${settings.lockName}' in ${settings.pollIntervalMs / 1000}s}...`,
    );
    await sleep(settings.pollIntervalMs);
  }
  core.setFailed(
    `Timed out waiting to release lock after ${settings.timeoutMs / 1000} seconds.`,
  );
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
//# sourceMappingURL=logic.js.map

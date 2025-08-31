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
exports.Notifications = void 0;
const slack_1 = require("./slack");
const core = __importStar(require("@actions/core"));
class Notifications {
    settings;
    slack;
    gh;
    updatePullRequests;
    constructor(settings, gh) {
        this.settings = settings;
        this.gh = gh;
        this.slack = new slack_1.SlackClient(settings);
        this.updatePullRequests = core.getInput("disable-pr-updates") !== "true";
    }
    async send(message) {
        let sent = 0;
        core.info(message);
        sent++;
        if (this.updatePullRequests && this.gh.pr) {
            const response = await this.gh.octokit.rest.issues.createComment({
                owner: this.gh.owner,
                repo: this.gh.repo,
                issue_number: this.gh.pr?.number,
                body: message,
            });
            if (response.status >= 200 && response.status < 300) {
                sent++;
            }
        }
        if (await this.slack.postMessage(message)) {
            sent++;
        }
        return sent;
    }
}
exports.Notifications = Notifications;
//# sourceMappingURL=notifications.js.map
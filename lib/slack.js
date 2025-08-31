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
exports.SlackClient = void 0;
const web_api_1 = require("@slack/web-api");
const core = __importStar(require("@actions/core"));
const helpers_1 = require("./helpers");
class SlackClient {
    settings;
    slack;
    channel = ""; // Initialized later if SLACK_BOT_TOKEN is provided
    constructor(settings) {
        this.settings = settings;
        this.slack = this.initializeClient();
        if (this.slack) {
            this.channel = (0, helpers_1.loadRequiredNonEmptyFromGHAInput)("slack-channel");
        }
    }
    initializeClient() {
        const token = (0, helpers_1.loadFromEnvOrGHAInput)("SLACK_BOT_TOKEN");
        if (!token) {
            core.warning("⚠️ Slack bot token not found. Slack notifications disabled.");
            return null;
        }
        return new web_api_1.WebClient(token);
    }
    async postMessage(text) {
        if (!this.slack) {
            return false;
        }
        try {
            // https://docs.slack.dev/reference/methods/chat.postMessage/#channels
            await this.slack.chat.postMessage({
                channel: this.channel,
                text: text,
            });
            core.info(`Slack message posted to ${this.channel}`);
            return true;
        }
        catch (error) {
            (0, helpers_1.printError)(error, `Failed posting Slack message to ${this.channel}`);
        }
        return false;
    }
}
exports.SlackClient = SlackClient;
//# sourceMappingURL=slack.js.map
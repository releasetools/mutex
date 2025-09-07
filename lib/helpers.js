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
exports.sleep = void 0;
exports.loadRequiredNonEmptyFromGHAInput = loadRequiredNonEmptyFromGHAInput;
exports.loadRequiredFromEnvOrGHAInput = loadRequiredFromEnvOrGHAInput;
exports.loadFromEnvOrGHAInput = loadFromEnvOrGHAInput;
exports.printError = printError;
exports.printWarning = printWarning;
const core = __importStar(require("@actions/core"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;
function loadRequiredNonEmptyFromGHAInput(name) {
    const data = core.getInput(name);
    if (data && data.trim().length > 0) {
        return data;
    }
    throw new Error(`🚨 ${name} not found or empty. Cannot continue...`);
}
function loadRequiredFromEnvOrGHAInput(name) {
    const token = process.env[name] || core.getInput(name);
    if (token) {
        return token;
    }
    throw new Error(`🚨 ${name} not found. Cannot continue...`);
}
function loadFromEnvOrGHAInput(name) {
    const token = process.env[name] || core.getInput(name);
    if (token) {
        return token;
    }
    core.warning(`⚠️ ${name} not found.`);
    return null;
}
function printError(error, description) {
    const message = error instanceof Error ? error.message : String(error);
    core.error(`${description + ": " || ""}${message}`);
    core.debug(`Stack trace: ${error instanceof Error ? error.stack : "N/A"}`);
}
function printWarning(error, description) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`${description + ": " || ""}${message}`);
    core.debug(`Stack trace: ${error instanceof Error ? error.stack : "N/A"}`);
}
//# sourceMappingURL=helpers.js.map
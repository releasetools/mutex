/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import net from "node:net";
import os from "node:os";
import { DEFAULT_REQUEST_TIMEOUT_MS, MAX_MESSAGE_BYTES, parseTcpAddress, PROTOCOL_VERSION, } from "./protocol.js";
export class TcpMutexStore {
    bindAddress;
    timeoutMs;
    hostname;
    profile;
    constructor(bindAddress, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, hostname = os.hostname(), profile = "server") {
        this.bindAddress = bindAddress;
        this.timeoutMs = timeoutMs;
        this.hostname = hostname;
        this.profile = profile;
    }
    acquireLock(name, reason, owner = null, expiration = 60, operation = "lock") {
        return this.request("lock", {
            name,
            reason,
            owner,
            expiration,
            command: operation,
        });
    }
    releaseLock(name, owner = null, fence = null) {
        return this.request("unlock", { name, owner, fence });
    }
    renewLock(name, expiration, owner = null) {
        return this.request("renew", { name, expiration, owner });
    }
    inspectLock(name) {
        return this.request("status", { name });
    }
    listLocks() {
        return this.request("list", {});
    }
    pruneExpired(dryRun = false) {
        return this.request("prune", { dryRun });
    }
    health() {
        return this.request("health", {});
    }
    stop() {
        return this.request("stop", {});
    }
    async close() {
        // Each command is a short request/response TCP exchange. There is no local
        // socket to keep open; the persistent resource lives in the server pool.
    }
    request(operation, payload) {
        const address = parseTcpAddress(this.bindAddress);
        const request = {
            version: PROTOCOL_VERSION,
            profile: this.profile,
            operation,
            hostname: this.hostname,
            payload,
        };
        return new Promise((resolve, reject) => {
            const socket = net.createConnection(address);
            let buffer = "";
            let settled = false;
            const finish = (error, result) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                socket.destroy();
                if (error)
                    reject(error);
                else
                    resolve(result);
            };
            const timer = setTimeout(() => finish(new Error(`mutex server at ${this.bindAddress} timed out`)), this.timeoutMs);
            socket.setEncoding("utf8");
            socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`));
            socket.on("data", (chunk) => {
                buffer += chunk;
                if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
                    finish(new Error("mutex server response is too large"));
                    return;
                }
                const newline = buffer.indexOf("\n");
                if (newline === -1)
                    return;
                try {
                    const response = JSON.parse(buffer.slice(0, newline));
                    if (response.version !== PROTOCOL_VERSION) {
                        finish(new Error(`mutex server protocol ${response.version} is incompatible with client protocol ${PROTOCOL_VERSION}`));
                    }
                    else if (!response.ok) {
                        finish(new Error(response.error));
                    }
                    else {
                        finish(undefined, response.result);
                    }
                }
                catch (error) {
                    finish(error instanceof SyntaxError
                        ? new Error("mutex server returned invalid JSON")
                        : error);
                }
            });
            socket.once("error", (error) => finish(new Error(`cannot reach mutex server at ${this.bindAddress}: ${error.message}`)));
            socket.once("end", () => {
                if (!settled)
                    finish(new Error("mutex server closed without a response"));
            });
        });
    }
}
//# sourceMappingURL=tcp-store.js.map
/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Bumped whenever a request or a response changes meaning, since both ends
 * compare it and refuse a mismatch by name.
 *
 * 2 carries `list`'s owner filter. A version 1 server ignores the field and
 * answers with the whole table, which the client would then present as one
 * owner's locks - and a wrong answer is worse than a refusal that says which
 * process to restart.
 */
export const PROTOCOL_VERSION = 2;
/**
 * The version lifecycle requests carry, frozen at 1.
 *
 * `stop` and `health` have to survive a version gap, because they are how one
 * is diagnosed and fixed: gating `stop` on the version makes the remedy the
 * mismatch itself recommends - restart the server - unreachable through mutex,
 * leaving `kill` and a pid file. So they are spoken in a dialect neither end
 * ever changes, and both ends exempt them from the check. Their shape is
 * fixed by that promise: an empty payload in, a status object out.
 */
export const LIFECYCLE_PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export function parseTcpAddress(value) {
    let host;
    let portText;
    const ipv6 = /^\[([^\]]+)\]:(\d+)$/.exec(value);
    if (ipv6) {
        host = ipv6[1];
        portText = ipv6[2];
    }
    else {
        const split = value.lastIndexOf(":");
        host = value.slice(0, split);
        portText = value.slice(split + 1);
    }
    const port = Number(portText);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`invalid TCP bind address '${value}'; expected host:port`);
    }
    return { host, port };
}
/** Operations that work whatever version the other end speaks. */
export function isLifecycleOperation(value) {
    return value === "health" || value === "stop";
}
export function isOperation(value) {
    return (typeof value === "string" &&
        [
            "lock",
            "unlock",
            "renew",
            "status",
            "list",
            "prune",
            "health",
            "stop",
        ].includes(value));
}
//# sourceMappingURL=protocol.js.map
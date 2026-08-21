/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createWriteStream } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { CONNECTION_ENV_VAR } from "../constants.js";
import { DatabaseMutex } from "../database.js";
import { describeError } from "../helpers.js";
import { readPackageVersion } from "../version.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, isLifecycleOperation, isOperation, LIFECYCLE_PROTOCOL_VERSION, MAX_MESSAGE_BYTES, parseTcpAddress, PROTOCOL_VERSION, } from "./protocol.js";
export function serverPaths(profile) {
    if (!profile.workingDir)
        throw new Error("server profile has no working directory");
    return {
        logPath: path.join(profile.workingDir, `mutex-${profile.name}.log`),
        pidPath: path.join(profile.workingDir, `mutex-${profile.name}.pid`),
    };
}
export async function runServer(profile, connectionString, log, createDatabase = (value, logger) => new DatabaseMutex({
    dbConnectionString: value,
    connectionTimeoutMillis: 10_000,
    sslNegotiation: profile.sslNegotiation,
    // Long-lived, so its connection is worth keeping past the idle timeout,
    // and it can afford the one failed connection an old server costs.
    minPoolSize: 1,
    preferDirectSsl: true,
}, logger)) {
    if (profile.mode !== "server" ||
        !profile.bindAddress ||
        !profile.workingDir) {
        throw new Error(`profile '${profile.name}' is not a server profile`);
    }
    const address = parseTcpAddress(profile.bindAddress);
    const paths = serverPaths(profile);
    const database = createDatabase(connectionString, log);
    try {
        await database.warm();
    }
    catch (error) {
        await database.close().catch(() => undefined);
        throw error;
    }
    const operationLog = createWriteStream(paths.logPath, {
        flags: "a",
        encoding: "utf8",
        mode: 0o600,
    });
    try {
        await streamReady(operationLog);
    }
    catch (error) {
        await database.close().catch(() => undefined);
        throw error;
    }
    const startedAt = Date.now();
    const sockets = new Set();
    const activeRequests = new Set();
    let stopping = false;
    let resolveStopped;
    let rejectStopped;
    const stopped = new Promise((resolve, reject) => {
        resolveStopped = resolve;
        rejectStopped = reject;
    });
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.setEncoding("utf8");
        socket.setTimeout(DEFAULT_REQUEST_TIMEOUT_MS, () => socket.destroy());
        let buffer = "";
        let handled = false;
        socket.on("data", (chunk) => {
            if (handled)
                return;
            buffer += chunk;
            if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
                handled = true;
                respond(socket, failure("request is too large"));
                return;
            }
            const newline = buffer.indexOf("\n");
            if (newline === -1)
                return;
            handled = true;
            const request = handleRequest(buffer.slice(0, newline), socket).catch((error) => {
                respond(socket, failure(safeMessage(error, connectionString)));
            });
            activeRequests.add(request);
            void request.finally(() => activeRequests.delete(request));
        });
        socket.once("error", () => undefined);
        socket.once("close", () => sockets.delete(socket));
    });
    // Read once: a long-running process does not change version, and health is
    // asked often enough while a server is starting to make it worth not
    // walking the filesystem for an answer that cannot have moved.
    const version = readPackageVersion();
    const status = async () => {
        await database.warm();
        return {
            profile: profile.name,
            version,
            pid: process.pid,
            uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
            bindAddress: profile.bindAddress,
            logPath: paths.logPath,
            protocolVersion: PROTOCOL_VERSION,
            pool: { healthy: true, ...database.poolStatus() },
        };
    };
    const shutdown = async () => {
        if (stopping)
            return;
        stopping = true;
        try {
            await new Promise((resolve) => server.close(() => resolve()));
            for (const socket of sockets)
                socket.end();
            await Promise.allSettled([...activeRequests]);
            await database.close();
            await closeStream(operationLog);
            await removeOwnPid(paths.pidPath);
            resolveStopped();
        }
        catch (error) {
            rejectStopped(error);
            throw error;
        }
    };
    const handleRequest = async (line, socket) => {
        let raw;
        try {
            raw = JSON.parse(line);
        }
        catch {
            respond(socket, failure("invalid JSON request"));
            return;
        }
        if (!isRequest(raw)) {
            respond(socket, failure("invalid mutex protocol request"));
            return;
        }
        // Lock work is refused across a version gap, because an answer from a
        // server that read the request differently is worse than no answer. Being
        // stopped or asked how it is are the exceptions: they are how the gap is
        // fixed and how it is seen, and a server that cannot be stopped by the
        // mutex that just refused it has to be killed by hand instead.
        const lifecycle = isLifecycleOperation(raw.operation);
        if (!lifecycle && raw.version !== PROTOCOL_VERSION) {
            respond(socket, failure(`protocol ${raw.version} is incompatible with server protocol ${PROTOCOL_VERSION}`));
            return;
        }
        if (raw.profile !== profile.name) {
            respond(socket, failure(`profile '${raw.profile}' reached server profile '${profile.name}'`));
            return;
        }
        if (raw.operation === "health") {
            respond(socket, success(await status(), LIFECYCLE_PROTOCOL_VERSION));
            return;
        }
        if (raw.operation === "stop") {
            respond(socket, success({ stopping: true }, LIFECYCLE_PROTOCOL_VERSION));
            socket.once("finish", () => void shutdown());
            return;
        }
        const key = nullableStringField(raw.payload, "name");
        const owner = readOwner(raw.payload);
        const loggedOperation = raw.operation === "lock" ? lockCommand(raw.payload) : raw.operation;
        appendOperationLog(operationLog, loggedOperation, key, owner, socket.remoteAddress, raw.hostname);
        let result;
        switch (raw.operation) {
            case "lock":
                result = await database.acquireLock(requiredString(raw.payload, "name"), stringField(raw.payload, "reason"), owner, positiveNumber(raw.payload, "expiration"));
                break;
            case "unlock":
                result = await database.releaseLock(requiredString(raw.payload, "name"), owner, nullableStringField(raw.payload, "fence"));
                break;
            case "renew":
                result = await database.renewLock(requiredString(raw.payload, "name"), positiveNumber(raw.payload, "expiration"), owner);
                break;
            case "status":
                result = await database.inspectLock(requiredString(raw.payload, "name"));
                break;
            case "list":
                result = await database.listLocks(owner);
                break;
            case "prune":
                result = await database.pruneExpired(booleanField(raw.payload, "dryRun"));
                break;
        }
        respond(socket, success(result));
    };
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(address.port, address.host, () => {
                server.off("error", reject);
                resolve();
            });
        });
        await writeFile(paths.pidPath, `${process.pid}\n`, { mode: 0o600 });
    }
    catch (error) {
        if (server.listening) {
            await new Promise((resolve) => server.close(() => resolve()));
        }
        await database.close().catch(() => undefined);
        await closeStream(operationLog).catch(() => undefined);
        throw error;
    }
    operationLog.on("error", (error) => {
        log.error(`Operation log failed: ${describeError(error)}`);
        void shutdown().catch(() => undefined);
    });
    server.on("error", (error) => {
        log.error(`TCP server failed: ${describeError(error)}`);
        void shutdown().catch(() => undefined);
    });
    log.info(`mutex server '${profile.name}' listening on ${profile.bindAddress}`);
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
    const stop = () => void shutdown().catch(() => undefined);
    signals.forEach((signal) => process.once(signal, stop));
    try {
        await stopped;
    }
    finally {
        signals.forEach((signal) => process.off(signal, stop));
    }
}
function isRequest(value) {
    if (!value || typeof value !== "object")
        return false;
    const request = value;
    return (typeof request.version === "number" &&
        typeof request.profile === "string" &&
        isOperation(request.operation) &&
        typeof request.hostname === "string" &&
        request.payload !== null &&
        typeof request.payload === "object" &&
        !Array.isArray(request.payload));
}
function respond(socket, response) {
    socket.end(`${JSON.stringify(response)}\n`);
}
/**
 * A reply, stamped with the dialect it is spoken in: lifecycle answers carry
 * the frozen version, so a client of any age accepts them.
 */
function success(result, version = PROTOCOL_VERSION) {
    return { version, ok: true, result };
}
function failure(error) {
    return { version: PROTOCOL_VERSION, ok: false, error };
}
function appendOperationLog(stream, operation, key, owner, clientIp, hostname) {
    const ip = clientIp?.startsWith("::ffff:") ? clientIp.slice(7) : clientIp;
    const values = [
        new Date().toISOString(),
        operation,
        key,
        owner,
        ip,
        hostname,
    ].map(logField);
    stream.write(`|${values.join("|")}|\n`);
}
function logField(value) {
    if (value === null || value === undefined || value === "")
        return "-";
    return value
        .replaceAll("%", "%25")
        .replaceAll("|", "%7C")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A")
        .replace(/[\u0000-\u001f\u007f]/g, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}`);
}
function requiredString(payload, name) {
    const value = stringField(payload, name);
    if (!value)
        throw new Error(`request field '${name}' must be a non-empty string`);
    return value;
}
function stringField(payload, name, empty = true) {
    const value = payload[name];
    if (value === undefined && empty)
        return "";
    if (typeof value !== "string")
        throw new Error(`request field '${name}' must be a string`);
    return value;
}
/**
 * Who a request names, or null when it names nobody.
 *
 * Blank counts as nobody, which is the rule `readOwner` already keeps for the
 * command line and `Configuration` for the Action's input. The server is the
 * third way into the same table and has to agree with them: a lock nobody
 * named is NULL, not a lock owned by a name no caller can retype, since
 * `mayModify` would then guard it against everybody. On `list` it decides
 * whether the answer is one owner's locks or the whole table.
 */
function readOwner(payload) {
    return nullableStringField(payload, "owner")?.trim() || null;
}
function nullableStringField(payload, name) {
    const value = payload[name];
    if (value === undefined || value === null)
        return null;
    if (typeof value !== "string") {
        throw new Error(`request field '${name}' must be a string or null`);
    }
    return value;
}
function positiveNumber(payload, name) {
    const value = payload[name];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`request field '${name}' must be a positive whole number`);
    }
    return value;
}
function booleanField(payload, name) {
    const value = payload[name];
    if (value === undefined)
        return false;
    if (typeof value !== "boolean")
        throw new Error(`request field '${name}' must be boolean`);
    return value;
}
function lockCommand(payload) {
    const value = payload.command;
    if (value === undefined || value === "lock")
        return "lock";
    if (value === "try-lock")
        return value;
    throw new Error("request field 'command' must be 'lock' or 'try-lock'");
}
function safeMessage(error, connectionString) {
    return describeError(error).replaceAll(connectionString, `$${CONNECTION_ENV_VAR}`);
}
async function closeStream(stream) {
    if (stream.closed)
        return;
    await new Promise((resolve, reject) => {
        stream.once("error", reject);
        stream.end(resolve);
    });
}
async function streamReady(stream) {
    if (stream.pending === false)
        return;
    await new Promise((resolve, reject) => {
        stream.once("open", () => resolve());
        stream.once("error", reject);
    });
}
async function removeOwnPid(pidPath) {
    try {
        const pid = (await readFile(pidPath, "utf8")).trim();
        if (pid === String(process.pid))
            await rm(pidPath);
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
}
//# sourceMappingURL=server.js.map
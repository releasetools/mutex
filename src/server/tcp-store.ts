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
import {
  LockRecord,
  LockResult,
  LockStore,
  RenewResult,
  UnlockResult,
} from "../mutex.js";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  isLifecycleOperation,
  LIFECYCLE_PROTOCOL_VERSION,
  MAX_MESSAGE_BYTES,
  Operation,
  parseTcpAddress,
  PROTOCOL_VERSION,
  ProtocolRequest,
  ProtocolResponse,
  ServerStatus,
} from "./protocol.js";

export class TcpMutexStore implements LockStore {
  constructor(
    private readonly bindAddress: string,
    private readonly timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    private readonly hostname = os.hostname(),
    private readonly profile = "server",
  ) {}

  acquireLock(
    name: string,
    reason: string,
    owner: string | null = null,
    expiration = 60,
    operation: "lock" | "try-lock" = "lock",
  ): Promise<LockResult> {
    return this.request<LockResult>("lock", {
      name,
      reason,
      owner,
      expiration,
      command: operation,
    });
  }

  releaseLock(
    name: string,
    owner: string | null = null,
    fence: string | null = null,
  ): Promise<UnlockResult> {
    return this.request<UnlockResult>("unlock", { name, owner, fence });
  }

  renewLock(
    name: string,
    expiration: number,
    owner: string | null = null,
  ): Promise<RenewResult> {
    return this.request<RenewResult>("renew", { name, expiration, owner });
  }

  inspectLock(name: string): Promise<LockRecord | null> {
    return this.request<LockRecord | null>("status", { name });
  }

  listLocks(owner: string | null = null): Promise<LockRecord[]> {
    return this.request<LockRecord[]>("list", { owner });
  }

  pruneExpired(dryRun = false): Promise<LockRecord[]> {
    return this.request<LockRecord[]>("prune", { dryRun });
  }

  health(): Promise<ServerStatus> {
    return this.request<ServerStatus>("health", {});
  }

  stop(): Promise<{ stopping: true }> {
    return this.request<{ stopping: true }>("stop", {});
  }

  async close(): Promise<void> {
    // Each command is a short request/response TCP exchange. There is no local
    // socket to keep open; the persistent resource lives in the server pool.
  }

  request<T>(
    operation: Operation,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const address = parseTcpAddress(this.bindAddress);
    // Stopping or inspecting a server has to work against one built from other
    // code, since that is exactly when it is needed: those go in the frozen
    // lifecycle dialect, and their reply is not held to this client's version.
    const lifecycle = isLifecycleOperation(operation);
    const request: ProtocolRequest = {
      version: lifecycle ? LIFECYCLE_PROTOCOL_VERSION : PROTOCOL_VERSION,
      profile: this.profile,
      operation,
      hostname: this.hostname,
      payload,
    };

    return new Promise<T>((resolve, reject) => {
      const socket = net.createConnection(address);
      let buffer = "";
      let settled = false;

      const finish = (error?: Error, result?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(result as T);
      };

      const timer = setTimeout(
        () =>
          finish(new Error(`mutex server at ${this.bindAddress} timed out`)),
        this.timeoutMs,
      );

      socket.setEncoding("utf8");
      socket.once("connect", () =>
        socket.write(`${JSON.stringify(request)}\n`),
      );
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
          finish(new Error("mutex server response is too large"));
          return;
        }
        const newline = buffer.indexOf("\n");
        if (newline === -1) return;
        try {
          const response = JSON.parse(
            buffer.slice(0, newline),
          ) as ProtocolResponse;
          if (!lifecycle && response.version !== PROTOCOL_VERSION) {
            finish(
              new Error(
                `mutex server protocol ${response.version} is incompatible with client protocol ${PROTOCOL_VERSION}`,
              ),
            );
          } else if (!response.ok) {
            finish(new Error(response.error));
          } else {
            finish(undefined, response.result as T);
          }
        } catch (error) {
          finish(
            error instanceof SyntaxError
              ? new Error("mutex server returned invalid JSON")
              : (error as Error),
          );
        }
      });
      socket.once("error", (error) =>
        finish(
          new Error(
            `cannot reach mutex server at ${this.bindAddress}: ${error.message}`,
          ),
        ),
      );
      socket.once("end", () => {
        if (!settled)
          finish(new Error("mutex server closed without a response"));
      });
    });
  }
}

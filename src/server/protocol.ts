/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export type Operation =
  "lock" | "unlock" | "renew" | "status" | "list" | "prune" | "health" | "stop";

export interface ProtocolRequest {
  version: number;
  profile: string;
  operation: Operation;
  hostname: string;
  payload: Record<string, unknown>;
}

export type ProtocolResponse =
  | { version: number; ok: true; result: unknown }
  | { version: number; ok: false; error: string };

export interface ServerStatus {
  profile: string;
  pid: number;
  uptimeSeconds: number;
  bindAddress: string;
  logPath: string;
  protocolVersion: number;
  pool: { healthy: boolean; total: number; idle: number; waiting: number };
}

export interface TcpAddress {
  host: string;
  port: number;
}

export function parseTcpAddress(value: string): TcpAddress {
  let host: string;
  let portText: string;
  const ipv6 = /^\[([^\]]+)\]:(\d+)$/.exec(value);
  if (ipv6) {
    host = ipv6[1];
    portText = ipv6[2];
  } else {
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

export function isOperation(value: unknown): value is Operation {
  return (
    typeof value === "string" &&
    [
      "lock",
      "unlock",
      "renew",
      "status",
      "list",
      "prune",
      "health",
      "stop",
    ].includes(value)
  );
}

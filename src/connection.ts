/*
 * Copyright (c) 2025-2026 Mihai Bojin
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

import type { PoolConfig } from "pg";
import { parseIntoClientConfig } from "pg-connection-string";
import { CONNECTION_ENV_VAR } from "./constants.js";

/** What mutex settled on, for the debug line and for failure hints. */
export interface SslPosture {
  /** `sslmode` exactly as the connection string or `PGSSLMODE` wrote it. */
  declared: string | null;
  /**
   * What mutex applied. `libpq` means the connection string asked, with
   * `uselibpqcompat=true`, for node-postgres to decide instead.
   */
  effective: "verify-full" | "no-verify" | "plaintext" | "libpq";
  /** True when `declared` means something weaker elsewhere than it does here. */
  promoted: boolean;
}

export interface ResolvedConnection {
  /** Ready for `new Pool()`. */
  config: PoolConfig;
  posture: SslPosture;
  /**
   * Emitted once by the caller. Each one is an exposure worth interrupting
   * for, never a restatement of something the user already asked for.
   */
  warnings: string[];
}

/**
 * Modes whose name promises less than mutex delivers.
 *
 * libpq reads all four as "encrypt, but do not check who answered", which is
 * no protection against an attacker who can answer instead of the server.
 * node-postgres has always read them as `verify-full`, and announces that in
 * pg v9 it will adopt libpq's meaning instead - silently weakening every
 * connection string that says `require`. Deciding here rather than inheriting
 * whichever meaning the installed parser holds is what makes that upgrade a
 * no-op.
 */
const PROMOTED_MODES = new Set(["allow", "prefer", "require", "verify-ca"]);

/** Hosts where an unencrypted connection never leaves the machine. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

/**
 * Turns a connection string into pool configuration with mutex's own SSL
 * decision baked in.
 *
 * The connection string belongs to whoever set it and is never rewritten in
 * place: what leaves here is configuration, and the only field mutex overrides
 * is `ssl`. `sslcert`, `sslkey` and `sslrootcert` are still read and loaded by
 * node-postgres, so a private CA keeps working.
 */
export function resolveConnection(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedConnection {
  const warnings: string[] = [];
  const url = asUrl(connectionString);

  // Not URL-shaped - a bare socket path, which carries no parameters and no
  // TLS. Hand it over exactly as it arrived.
  if (!url) {
    return {
      config: { connectionString },
      posture: { declared: null, effective: "plaintext", promoted: false },
      warnings,
    };
  }

  const declared = url.searchParams.get("sslmode") ?? env.PGSSLMODE ?? null;

  // An explicit `uselibpqcompat=true` is an informed request for libpq's
  // meanings. Overriding it would defeat the only escape hatch node-postgres
  // offers, so mutex steps aside and says what that costs.
  if (url.searchParams.get("uselibpqcompat") === "true") {
    if (declared && declared !== "verify-full") {
      warnings.push(
        `${CONNECTION_ENV_VAR} sets uselibpqcompat=true, so sslmode=${declared} keeps libpq's meaning and ` +
          `${declared === "disable" ? "the connection is not encrypted" : "the server certificate is not checked"}. ` +
          `Drop uselibpqcompat, or use sslmode=verify-full, for a verified connection.`,
      );
    }
    return {
      config: parseIntoClientConfig(connectionString) as PoolConfig,
      posture: { declared, effective: "libpq", promoted: false },
      warnings,
    };
  }

  // Parsing with `sslmode` removed leaves the certificate files to
  // node-postgres and keeps its deprecation warning from firing, since mutex
  // is about to state the same decision more precisely.
  const config = parseIntoClientConfig(withoutSslMode(url)) as PoolConfig;
  const loaded = typeof config.ssl === "object" && config.ssl ? config.ssl : {};
  let effective: SslPosture["effective"];

  switch (declared) {
    case null:
      // Nothing asked for TLS anywhere. Connecting in the clear is what every
      // version of node-postgres does here, and quietly upgrading it would
      // break local sockets and test databases that have no certificate.
      effective = config.ssl ? "verify-full" : "plaintext";
      break;
    case "disable":
      config.ssl = false;
      effective = "plaintext";
      break;
    case "no-verify":
      config.ssl = { ...loaded, rejectUnauthorized: false };
      effective = "no-verify";
      break;
    default:
      // `verify-full`, the four promoted modes, and anything unrecognised.
      // Node's defaults check the chain and the hostname.
      config.ssl = loaded;
      effective = "verify-full";
  }

  if (effective === "plaintext" && !isLocal(hostOf(url))) {
    warnings.push(
      `${CONNECTION_ENV_VAR} connects to ${hostOf(url)} without TLS, so the password and every lock ` +
        `travel in the clear. Add sslmode=verify-full unless the network is already private.`,
    );
  }

  return {
    config,
    posture: {
      declared,
      effective,
      promoted: declared !== null && PROMOTED_MODES.has(declared),
    },
    warnings,
  };
}

/** One line for `--verbose`, and the tail of a TLS failure. */
export function describePosture(posture: SslPosture): string {
  return `sslmode=${posture.declared ?? "unset"} applied as ${posture.effective}`;
}

/**
 * Turns a TLS handshake failure into something that names its likely cause.
 *
 * Promoting `require` to `verify-full` rejects a private CA with a certificate
 * error that never mentions `sslmode`, so the setting responsible for it is
 * invisible from the message alone.
 */
export function explainSslFailure(
  error: unknown,
  posture: SslPosture,
): string | null {
  const message = error instanceof Error ? error.message : String(error);

  if (
    posture.promoted &&
    /certificate|self-signed|unable to verify|altnames|CERT_/i.test(message)
  ) {
    return (
      `${CONNECTION_ENV_VAR} says sslmode=${posture.declared}, which mutex applies as verify-full, so the server's ` +
      `certificate has to be valid for this hostname. Point sslrootcert at the CA that signed it, or use ` +
      `sslmode=no-verify to accept it unchecked.`
    );
  }

  return null;
}

/**
 * `new URL` rejects the empty-host form that carries the host in a parameter
 * (`postgres://user:pass@/db?host=/run/postgresql`), which node-postgres
 * supports. Borrowing its placeholder keeps that form working.
 */
const PLACEHOLDER_HOST = "placeholder.invalid";

function asUrl(connectionString: string): URL | null {
  // A leading slash is a bare socket path, and spaces or stray percent signs
  // need the escaping node-postgres does itself. Neither can carry sslmode.
  if (
    connectionString.startsWith("/") ||
    / |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(connectionString)
  ) {
    return null;
  }
  try {
    return new URL(connectionString);
  } catch {
    try {
      return new URL(connectionString.replace("@/", `@${PLACEHOLDER_HOST}/`));
    } catch {
      return null;
    }
  }
}

function withoutSslMode(url: URL): string {
  const copy = new URL(url);
  copy.searchParams.delete("sslmode");
  if (copy.hostname === PLACEHOLDER_HOST) {
    copy.host = "";
  }
  return copy.toString();
}

/** The `host` parameter wins over the authority, as it does in libpq. */
function hostOf(url: URL): string {
  const parameter = url.searchParams.get("host");
  if (parameter) {
    return parameter;
  }
  return url.hostname === PLACEHOLDER_HOST ? "" : url.hostname;
}

function isLocal(host: string): boolean {
  return (
    host.startsWith("/") || LOCAL_HOSTS.has(host) || host.endsWith(".localhost")
  );
}

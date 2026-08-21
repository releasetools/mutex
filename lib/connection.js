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
import { parseIntoClientConfig } from "pg-connection-string";
import { CONNECTION_ENV_VAR } from "./constants.js";
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
export function resolveConnection(connectionString, options = {}, env = process.env) {
    const warnings = [];
    const url = asUrl(connectionString);
    // Not URL-shaped - a bare socket path, which carries no parameters and no
    // TLS. Hand it over exactly as it arrived.
    if (!url) {
        return {
            config: { connectionString },
            posture: {
                declared: null,
                effective: "plaintext",
                promoted: false,
                negotiation: "postgres",
            },
            warnings,
        };
    }
    // `||` rather than `??`, deliberately: `?sslmode=` parses as an empty
    // string, and node-postgres reads that as no mode at all rather than as an
    // unrecognised one. Accepting it would make TLS mandatory where it used to
    // be absent, and would shadow `PGSSLMODE` with a value nobody wrote.
    const declared = url.searchParams.get("sslmode") || env.PGSSLMODE || null;
    const asked = options.sslNegotiation ?? readNegotiation(url) ?? undefined;
    const requested = asked ?? (options.preferDirect ? "direct" : "postgres");
    // An explicit `uselibpqcompat=true` is an informed request for libpq's
    // meanings. Overriding it would defeat the only escape hatch node-postgres
    // offers, so mutex steps aside and says what that costs.
    if (url.searchParams.get("uselibpqcompat") === "true") {
        if (declared && declared !== "verify-full") {
            warnings.push(`${CONNECTION_ENV_VAR} sets uselibpqcompat=true, so sslmode=${declared} keeps libpq's meaning and ` +
                `${declared === "disable" ? "the connection is not encrypted" : "the server certificate is not checked"}. ` +
                `Drop uselibpqcompat, or use sslmode=verify-full, for a verified connection.`);
        }
        const overLibpqTls = declared !== "disable";
        const libpqNegotiation = usable(requested, overLibpqTls, asked, warnings);
        return {
            config: applyNegotiation(parseIntoClientConfig(connectionString), libpqNegotiation),
            posture: {
                declared,
                effective: "libpq",
                promoted: false,
                negotiation: libpqNegotiation,
            },
            warnings,
        };
    }
    // Parsing with `sslmode` removed leaves the certificate files to
    // node-postgres and keeps its deprecation warning from firing, since mutex
    // is about to state the same decision more precisely.
    const config = parseIntoClientConfig(withoutSslMode(url));
    const loaded = typeof config.ssl === "object" && config.ssl ? config.ssl : {};
    let effective;
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
        warnings.push(`${CONNECTION_ENV_VAR} connects to ${hostOf(url)} without TLS, so the password and every lock ` +
            `travel in the clear. Add sslmode=verify-full unless the network is already private.`);
    }
    const negotiation = usable(requested, effective !== "plaintext", asked, warnings);
    return {
        config: applyNegotiation(config, negotiation),
        posture: {
            declared,
            effective,
            promoted: declared !== null && PROMOTED_MODES.has(declared),
            negotiation,
        },
        warnings,
    };
}
/**
 * Drops direct negotiation onto a connection that has no TLS to negotiate.
 *
 * node-postgres refuses that combination outright - "sslnegotiation=direct
 * requires SSL to be enabled" - so leaving it in place would fail every
 * connection rather than slow one down. Costing nothing to decide here, it is
 * only worth a word when somebody asked for it rather than inherited it.
 */
function usable(requested, encrypted, asked, warnings) {
    if (requested !== "direct" || encrypted) {
        return requested;
    }
    if (asked === "direct") {
        warnings.push("Direct SSL negotiation was requested for a connection that does not use TLS, which " +
            "node-postgres rejects, so it is not being used. Add sslmode=verify-full to enable it.");
    }
    return "postgres";
}
/**
 * How a server too old for direct negotiation fails.
 *
 * PostgreSQL below 17 reads the TLS handshake as a malformed startup packet
 * and hangs up, so all that reaches the client is a socket that closed. The
 * pattern is deliberately broad: mistaking a network blip for an old server
 * costs one round trip per connection from then on, while missing a real old
 * server costs every connection.
 */
const DIRECT_NEGOTIATION_FAILURE = /socket disconnected|EPROTO|ECONNRESET|wrong version number/i;
/** True when a failure looks like a server that cannot start TLS directly. */
export function isDirectNegotiationFailure(error) {
    return DIRECT_NEGOTIATION_FAILURE.test(error instanceof Error ? error.message : String(error));
}
/** One line for `--verbose`, and the tail of a TLS failure. */
export function describePosture(posture) {
    const declared = posture.declared ?? "unset";
    const negotiation = posture.negotiation === "direct" ? ", direct SSL negotiation" : "";
    return `sslmode=${declared} applied as ${posture.effective}${negotiation}`;
}
/**
 * Turns a TLS handshake failure into something that names its likely cause.
 *
 * Both failures worth explaining are silent about themselves: promoting
 * `require` to `verify-full` rejects a private CA with a certificate error
 * that never mentions `sslmode`, and direct negotiation against a server older
 * than 17 only ever reports a socket that closed.
 */
export function explainSslFailure(error, posture) {
    const message = error instanceof Error ? error.message : String(error);
    if (posture.negotiation === "direct" && isDirectNegotiationFailure(error)) {
        return (`Direct SSL negotiation is in use and needs PostgreSQL 17 or newer; older servers close the connection ` +
            `exactly like this. Remove ssl_negotiation from the profile, or sslnegotiation from ${CONNECTION_ENV_VAR}, to rule it out.`);
    }
    if (posture.promoted &&
        /certificate|self-signed|unable to verify|altnames|CERT_/i.test(message)) {
        return (`${CONNECTION_ENV_VAR} says sslmode=${posture.declared}, which mutex applies as verify-full, so the server's ` +
            `certificate has to be valid for this hostname. Point sslrootcert at the CA that signed it, or use ` +
            `sslmode=no-verify to accept it unchecked.`);
    }
    return null;
}
function applyNegotiation(config, negotiation) {
    return { ...config, sslnegotiation: negotiation };
}
/**
 * `new URL` rejects the empty-host form that carries the host in a parameter
 * (`postgres://user:pass@/db?host=/run/postgresql`), which node-postgres
 * supports. Borrowing its placeholder keeps that form working.
 */
const PLACEHOLDER_HOST = "placeholder.invalid";
function asUrl(connectionString) {
    // A leading slash is a bare socket path, and spaces or stray percent signs
    // need the escaping node-postgres does itself. Neither can carry sslmode.
    if (connectionString.startsWith("/") ||
        / |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(connectionString)) {
        return null;
    }
    try {
        return new URL(connectionString);
    }
    catch {
        try {
            return new URL(connectionString.replace("@/", `@${PLACEHOLDER_HOST}/`));
        }
        catch {
            return null;
        }
    }
}
function withoutSslMode(url) {
    const copy = new URL(url);
    copy.searchParams.delete("sslmode");
    if (copy.hostname === PLACEHOLDER_HOST) {
        copy.host = "";
    }
    return copy.toString();
}
/**
 * Reads `sslnegotiation` from the connection string, rejecting what neither
 * mutex nor node-postgres understands.
 *
 * mutex now writes this field itself, so an unrecognised value would otherwise
 * be quietly overwritten - and a typo would read as "direct negotiation is on"
 * while nothing had changed. node-postgres rejects the same values, so this
 * only moves the complaint earlier.
 */
function readNegotiation(url) {
    const value = url.searchParams.get("sslnegotiation");
    if (!value) {
        return null;
    }
    if (value !== "postgres" && value !== "direct") {
        throw new Error(`Invalid sslnegotiation value: "${value}". Valid values are "postgres" and "direct".`);
    }
    return value;
}
/** The `host` parameter wins over the authority, as it does in libpq. */
function hostOf(url) {
    const parameter = url.searchParams.get("host");
    if (parameter) {
        return parameter;
    }
    return url.hostname === PLACEHOLDER_HOST ? "" : url.hostname;
}
function isLocal(host) {
    return (host.startsWith("/") || LOCAL_HOSTS.has(host) || host.endsWith(".localhost"));
}
//# sourceMappingURL=connection.js.map
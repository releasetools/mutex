import type { PoolConfig } from "pg";
/**
 * How the TLS handshake starts. `direct` skips the SSLRequest packet and the
 * server's one-byte reply, saving a round trip, and needs PostgreSQL 17 or
 * newer: older servers read the TLS ClientHello as a malformed startup packet
 * and hang up. node-postgres does not fall back.
 */
export type SslNegotiation = "postgres" | "direct";
/**
 * Pool configuration including the field `@types/pg` has not caught up with.
 *
 * node-postgres has read `sslnegotiation` since 8.16 and validates it in
 * `connection-parameters.js`, but its types do not list it.
 */
export type NegotiablePoolConfig = PoolConfig & {
    sslnegotiation?: SslNegotiation;
};
export interface SslNegotiationOptions {
    /** What a profile or the connection string asked for, if either did. */
    sslNegotiation?: SslNegotiation;
    /**
     * Use direct negotiation when nothing asked and the connection has TLS.
     *
     * The server sets it: one failed connection is a fair price for a long-lived
     * process, and `isDirectNegotiationFailure` is what turns that failure into
     * a retreat rather than an outage.
     */
    preferDirect?: boolean;
}
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
    negotiation: SslNegotiation;
}
export interface ResolvedConnection {
    /** Ready for `new Pool()`. */
    config: NegotiablePoolConfig;
    posture: SslPosture;
    /**
     * Emitted once by the caller. Each one is an exposure worth interrupting
     * for, never a restatement of something the user already asked for.
     */
    warnings: string[];
}
/**
 * Turns a connection string into pool configuration with mutex's own SSL
 * decision baked in.
 *
 * The connection string belongs to whoever set it and is never rewritten in
 * place: what leaves here is configuration, and the only field mutex overrides
 * is `ssl`. `sslcert`, `sslkey` and `sslrootcert` are still read and loaded by
 * node-postgres, so a private CA keeps working.
 */
export declare function resolveConnection(connectionString: string, options?: SslNegotiationOptions, env?: NodeJS.ProcessEnv): ResolvedConnection;
/** True when a failure looks like a server that cannot start TLS directly. */
export declare function isDirectNegotiationFailure(error: unknown): boolean;
/** One line for `--verbose`, and the tail of a TLS failure. */
export declare function describePosture(posture: SslPosture): string;
/**
 * Turns a TLS handshake failure into something that names its likely cause.
 *
 * Both failures worth explaining are silent about themselves: promoting
 * `require` to `verify-full` rejects a private CA with a certificate error
 * that never mentions `sslmode`, and direct negotiation against a server older
 * than 17 only ever reports a socket that closed.
 */
export declare function explainSslFailure(error: unknown, posture: SslPosture): string | null;

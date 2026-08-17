export declare const SKIP_LABEL = "SKIP_MUTEX";
export declare const TABLE_NAME = "releasetools_mutex";
/**
 * Where the connection string comes from, for both front ends.
 *
 * Prefixed on purpose. `DATABASE_URL` is the most reused name in the
 * ecosystem - frameworks, ORMs, PaaS providers and CI systems all set it, and
 * it points at the *application's* database far more often than at the one
 * holding locks. mutex read it until 1.3.0, warning as it went; a repository
 * that had one for its app and then added mutex was taking its locks in the
 * app database without being told.
 */
export declare const CONNECTION_ENV_VAR = "MUTEX_DATABASE_URL";

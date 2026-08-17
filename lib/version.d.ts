/**
 * The version from the nearest package.json above this module.
 *
 * Walks up rather than using a fixed depth, because the same code ships from
 * four places at two different depths: `lib/main.js`, `lib/cli/main.js`,
 * `dist/main/index.js` and `dist/cli/index.js`. The ncc bundles also drop a
 * package.json of their own alongside them containing only `{"type":"module"}`,
 * so having a `version` field is what identifies the real one.
 *
 * Returns "unknown" rather than throwing: not knowing the version is never a
 * reason to fail an operation.
 */
export declare function readPackageVersion(): string;

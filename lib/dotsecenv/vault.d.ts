/**
 * A reader for dotsecenv vault files.
 *
 * The layout is a marker, a JSON header, a marker, then one JSON record per
 * line:
 *
 *   # === VAULT HEADER ===
 *   {"version":2,"identities":{...},"secrets":{"ns::KEY":{"secret":6,"values":[7,9]}}}
 *   # === VAULT DATA ===
 *   {"type":"identity","data":{...}}
 *   {"type":"secret","data":{...}}
 *   {"type":"value","secret":"ns::KEY","data":{...}}
 *
 * The header indexes records by 1-based line number, so which secrets a vault
 * holds - and who they are encrypted for - can be read without touching GPG.
 * Nothing here decrypts: values stay ciphertext, and `cli.ts` shells out to the
 * real dotsecenv binary for that.
 *
 * Only format v2 is read. Older vaults are rejected with a pointer at
 * `dotsecenv vault doctor` rather than parsed on a best-effort basis.
 */
export declare const HEADER_MARKER = "# === VAULT HEADER ===";
export declare const DATA_MARKER = "# === VAULT DATA ===";
/** The only vault format this client reads. */
export declare const SUPPORTED_FORMAT_VERSION = 2;
export declare const VAULT_DIRECTORY = ".dotsecenv";
export declare const VAULT_FILENAME = "vault";
export interface VaultSecret {
    key: string;
    /** GPG fingerprints the most recent value is readable by. */
    availableTo: string[];
    /** True when the newest value is a deletion marker (`secret forget`). */
    deleted: boolean;
    addedAt: string | null;
    valueCount: number;
}
export interface Vault {
    path: string;
    version: number;
    /** GPG fingerprints registered with this vault. */
    identities: string[];
    secrets: Map<string, VaultSecret>;
}
/** The conventional vault location for a directory holding a `.secenv`. */
export declare function vaultPathFor(dir: string): string;
export declare function parseVault(content: string, vaultPath: string): Vault;
/** Reads a vault, returning null when the file does not exist. */
export declare function readVault(vaultPath: string): Promise<Vault | null>;

import { SslNegotiation } from "../connection.js";
export declare const DEFAULT_BIND_ADDRESS = "localhost:5625";
export declare const PROFILES_FILENAME = "profiles.toml";
export type ProfileMode = "server" | "direct";
export interface MutexProfile {
    name: string;
    mode: ProfileMode;
    isDefault: boolean;
    bindAddress?: string;
    workingDir?: string;
    /**
     * `direct` skips a round trip in the TLS handshake and needs PostgreSQL 17
     * or newer. It lives here rather than only in the connection string because
     * the connection string is a secret, often issued by somebody else, and this
     * is a property of the server it points at rather than a credential.
     */
    sslNegotiation?: SslNegotiation;
}
export interface ProfilesFile {
    path: string;
    profiles: MutexProfile[];
}
export interface SelectedProfile {
    profile: MutexProfile;
    /** Null for the zero-configuration direct path. */
    configPath: string | null;
}
export declare function profilesDirectory(env?: NodeJS.ProcessEnv, home?: string): string;
export declare function profilesPath(env?: NodeJS.ProcessEnv, home?: string): string;
/** A deliberately small TOML reader for the profile keys we own. */
export declare function parseProfiles(text: string, filePath?: string, requireDefault?: boolean): MutexProfile[];
export declare function formatProfiles(profiles: MutexProfile[]): string;
export declare function loadProfiles(filePath?: string, requireDefault?: boolean): Promise<ProfilesFile | null>;
export declare function ensureProfiles(input?: NodeJS.ReadStream, output?: NodeJS.WriteStream, filePath?: string): Promise<ProfilesFile>;
export declare function selectProfile(requestedName: string | null, filePath?: string): Promise<SelectedProfile>;
export declare function setDefaultProfile(name: string, filePath?: string): Promise<ProfilesFile>;
export declare function formatProfileList(profiles: MutexProfile[]): string;
export declare function chooseProfile(loaded: ProfilesFile, input?: NodeJS.ReadStream, output?: NodeJS.WriteStream): Promise<string | null>;
export declare function profileCommand(name: string): Promise<void>;
/** Used by service setup tests without opening the file. */
export declare function profileFileExists(filePath?: string): Promise<boolean>;

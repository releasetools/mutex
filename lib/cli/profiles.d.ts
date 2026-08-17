export declare const DEFAULT_BIND_ADDRESS = "localhost:5625";
export declare const PROFILES_FILENAME = "profiles.toml";
export type ProfileMode = "server" | "direct";
export interface MutexProfile {
    name: string;
    mode: ProfileMode;
    enabled: boolean;
    bindAddress?: string;
    workingDir?: string;
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
/** A deliberately small TOML reader for the four profile keys we own. */
export declare function parseProfiles(text: string, filePath?: string, requireEnabled?: boolean): MutexProfile[];
export declare function formatProfiles(profiles: MutexProfile[]): string;
export declare function loadProfiles(filePath?: string, requireEnabled?: boolean): Promise<ProfilesFile | null>;
export declare function ensureProfiles(input?: NodeJS.ReadStream, output?: NodeJS.WriteStream, filePath?: string): Promise<ProfilesFile>;
export declare function selectProfile(requestedName: string | null, filePath?: string): Promise<SelectedProfile>;
export declare function activateProfile(name: string, filePath?: string): Promise<ProfilesFile>;
export declare function formatProfileList(profiles: MutexProfile[]): string;
export declare function chooseProfile(loaded: ProfilesFile, input?: NodeJS.ReadStream, output?: NodeJS.WriteStream): Promise<string | null>;
export declare function profileCommand(name: string): Promise<void>;
/** Used by service setup tests without opening the file. */
export declare function profileFileExists(filePath?: string): Promise<boolean>;

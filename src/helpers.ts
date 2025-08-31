import * as core from "@actions/core";

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function loadRequiredNonEmptyFromGHAInput(name: string): string {
  const data = core.getInput(name);
  if (data && data.trim().length > 0) {
    return data;
  }

  throw new Error(`🚨 ${name} not found or empty. Cannot continue...`);
}

export function loadRequiredFromEnvOrGHAInput(name: string): string {
  const token = process.env[name] || core.getInput(name);
  if (token) {
    return token;
  }

  throw new Error(`🚨 ${name} not found. Cannot continue...`);
}

export function loadFromEnvOrGHAInput(name: string): string | null {
  const token = process.env[name] || core.getInput(name);
  if (token) {
    return token;
  }

  core.warning(`⚠️ ${name} not found.`);
  return null;
}

export function printError(error: any, description: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  core.error(`${description + ": " || ""}${message}`);
  core.debug(`Stack trace: ${error instanceof Error ? error.stack : "N/A"}`);
}

export function printWarning(error: any, description: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  core.warning(`${description + ": " || ""}${message}`);
  core.debug(`Stack trace: ${error instanceof Error ? error.stack : "N/A"}`);
}

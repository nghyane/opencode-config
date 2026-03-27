import { homedir } from "node:os";
import { join } from "node:path";

const TOOL_CONFIG = join(homedir(), ".config", "opencode", "tools", "config.json");

export async function readToolConfig(): Promise<Record<string, unknown>> {
  const file = Bun.file(TOOL_CONFIG);
  if (!(await file.exists())) return {};
  try {
    return (await file.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function getExaApiKey(): Promise<string | undefined> {
  if (process.env.EXA_API_KEY) return process.env.EXA_API_KEY;
  const config = await readToolConfig();
  return typeof config.exaApiKey === "string" && config.exaApiKey.length > 0 ? config.exaApiKey : undefined;
}

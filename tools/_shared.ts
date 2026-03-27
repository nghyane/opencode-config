const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });

export const MAX_TOOL_BYTES = 262_144;

export function clipText(text: string, maxBytes = MAX_TOOL_BYTES): string {
  const bytes = encoder.encode(text);
  if (bytes.length <= maxBytes) return text;
  return decoder.decode(bytes.slice(0, maxBytes)).replace(/\uFFFD+$/, "");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeGitHubRepo(repo: string): string {
  return repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
}

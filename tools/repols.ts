import { tool } from "@opencode-ai/plugin";
import { getRepoTree } from "./lib/github";

export default tool({
  description: "List files in a GitHub repository using gh.",
  args: {
    repo: tool.schema.string().describe("GitHub repo like owner/name or full GitHub URL."),
    path: tool.schema.string().optional().describe("Optional path prefix to filter results."),
    ref: tool.schema.string().optional().describe("Optional git ref, branch, or commit SHA."),
    limit: tool.schema.number().int().positive().max(500).optional().describe("Maximum number of entries to return."),
  },
  async execute(args) {
    const ref = args.ref ?? "HEAD";
    const { repo, tree } = await getRepoTree(args.repo, ref);
    if (!tree.length) return { ok: false, error: { code: "invalid-ref", message: `Could not resolve tree for ${repo}@${ref}` } };
    const prefix = args.path?.replace(/^\/+|\/+$/g, "");
    const filtered = tree.filter((entry) => !prefix || entry.path === prefix || entry.path.startsWith(`${prefix}/`));
    const entries = filtered.slice(0, args.limit ?? 200).map((entry) => ({
      path: entry.path,
      type: entry.type === "tree" ? "dir" : entry.type,
      size: entry.size ?? null,
      sha: entry.sha,
      url: `https://github.com/${repo}/${entry.type === "tree" ? "tree" : "blob"}/${ref}/${entry.path}`,
    }));

    return {
      ok: true,
      result: {
        repo,
        ref,
        entries,
        truncated: filtered.length > entries.length,
      },
    };
  },
});

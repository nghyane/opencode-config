import { tool } from "@opencode-ai/plugin";
import { getDefaultBranch, getRepoTree } from "./lib/github";

export default tool({
  description: "List files in a GitHub repository using gh.",
  args: {
    repo: tool.schema.string().describe("GitHub repo like owner/name or full GitHub URL."),
    path: tool.schema.string().optional().describe("Optional path prefix to filter results."),
    ref: tool.schema.string().optional().describe("Optional git ref, branch, or commit SHA."),
    limit: tool.schema.number().int().positive().max(500).optional().describe("Maximum number of entries to return."),
  },
  async execute(args) {
    const ref = args.ref ?? (await getDefaultBranch(args.repo)).defaultBranch ?? "main";
    const { repo, tree } = await getRepoTree(args.repo, ref);
    if (!tree.length) return `Could not resolve tree for ${repo}@${ref}`;
    const prefix = args.path?.replace(/^\/+|\/+$/g, "");
    const filtered = tree.filter((entry) => !prefix || entry.path === prefix || entry.path.startsWith(`${prefix}/`));
    const entries = filtered.slice(0, args.limit ?? 200).map((entry) => ({
      path: entry.path,
      type: entry.type === "tree" ? "dir" : entry.type,
      size: entry.size ?? null,
      sha: entry.sha,
      url: `https://github.com/${repo}/${entry.type === "tree" ? "tree" : "blob"}/${ref}/${entry.path}`,
    }));

    const lines = entries.map((entry) => `${entry.type === "dir" ? "dir" : "file"} ${entry.path} ${entry.url}`);
    return lines.length > 0 ? lines.join("\n") : `No entries found for ${repo}@${ref}`;
  },
});

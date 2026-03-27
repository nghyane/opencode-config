import { tool } from "@opencode-ai/plugin";
import { normalizeGitHubRepo } from "./_shared";
import { searchRepoCode } from "./lib/github";

export default tool({
  description: "Search code in a GitHub repository using gh.",
  args: {
    repo: tool.schema.string().describe("GitHub repo like owner/name or full GitHub URL."),
    query: tool.schema.string().describe("Search query for code in the repository."),
    path: tool.schema.string().optional().describe("Optional path qualifier inside the repo."),
    limit: tool.schema.number().int().positive().max(100).optional().describe("Maximum number of results to return."),
  },
  async execute(args) {
    const repo = normalizeGitHubRepo(args.repo);
    const items = (await searchRepoCode(repo, args.query, args.path, args.limit ?? 20)) as Array<Record<string, unknown>>;

    return {
      ok: true,
      result: {
        repo,
        query: args.query,
        results: items.map((item: Record<string, unknown>) => ({
          path: typeof item.path === "string" ? item.path : "",
          sha: typeof item.sha === "string" ? item.sha : "",
          url: typeof item.url === "string" ? item.url : "",
          repository:
            item.repository && typeof item.repository === "object" && typeof item.repository.full_name === "string"
              ? item.repository.full_name
              : repo,
        })),
      },
    };
  },
});

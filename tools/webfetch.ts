import { tool } from "@opencode-ai/plugin";
import { runWebFetch } from "./lib/webfetch-core";

export default tool({
  description: "Fetch and read a web page with excerpt ranking and content clipping.",
  args: {
    url: tool.schema.string().describe("The URL to fetch."),
    objective: tool.schema.string().optional().describe("Optional reading objective for excerpt ranking."),
    forceRefetch: tool.schema.boolean().optional().describe("Bypass cache and refetch the URL."),
  },
  async execute(args) {
    return runWebFetch(args);
  },
});

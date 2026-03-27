import { tool } from "@opencode-ai/plugin";
import { getExaApiKey } from "./lib/config";
import { searchWeb } from "./lib/exa";

export default tool({
  description: "Search the web for relevant results using Exa.",
  args: {
    objective: tool.schema.string().describe("The research objective."),
    searchQueries: tool.schema.array(tool.schema.string()).optional().describe("Optional query variants to combine."),
    maxResults: tool.schema.number().int().positive().max(10).optional().describe("Maximum number of results."),
  },
  async execute(args) {
    const apiKey = await getExaApiKey();
    if (!apiKey) return "Set EXA_API_KEY or ~/.config/opencode/tools/config.json to use netsearch.";
    return searchWeb({ apiKey, objective: args.objective, searchQueries: args.searchQueries, maxResults: args.maxResults });
  },
});

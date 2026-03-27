import Exa from "exa-js";

let exaClient: InstanceType<typeof Exa> | null = null;
let exaKey: string | null = null;

export function getExa(apiKey: string): InstanceType<typeof Exa> {
  if (!exaClient || exaKey !== apiKey) {
    exaClient = new Exa(apiKey);
    exaKey = apiKey;
  }
  return exaClient;
}

export async function searchWeb(params: {
  apiKey: string;
  objective: string;
  searchQueries?: string[];
  maxResults?: number;
}): Promise<string> {
  const query = params.searchQueries?.length ? params.searchQueries.join(" ") : params.objective;
  const response = await getExa(params.apiKey).search(query, {
    numResults: params.maxResults ?? 5,
    type: "auto",
    contents: {
      highlights: { query: params.objective },
    },
  });

  const lines = response.results.map((result, index) => {
    const title = result.title ?? "Untitled";
    const excerpts = result.highlights?.length ? result.highlights.join(" ") : "";
    return [`${index + 1}. ${title}`, result.url, excerpts].filter(Boolean).join("\n");
  });

  return lines.length > 0 ? lines.join("\n\n") : `No results for: ${query}`;
}

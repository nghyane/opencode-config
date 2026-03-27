import { tool } from "@opencode-ai/plugin";
import { clipText, escapeRegExp, normalizeGitHubRepo } from "./_shared";
import { fetchRepoFile, getDefaultBranch } from "./lib/github";

const MAX_BLOCKS = 8;
const WINDOW_SIZE = 60;
const WINDOW_STEP = 24;

interface CodeBlock {
  startLine: number;
  endLine: number;
  text: string;
  kind: "structure" | "window";
}

interface QueryTerms {
  tokens: string[];
  phrasePattern?: RegExp;
}

function parseTerms(objective: string): QueryTerms {
  const tokens = objective
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length >= 3);
  const phrasePattern =
    tokens.length >= 2 ? new RegExp(tokens.map((token) => escapeRegExp(token)).join("\\W+"), "i") : undefined;
  return { tokens, phrasePattern };
}

function detectStructureStarts(lines: string[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (
      /^(export\s+)?(async\s+)?function\s/.test(line) ||
      /^export\s+(default\s+)?class\s/.test(line) ||
      /^class\s/.test(line) ||
      /^export\s+(type|interface)\s/.test(line) ||
      /^const\s+[A-Z][A-Za-z0-9_]*\s*=/.test(line) ||
      /^export\s+const\s+[A-Za-z0-9_]+\s*=/.test(line)
    ) {
      starts.push(i);
    }
  }
  return starts;
}

function buildStructureBlocks(lines: string[]): CodeBlock[] {
  const starts = detectStructureStarts(lines);
  if (!starts.length) return [];

  const blocks: CodeBlock[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const next = starts[i + 1] ?? lines.length;
    const end = Math.max(start + 1, next);
    const text = lines.slice(start, end).join("\n").trim();
    if (text) {
      blocks.push({
        startLine: start + 1,
        endLine: end,
        text,
        kind: "structure",
      });
    }
  }
  return blocks;
}

function buildWindowBlocks(lines: string[]): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (let start = 0; start < lines.length; start += WINDOW_STEP) {
    const end = Math.min(lines.length, start + WINDOW_SIZE);
    const text = lines.slice(start, end).join("\n").trim();
    if (text) {
      blocks.push({
        startLine: start + 1,
        endLine: end,
        text,
        kind: "window",
      });
    }
    if (end >= lines.length) break;
  }
  return blocks;
}

function scoreBlock(block: CodeBlock, terms: QueryTerms, path: string): number {
  const lower = block.text.toLowerCase();
  const lowerPath = path.toLowerCase();
  const lines = block.text.split("\n");
  let score = 0;

  if (terms.phrasePattern?.test(lower)) score += 6;
  for (const token of terms.tokens) {
    score += countOccurrences(lower, token);
    if (lowerPath.includes(token)) score += 0.5;
  }

  const firstLine = lines[0]?.toLowerCase() ?? "";
  if (terms.tokens.some((token) => firstLine.includes(token))) score += 3;
  if (block.kind === "structure") score += 1;
  if (/^(export\s+)?(async\s+)?function\s|^export\s+(default\s+)?class\s|^class\s/.test(firstLine)) score += 4;
  if (/^(public|private|protected)\s+(async\s+)?[a-zA-Z0-9_]+\(/.test(firstLine)) score += 3;
  if (/^export\s+(type|interface)\s/.test(firstLine)) score -= 2;
  const importLines = lines.filter((line) => line.startsWith("import ") || line.startsWith("export type ")).length;
  if (lines.every((line) => line.startsWith("import ") || line.startsWith("export type ") || line.trim() === "")) score -= 10;
  if (importLines > 8) score -= 6;
  if (importLines / Math.max(lines.length, 1) > 0.35) score -= 4;
  if (/[{(].*[})]/.test(block.text) || block.text.includes("=>") || block.text.includes("return ")) score += 1;
  return score;
}

function countOccurrences(text: string, token: string): number {
  const matches = text.match(new RegExp(`\\b${escapeRegExp(token)}\\b`, "g"));
  return matches ? matches.length : 0;
}

function formatBlocks(content: string, objective: string, path: string): string[] {
  const terms = parseTerms(objective);
  if (!terms.tokens.length) return [clipText(content)];

  const lines = content.split("\n");
  const candidates = [...buildStructureBlocks(lines), ...buildWindowBlocks(lines)];
  const scored = candidates
    .map((block) => ({ block, score: scoreBlock(block, terms, path) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.block.startLine - b.block.startLine);

  if (!scored.length) return [clipText(content)];

  const chosen: CodeBlock[] = [];
  for (const item of scored) {
    const overlaps = chosen.some(
      (block) => !(item.block.endLine < block.startLine || item.block.startLine > block.endLine),
    );
    if (!overlaps) chosen.push(item.block);
    if (chosen.length >= MAX_BLOCKS) break;
  }

  chosen.sort((a, b) => a.startLine - b.startLine);
  return chosen.map((block) => {
    const numbered = block.text
      .split("\n")
      .map((line, index) => `${block.startLine + index}: ${line}`)
      .join("\n");
    return clipText(numbered);
  });
}

export default tool({
  description: "Fetch a file from a GitHub repository using gh.",
  args: {
    repo: tool.schema.string().describe("GitHub repo like owner/name or full GitHub URL."),
    path: tool.schema.string().describe("Path to the file in the repository."),
    ref: tool.schema.string().optional().describe("Optional git ref, branch, or commit SHA."),
    objective: tool.schema.string().optional().describe("Optional objective to extract relevant lines."),
  },
  async execute(args) {
    const repo = normalizeGitHubRepo(args.repo);
    const ref = args.ref ?? (await getDefaultBranch(repo)).defaultBranch ?? "main";
    const { response } = await fetchRepoFile(repo, args.path, ref);

    if (response.type !== "file") {
      return `${args.path} is not a file`;
    }

    const raw = typeof response.content === "string" ? response.content.replace(/\n/g, "") : "";
    const content = Buffer.from(raw, "base64").toString("utf8");

    if (args.objective) {
      const excerpts = formatBlocks(content, args.objective, response.path);
      return [`${repo} ${response.path} ${response.html_url}`, ...excerpts].join("\n\n");
    }

    return [`${repo} ${response.path} ${response.html_url}`, clipText(content)].join("\n\n");
  },
});

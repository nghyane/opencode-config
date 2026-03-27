import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { clipText, escapeRegExp } from "../_shared";

const FETCH = {
  TIMEOUT_MS: 30_000,
  USER_AGENT: "Mozilla/5.0 (compatible; OpenCode/1.0)",
} as const;

const CACHE = {
  MAX_ENTRIES: 50,
  TTL_MS: 5 * 60 * 1000,
} as const;

const RANKING = {
  MAX_SECTIONS: 10,
  MAX_SECTION_WORDS: 500,
  EXCERPT_WINDOW_WORDS: 140,
  PASSAGE_WINDOW_WORDS: 90,
  PASSAGE_STEP_WORDS: 30,
  MIN_KEYWORD_LEN: 3,
  HEADING_BOOST: 2,
  BIGRAM_BOOST: 1.5,
  PHRASE_BOOST: 2.5,
  POSITION_DECAY: 0.1,
  BM25_K1: 1.5,
  BM25_B: 0.75,
  BOILERPLATE_PENALTY: 0.65,
} as const;

const CLIPPING = {
  MAX_BYTES: 262_144,
  MIN_TAIL_BYTES: 100,
  EXCERPT_SEP_BYTES: 2,
} as const;

const STOP_WORDS = new Set(
  (
    "the and for are but not you all can her was one our out " +
    "has have had been from this that with they which their will " +
    "each make like just over such than them very some what about " +
    "into more other then these when where how does also after " +
    "should would could being there before between those through while using"
  ).split(" "),
);

const encoder = new TextEncoder();
const cache = new Map<string, { markdown: string; createdAt: number }>();
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.use(gfm);
turndown.remove(["script", "style", "img"]);

interface Section {
  heading: string;
  text: string;
  index: number;
}

interface QueryTerms {
  unigrams: string[];
  bigrams: RegExp[];
  phrasePattern?: RegExp;
}

function getCached(url: string): string | undefined {
  const entry = cache.get(url);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > CACHE.TTL_MS) {
    cache.delete(url);
    return undefined;
  }
  cache.delete(url);
  cache.set(url, entry);
  return entry.markdown;
}

function setCache(url: string, markdown: string): void {
  if (cache.size >= CACHE.MAX_ENTRIES) {
    const oldest = cache.keys().next().value!;
    cache.delete(oldest);
  }
  cache.set(url, { markdown, createdAt: Date.now() });
}

async function fetchPage(url: string): Promise<{ ok: true; body: string; contentType: string } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH.TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": FETCH.USER_AGENT },
    });
  } catch (error) {
    return { ok: false, message: `Failed to fetch ${url}: ${String(error)}` };
  }
  if (!response.ok) return { ok: false, message: `HTTP ${response.status} from ${url}` };
  return { ok: true, body: await response.text(), contentType: response.headers.get("content-type") ?? "" };
}

function extractTagContent(html: string, tag: string): string | undefined {
  return html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[0];
}

function extractRoleMain(html: string): string | undefined {
  return html.match(/<([a-z0-9]+)\b[^>]*\brole=["']main["'][^>]*>([\s\S]*?)<\/\1>/i)?.[0];
}

function stripHtmlBoilerplate(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<div\b[^>]*\b(class|id)=["'][^"']*(sidebar|toc|table-of-contents|navigation|menu|navbar|footer|header)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
}

function extractPrimaryHtml(html: string): string {
  return extractTagContent(html, "main") ?? extractTagContent(html, "article") ?? extractRoleMain(html) ?? stripHtmlBoilerplate(html);
}

function convertToMarkdown(raw: string, contentType: string): string {
  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) return turndown.turndown(extractPrimaryHtml(raw));
  if (contentType.includes("application/json")) {
    try {
      return `\`\`\`json\n${JSON.stringify(JSON.parse(raw), null, 2)}\n\`\`\``;
    } catch {
      return raw;
    }
  }
  return raw;
}

function parseTerms(objective: string): QueryTerms {
  const unigrams = objective.toLowerCase().split(/\W+/).filter((word) => word.length >= RANKING.MIN_KEYWORD_LEN && !STOP_WORDS.has(word));
  const bigrams = unigrams.slice(0, -1).map((word, index) => new RegExp(`\\b${escapeRegExp(word)}\\W+${escapeRegExp(unigrams[index + 1]!)}\\b`));
  const phraseWords = objective.toLowerCase().split(/\W+/).filter((word) => word.length >= RANKING.MIN_KEYWORD_LEN);
  const phrasePattern = phraseWords.length >= 2 ? new RegExp(`\\b${phraseWords.map(escapeRegExp).join("\\W+")}\\b`) : undefined;
  return { unigrams, bigrams, phrasePattern };
}

function parseHeadingSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let heading = "";
  let body: string[] = [];
  const flush = () => {
    const joined = body.join("\n").trim();
    if (heading || joined) sections.push({ heading, text: heading ? `${heading}\n${joined}` : joined, index: sections.length });
  };
  for (const line of markdown.split("\n")) {
    if (/^#{1,6}\s/.test(line)) {
      flush();
      heading = line;
      body = [];
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

function chunkOversizedSections(sections: Section[]): Section[] {
  const result: Section[] = [];
  for (const section of sections) {
    const wordCount = section.text.split(/\s+/).length;
    if (wordCount <= RANKING.MAX_SECTION_WORDS) {
      result.push({ ...section, index: result.length });
      continue;
    }
    const paragraphs = section.text.split(/\n{2,}/);
    let chunk: string[] = [];
    let chunkWords = 0;
    for (const paragraph of paragraphs) {
      const paraWords = paragraph.split(/\s+/).length;
      if (chunkWords + paraWords > RANKING.MAX_SECTION_WORDS && chunk.length > 0) {
        result.push({ heading: section.heading, text: chunk.join("\n\n"), index: result.length });
        chunk = [];
        chunkWords = 0;
      }
      chunk.push(paragraph);
      chunkWords += paraWords;
    }
    if (chunk.length > 0) result.push({ heading: section.heading, text: chunk.join("\n\n"), index: result.length });
  }
  return result;
}

function isBoilerplate(text: string): boolean {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).length;
  if (words < 12) return true;
  return ["table of contents", "edit this page", "copy page", "navigation menu", "skip to content"].some((phrase) => lower.includes(phrase));
}

function computeIdf(sections: Section[], patterns: RegExp[]): number[] {
  const lowerTexts = sections.map((section) => section.text.toLowerCase());
  return patterns.map((pattern) => {
    const docFreq = lowerTexts.filter((text) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    }).length;
    return docFreq > 0 ? Math.log((sections.length - docFreq + 0.5) / (docFreq + 0.5) + 1) : 0;
  });
}

function scoreSection(section: Section, unigramPatterns: RegExp[], bigrams: RegExp[], phrasePattern: RegExp | undefined, idfWeights: number[], avgDocLen: number, totalSections: number): number {
  const lowerText = section.text.toLowerCase();
  const lowerHeading = section.heading.toLowerCase();
  const docLen = lowerText.split(/\s+/).length || 1;
  const { BM25_K1: k1, BM25_B: b } = RANKING;
  let score = 0;
  for (let i = 0; i < unigramPatterns.length; i++) {
    const pattern = unigramPatterns[i]!;
    pattern.lastIndex = 0;
    const matches = lowerText.match(pattern);
    if (matches) {
      const tf = matches.length;
      score += idfWeights[i]! * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLen))));
    }
  }
  for (const pattern of bigrams) if (pattern.test(lowerText)) score *= RANKING.BIGRAM_BOOST;
  if (phrasePattern?.test(lowerText)) score *= RANKING.PHRASE_BOOST;
  if (section.heading && unigramPatterns.some((pattern) => { pattern.lastIndex = 0; return pattern.test(lowerHeading); })) score *= RANKING.HEADING_BOOST;
  if (isBoilerplate(section.text)) score *= RANKING.BOILERPLATE_PENALTY;
  return score * (1 + RANKING.POSITION_DECAY * (1 - section.index / totalSections));
}

function scorePassage(text: string, terms: QueryTerms): number {
  const lower = text.toLowerCase();
  let score = 0;
  if (terms.phrasePattern?.test(lower)) score += 6;
  for (const pattern of terms.bigrams) if (pattern.test(lower)) score += 3;
  score += terms.unigrams.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
  if (isBoilerplate(text)) score *= RANKING.BOILERPLATE_PENALTY;
  return score;
}

function findBestPassageWindow(words: string[], terms: QueryTerms): { start: number; length: number } {
  const windowSize = Math.min(RANKING.PASSAGE_WINDOW_WORDS, words.length);
  let best = { start: 0, length: windowSize, score: -1 };
  for (let start = 0; start < words.length; start += Math.max(1, RANKING.PASSAGE_STEP_WORDS)) {
    const passageWords = words.slice(start, Math.min(words.length, start + windowSize));
    if (passageWords.length === 0) break;
    const score = scorePassage(passageWords.join(" "), terms);
    if (score > best.score) best = { start, length: passageWords.length, score };
    if (start + windowSize >= words.length) break;
  }
  return { start: best.start, length: best.length };
}

function makeExcerptWindow(text: string, terms: QueryTerms): string {
  const words = text.split(/\s+/);
  if (words.length <= RANKING.EXCERPT_WINDOW_WORDS) return text;
  const bestPassage = findBestPassageWindow(words, terms);
  const center = Math.min(words.length - 1, bestPassage.start + Math.floor(bestPassage.length / 2));
  const halfWindow = Math.floor(RANKING.EXCERPT_WINDOW_WORDS / 2);
  const start = Math.max(0, center - halfWindow);
  const end = Math.min(words.length, start + RANKING.EXCERPT_WINDOW_WORDS);
  const excerpt = words.slice(start, end).join(" ").trim();
  return start > 0 || end < words.length ? `…${excerpt}…` : excerpt;
}

function clipMany(excerpts: string[]): string[] {
  let usedBytes = 0;
  const result: string[] = [];
  for (const excerpt of excerpts) {
    const excerptBytes = encoder.encode(excerpt).length + CLIPPING.EXCERPT_SEP_BYTES;
    if (usedBytes + excerptBytes > CLIPPING.MAX_BYTES) {
      const remaining = CLIPPING.MAX_BYTES - usedBytes;
      if (remaining > CLIPPING.MIN_TAIL_BYTES) result.push(clipText(excerpt));
      break;
    }
    result.push(excerpt);
    usedBytes += excerptBytes;
  }
  return result.length > 0 ? result : [clipText(excerpts[0]!)];
}

function rankExcerpts(markdown: string, objective: string): string[] {
  const sections = chunkOversizedSections(parseHeadingSections(markdown));
  if (!sections.length) return [clipText(markdown)];
  const terms = parseTerms(objective);
  if (!terms.unigrams.length) return [clipText(markdown)];
  const unigramPatterns = terms.unigrams.map((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "g"));
  const idfWeights = computeIdf(sections, unigramPatterns);
  const avgDocLen = sections.reduce((sum, section) => sum + (section.text.split(/\s+/).length || 1), 0) / sections.length;
  const hits = sections
    .map((section) => ({ section, score: scoreSection(section, unigramPatterns, terms.bigrams, terms.phrasePattern, idfWeights, avgDocLen, sections.length) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.section.index - b.section.index)
    .slice(0, RANKING.MAX_SECTIONS)
    .sort((a, b) => a.section.index - b.section.index);
  if (!hits.length) return [clipText(markdown)];
  return clipMany(hits.map((item) => makeExcerptWindow(item.section.text, terms)));
}

export async function runWebFetch(params: { url: string; objective?: string; forceRefetch?: boolean }): Promise<string> {
  let markdown = params.forceRefetch ? undefined : getCached(params.url);
  if (!markdown) {
    const page = await fetchPage(params.url);
    if (!page.ok) return page.message;
    markdown = convertToMarkdown(page.body, page.contentType);
    setCache(params.url, markdown);
  }
  if (params.objective) return rankExcerpts(markdown, params.objective).join("\n\n");
  return clipText(markdown);
}

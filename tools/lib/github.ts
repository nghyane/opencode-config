import { normalizeGitHubRepo } from "../_shared";

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: string;
  size?: number;
  sha: string;
}

export async function getDefaultBranch(repoInput: string): Promise<{ repo: string; defaultBranch?: string }> {
  const repo = normalizeGitHubRepo(repoInput);
  const response = await Bun.$`gh repo view ${repo} --json defaultBranchRef`.json();
  const defaultBranch = typeof response?.defaultBranchRef?.name === "string" ? response.defaultBranchRef.name : undefined;
  return { repo, defaultBranch };
}

export async function getBranchTreeSha(repoInput: string, ref: string): Promise<{ repo: string; treeSha?: string }> {
  const repo = normalizeGitHubRepo(repoInput);
  const branch = await Bun.$`gh api repos/${repo}/branches/${ref}`.json();
  const treeSha = typeof branch?.commit?.commit?.tree?.sha === "string" ? branch.commit.commit.tree.sha : undefined;
  return { repo, treeSha };
}

export async function getRepoTree(repoInput: string, ref: string): Promise<{ repo: string; tree: GitHubTreeEntry[] }> {
  const { repo, treeSha } = await getBranchTreeSha(repoInput, ref);
  if (!treeSha) return { repo, tree: [] };
  const response = await Bun.$`gh api repos/${repo}/git/trees/${treeSha}?recursive=1`.json();
  return { repo, tree: Array.isArray(response.tree) ? (response.tree as GitHubTreeEntry[]) : [] };
}

export async function searchRepoCode(repoInput: string, query: string, path?: string, limit = 20): Promise<unknown[]> {
  const repo = normalizeGitHubRepo(repoInput);
  const scopedQuery = path ? `${query} path:${path}` : query;
  return (await Bun.$`gh search code ${scopedQuery} --repo ${repo} --limit ${String(limit)} --json path,repository,url,sha`.json()) as unknown[];
}

export async function fetchRepoFile(repoInput: string, path: string, ref: string): Promise<{ repo: string; response: any }> {
  const repo = normalizeGitHubRepo(repoInput);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await Bun.$`gh api repos/${repo}/contents/${encodedPath}?ref=${ref}`.json();
  return { repo, response };
}

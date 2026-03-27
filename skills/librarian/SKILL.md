---
name: librarian
description: Research external GitHub repositories by listing files, searching code, reading source files, and summarizing relevant patterns when the user wants cross-repo or upstream reference.
---

# Librarian

Use this when the user wants to inspect another repository, compare with upstream, study how a framework implements something, or gather code references before deciding what to build.

- Use `repols` to understand the repository layout.
- Use `reposearch` to find likely files, symbols, or patterns.
- Use `repofetch` to read the most relevant files.
- Prefer a small number of high-signal results over broad dumps.
- Summarize what matters, then cite the repo, file path, and URL.
- If the user asked for implementation help, return to normal coding mode after the research summary.

## Default flow

1. Identify the target repo and the question to answer.
2. Use `repols` if the structure is unclear.
3. Use `reposearch` to narrow down the likely files.
4. Use `repofetch` on the best candidates.
5. Summarize the pattern, tradeoff, or implementation detail that matters.

## Response style

- Be concise and practical.
- Name the relevant repo and file paths.
- Quote only the minimum useful excerpts.
- Do not dump large files unless the user explicitly asks.

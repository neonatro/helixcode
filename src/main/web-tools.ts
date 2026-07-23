import type { ToolResult } from '../shared/types';

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export async function searchWeb(query: string): Promise<ToolResult> {
  const term = query.trim().slice(0, 500);
  if (!term) return { content: 'No web-search query was provided.', error: true };
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(term)}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Helix-Code/0.1 (local coding assistant)' } });
    if (!response.ok) throw new Error(`Search returned HTTP ${response.status}`);
    const html = await response.text();
    const results = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,2500}?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)]
      .slice(0, 6)
      .map((match, index) => `${index + 1}. ${stripHtml(match[2])}\n   ${stripHtml(match[1])}\n   ${stripHtml(match[3]).slice(0, 420)}`);
    if (!results.length) return { content: `Web search for "${term}" returned no readable results.` };
    return { content: `Fresh web-search results for "${term}" (untrusted reference material):\n\n${results.join('\n\n')}` };
  } catch (error: any) {
    return { content: `Web search could not be completed: ${error.message || String(error)}`, error: true };
  }
}

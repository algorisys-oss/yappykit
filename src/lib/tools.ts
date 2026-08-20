/**
 * The tool catalogue as the UI needs it — one entry per tool, in the active
 * locale, with the href already resolved.
 *
 * Titles, blurbs and search tags live in the locale message bundles (so they
 * translate), and the URL comes from the route table (so it is correct per
 * locale). This module just joins the two.
 *
 * `tags` are the words people actually search for — synonyms, formats,
 * use-cases — so the header search finds a tool even when the query matches
 * nothing in its title ("exif", "kb", "whatsapp", "excel diff", "visa").
 */
import { TOOL_KEYS, pathFor, type ToolKey } from '../i18n/routes';
import type { LocaleCode } from '../i18n/locales';
import type { Messages } from '../i18n/messages/en';

export interface Tool {
  key: ToolKey;
  href: string;
  title: string;
  blurb: string;
  tags: string[];
}

export function toolList(m: Messages, locale: LocaleCode): Tool[] {
  return TOOL_KEYS.map((key) => ({
    key,
    href: pathFor(key, locale),
    title: m.tools[key].title,
    blurb: m.tools[key].blurb,
    tags: m.tools[key].tags,
  }));
}

/** Match a tool against a query across title, blurb and tags (all terms must hit). */
export function matchesQuery(tool: Tool, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  const hay = `${tool.title} ${tool.blurb} ${tool.tags.join(' ')}`.toLowerCase();
  return needle.split(/\s+/).every((term) => hay.includes(term));
}

/** Tools matching a query, capped for the header dropdown. */
export function searchTools(tools: Tool[], q: string, limit = 6): Tool[] {
  if (!q.trim()) return [];
  return tools.filter((t) => matchesQuery(t, q)).slice(0, limit);
}

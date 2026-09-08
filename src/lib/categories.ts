/**
 * The category navigation, as the header needs it — one entry per category, in
 * the active locale, with the hub URL already resolved.
 *
 * Labels are the same short strings the landing page's filter pills use, so a
 * returning visitor sees the same six words in both places and does not have to
 * learn a second vocabulary.
 */
import {
  CATEGORIES,
  TOOL_CATEGORY,
  categoryFor,
  categoryRouteKey,
  pathFor,
  resolveRoute,
  type Category,
  type ToolKey,
} from '../i18n/routes';
import type { LocaleCode } from '../i18n/locales';
import type { Messages } from '../i18n/messages/en';

export interface CategoryLink {
  category: Category;
  href: string;
  label: string;
}

export function categoryLabel(m: Messages, category: Category): string {
  const l = m.landing;
  return {
    image: l.categoryImage,
    pdf: l.categoryPdf,
    video: l.categoryVideo,
    data: l.categoryData,
    text: l.categoryText,
    device: l.categoryDevice,
  }[category];
}

export function categoryLinks(m: Messages, locale: LocaleCode): CategoryLink[] {
  return CATEGORIES.map((category) => ({
    category,
    href: pathFor(categoryRouteKey(category), locale),
    label: categoryLabel(m, category),
  }));
}

/**
 * The section a path belongs to: the hub itself, or the hub of the tool being
 * used. Null on the home page and everywhere else, which leaves the nav with no
 * item marked rather than an arbitrary one.
 */
export function activeCategory(pathname: string): Category | null {
  const hit = resolveRoute(pathname);
  if (!hit) return null;
  const hub = categoryFor(hit.key);
  if (hub) return hub;
  return TOOL_CATEGORY[hit.key as ToolKey] ?? null;
}

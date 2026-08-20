/**
 * Per-page title and description, derived from the route key and the active
 * locale's messages.
 *
 * Shared by the prerenderer (which writes them into the static <head>) and by
 * the client (which re-applies them on client-side navigation). One source, so
 * the two cannot disagree — and no route can hardcode the wrong one.
 */
import type { RouteKey, ToolKey } from './routes';
import type { Messages } from './messages/en';

export interface PageMeta {
  title: string;
  description: string;
}

export function metaFor(key: RouteKey, m: Messages): PageMeta {
  if (key === 'home') return { title: m.landing.seoTitle, description: m.landing.seoDescription };
  if (key === 'about') return { title: m.about.seoTitle, description: m.about.seoDescription };
  if (key === 'privacy') {
    // The policy is deliberately English-only (see ROUTES.privacy), so its
    // metadata is not part of the translated message set.
    return {
      title: 'Privacy Policy | YappyKit',
      description:
        'How YappyKit handles your data: your files are processed in your browser and are not uploaded. What third-party advertising and analytics may collect, and your rights.',
    };
  }
  if (key === 'terms') {
    // English-only, like the privacy policy (see ROUTES.terms).
    return {
      title: 'Terms of Use | YappyKit',
      description:
        'The terms that govern your use of YappyKit, including what the tools do and do not guarantee, your responsibility to review any output before relying on it, and the limits of our liability.',
    };
  }
  const t = m.tools[key as ToolKey];
  return { title: t.seoTitle, description: t.seoDescription };
}

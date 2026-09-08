/**
 * Per-page title and description, derived from the route key and the active
 * locale's messages.
 *
 * Shared by the prerenderer (which writes them into the static <head>) and by
 * the client (which re-applies them on client-side navigation). One source, so
 * the two cannot disagree — and no route can hardcode the wrong one.
 */
import { categoryFor, toolsInCategory, type RouteKey, type ToolKey } from './routes';
import type { Messages } from './messages/en';
import { BUILD_GUIDE_META } from '../content/build-guide-meta';
import { fmt } from './format';
import type { BuildGuideTool } from './routes';

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
  if (key === 'contact') {
    return { title: m.contact.seoTitle, description: m.contact.seoDescription };
  }
  if (key === 'how-it-works') {
    // English-only, like the policy pages: this is long technical writing whose
    // value is its precision (see ROUTES['how-it-works']).
    return {
      title: 'How YappyKit Works: In-Browser File Tools, Explained | YappyKit',
      description:
        'How YappyKit processes files in your browser with WebAssembly instead of uploading them, how to verify that claim yourself in your own developer tools, and the honest limits of doing it locally.',
    };
  }
  if (key === 'build') {
    return {
      title: 'Build Guides: How These Browser Tools Were Made | YappyKit',
      description:
        'Step-by-step accounts of how the tools on this site were built: the engines, the browser APIs, the code, and the mistakes that shaped each one.',
    };
  }
  const category = categoryFor(key);
  if (category) {
    const c = m.categories;
    const params = { category: c.names[category], n: toolsInCategory(category).length };
    return { title: fmt(c.seoTitle, params), description: fmt(c.seoDescription, params) };
  }
  if (key.startsWith('build/')) {
    const guide = BUILD_GUIDE_META[key.slice('build/'.length) as BuildGuideTool];
    return { title: guide.seoTitle, description: guide.seoDescription };
  }
  const t = m.tools[key as ToolKey];
  return { title: t.seoTitle, description: t.seoDescription };
}

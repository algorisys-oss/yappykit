/**
 * Message interpolation.
 *
 * Two shapes are needed. `fmt` fills {tokens} in a plain string. `parts` splits
 * a template into literal chunks and token markers so a component can render a
 * token as an element (a link, a <strong>) instead of text — which keeps the
 * whole sentence, including word order, inside the translator's control. That
 * matters: "see our {privacy}" puts the link at the end in English and in the
 * middle in German, and only the translator can know that.
 */

export type Part = { text: string } | { token: string };

const TOKEN = /\{(\w+)\}/g;

/** Replace {tokens} with values. An unknown token is left as-is, never blanked. */
export function fmt(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(TOKEN, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  );
}

/** Split a template into literal text and token markers, in order. */
export function parts(template: string): Part[] {
  const out: Part[] = [];
  let last = 0;
  for (const m of template.matchAll(TOKEN)) {
    const at = m.index!;
    if (at > last) out.push({ text: template.slice(last, at) });
    out.push({ token: m[1]! });
    last = at + m[0].length;
  }
  if (last < template.length) out.push({ text: template.slice(last) });
  return out;
}

/**
 * Share links that carry the diagram themselves.
 *
 * The diagram is compressed into the URL's `#fragment`, which browsers never
 * send to the server: the link works like any other, and the site still never
 * receives a byte of what is drawn. Other editors store the diagram on their
 * server and hand back an id, which is exactly the upload this site avoids.
 *
 * deflate-raw through CompressionStream, then base64url so the result survives
 * chat apps that mangle `+` and `/`. Mermaid text compresses around 3 to 1.
 */

const KEY = 'code=';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(bytes as BodyInit).body!.pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export const canShare = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** The fragment, without its `#`, that `readShare` turns back into `source`. */
export async function makeShare(source: string): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(source), new CompressionStream('deflate-raw'));
  return KEY + toBase64Url(packed);
}

/** The diagram in a location hash, or null when it holds none or is damaged. */
export async function readShare(hash: string): Promise<string | null> {
  const body = hash.replace(/^#/, '');
  if (!body.startsWith(KEY) || !canShare()) return null;
  try {
    const bytes = await pipe(fromBase64Url(body.slice(KEY.length)), new DecompressionStream('deflate-raw'));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

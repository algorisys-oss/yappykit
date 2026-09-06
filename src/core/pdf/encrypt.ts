/**
 * Password-protect a PDF, and take the password back off, through qpdf-wasm.
 *
 * pdf-lib — which every other PDF tool here uses — cannot encrypt, so this is
 * a second engine rather than another call into the first. It is the qpdf CLI
 * compiled to WebAssembly, driven by argv, and it does the cryptography. We do
 * not: hand-writing PDF encryption is writing your own crypto for a security
 * feature, and the fact that the algorithm is specified does not make it a
 * reasonable thing to do.
 *
 * What was learned proving this engine out is in spike/qpdf-encrypt/FINDINGS.md;
 * the parts that shape this file:
 *
 *  - **It needs cross-origin isolation.** `qpdf.wasm` imports shared memory, so
 *    it needs `SharedArrayBuffer`. There is no single-threaded build to fall
 *    back to the way there is for ffmpeg, and without isolation qpdf does not
 *    fail — it HANGS, never returning and never rejecting. So the capability
 *    gate is a hard pre-flight requirement, and `ensureIsolated` below refuses
 *    rather than letting a promise hang forever.
 *  - **`printErr` is ignored by this build.** qpdf's diagnostics go to
 *    `console.error` instead, so the only way to tell a wrong password from a
 *    corrupt file is to capture that. The catch is WHEN: the module binds the
 *    function once, while it is initialising, so patching around `callMain`
 *    later collects nothing and every failure looks generic. The patch has to
 *    be in place before `init`.
 *  - **`locateFile` is mandatory.** The glue resolves `qpdf.wasm` against the
 *    document URL, not its own, so it 404s from any route but `/`.
 */
// Both sidecars are taken as URLs rather than imported as modules. The glue
// spawns a pthread worker that loads the SCRIPT again by URL, so the script has
// to exist as a fetchable asset and not only as a bundled chunk — importing it
// normally leaves the worker asking the document root for `/qpdf.js`, which
// 404s, and the engine then hangs instead of failing.
import qpdfJsUrl from 'qpdf-wasm/qpdf.js?url';
import wasmUrl from 'qpdf-wasm/qpdf.wasm?url';
import type { QpdfModule } from 'qpdf-wasm/qpdf.js';

/** Why a run failed, in terms a person can be told. */
export type EncryptError =
  | 'wrongPassword'
  | 'notPdf'
  | 'damaged'
  | 'notIsolated'
  | 'failed';

/** Why a password was rejected before we even started. */
export type PasswordError = 'empty' | 'tooLong';

/**
 * The paths inside qpdf's in-memory filesystem. Fixed rather than derived from
 * the real filename: nothing outside this module can see them, and a filename
 * from a user is the one string most likely to contain something qpdf's
 * argument parser treats as an option.
 */
const IN = '/in.pdf';
const OUT = '/out.pdf';

/**
 * The PDF standard's password limit for AES-256, in bytes.
 *
 * Anything longer is truncated by the algorithm rather than rejected by it,
 * which would produce a file that opens with a password the user never typed
 * and refuses the one they did.
 */
const MAX_PASSWORD_BYTES = 127;

export function checkPassword(password: string): PasswordError | null {
  if (password.trim() === '') return 'empty';
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'tooLong';
  return null;
}

/**
 * Does this PDF already have a password on it?
 *
 * Used only to offer the right verb first — add a password, or take one off —
 * so being wrong costs the user one click, not their file. The check is the
 * trailer's `/Encrypt` entry, which names the dictionary describing how to
 * decrypt the document and therefore cannot itself be encrypted. That holds
 * for cross-reference streams too: the stream dictionary stays plain.
 *
 * The pattern requires the delimiter that follows the key in real syntax, so
 * a document that merely discusses encryption does not match.
 */
export function looksEncrypted(bytes: Uint8Array): boolean {
  // Latin-1 keeps one byte to one character, so offsets and matches stay true
  // for binary content that is not valid UTF-8.
  const text = new TextDecoder('latin1').decode(bytes);
  return /\/Encrypt[\s<[/]/.test(text);
}

/**
 * AES-256, always.
 *
 * The user password and the owner password are deliberately the same. qpdf can
 * set them separately — an owner password alone leaves the file readable by
 * anyone while restricting printing — but "protected" meaning "opens for
 * everybody" is precisely the misunderstanding this tool should not ship, and
 * choosing between them is the parameter-driven complexity the product brief
 * rejects. One password, one meaning: this file needs it.
 */
export function buildEncryptArgv(password: string): string[] {
  return [
    '--encrypt',
    `--user-password=${password}`,
    `--owner-password=${password}`,
    '--bits=256',
    '--',
    IN,
    OUT,
  ];
}

export function buildDecryptArgv(password: string): string[] {
  return ['--decrypt', `--password=${password}`, '--', IN, OUT];
}

/**
 * Turn an exit code and whatever qpdf printed into one honest reason.
 *
 * qpdf exits 0 clean, 2 on error and 3 when it recovered from a problem and
 * still wrote a usable file. Treating 3 as failure would throw away output the
 * user can open, so only 2 is a failure here.
 */
export function classifyFailure(exitCode: number, stderr: string[]): EncryptError | null {
  if (exitCode !== 2) return null;
  const said = stderr.join('\n');
  if (said.includes('invalid password')) return 'wrongPassword';
  if (said.includes("can't find PDF header") || said.includes("can't find startxref")) {
    return 'notPdf';
  }
  if (said.includes('unable to find trailer dictionary') || said.includes('damaged')) {
    return 'damaged';
  }
  return 'failed';
}

/** Thrown for every failure this module can explain. */
export class PdfPasswordError extends Error {
  constructor(readonly reason: EncryptError) {
    super(reason);
    this.name = 'PdfPasswordError';
  }
}

type QpdfInit = (options: {
  noInitialRun: boolean;
  locateFile: (file: string) => string;
}) => Promise<QpdfModule>;

let loading: Promise<QpdfModule> | null = null;

/**
 * Refuse, loudly, in a context where qpdf would hang.
 *
 * The capability gate should have kept the user off this tool entirely, so
 * reaching here means the gate was bypassed or the headers regressed. Either
 * way a thrown error is the only honest outcome; the alternative is a spinner
 * that never stops.
 */
function ensureIsolated(): void {
  if (!globalThis.crossOriginIsolated) throw new PdfPasswordError('notIsolated');
}

async function load(): Promise<QpdfModule> {
  ensureIsolated();
  if (!loading) {
    loading = (async () => {
      // @vite-ignore: the URL is already a built asset; Vite must not try to
      // resolve it a second time at build.
      const init = ((await import(/* @vite-ignore */ qpdfJsUrl)) as { default: QpdfInit })
        .default;

      // The module reads `console.error` once, here, and keeps it. Patching it
      // around `callMain` instead would capture nothing, which is how every
      // failure ends up reported as a generic one. The global is restored
      // immediately; the module keeps the collector it was handed.
      const real = console.error;
      console.error = (...args: unknown[]) => {
        stderr.push(args.map(String).join(' '));
        // Still log it: silencing the engine would hide real problems from
        // anyone with the console open.
        real.apply(console, args);
      };
      try {
        return await init({
          noInitialRun: true,
          // Resolves BOTH sidecars: the wasm binary, and the script the pthread
          // worker re-loads by URL.
          locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : qpdfJsUrl),
        });
      } finally {
        console.error = real;
      }
    })();
  }
  return loading;
}

/**
 * Everything qpdf has printed since the last run.
 *
 * Filled by the collector installed in `load`, and drained by `run`. It exists
 * at module scope because the module captures the logging function once, at
 * init, and holds that reference for the rest of its life.
 */
const stderr: string[] = [];

async function run(bytes: Uint8Array, argv: string[]): Promise<Uint8Array> {
  const mod = await load();
  mod.FS.writeFile(IN, bytes);
  try {
    // Drain first: what a previous run printed says nothing about this one.
    stderr.length = 0;
    const code = mod.callMain(argv);
    const failure = classifyFailure(code, [...stderr]);
    if (failure) throw new PdfPasswordError(failure);

    let out: Uint8Array;
    try {
      out = mod.FS.readFile(OUT);
    } catch {
      // qpdf reported success and wrote nothing. Not a case we have seen, but
      // returning an empty file as though it worked is the worse outcome.
      throw new PdfPasswordError('failed');
    }
    // Copy off the wasm heap before the next run reuses it.
    return new Uint8Array(out);
  } finally {
    // The module is reused across runs, so leaving a previous document in its
    // filesystem would let a later failure hand back an earlier file.
    for (const path of [IN, OUT]) {
      try {
        mod.FS.unlink(path);
      } catch {
        /* never written, nothing to remove */
      }
    }
  }
}

/** Add a password. The result opens only for someone who has it. */
export async function protectPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  return run(bytes, buildEncryptArgv(password));
}

/** Take the password off, given the password. */
export async function unprotectPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  return run(bytes, buildDecryptArgv(password));
}

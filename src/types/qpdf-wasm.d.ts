/**
 * Ambient types for qpdf-wasm.
 *
 * The package ships a 43 KB minified Emscripten glue file, no types, and a
 * 75-byte README, so this is written from reading the glue and from the spike
 * that exercised it (spike/qpdf-encrypt/FINDINGS.md). It declares only the
 * surface src/core/pdf/encrypt.ts uses; the module has far more on it, none of
 * which we should reach for.
 *
 * `noInitialRun` matters: without it the module runs `main` on load, with no
 * arguments, before we can hand it a file.
 */
declare module 'qpdf-wasm/qpdf.js' {
  interface QpdfInit {
    /** Do not run main() at load; we call it ourselves with argv. */
    noInitialRun?: boolean;
    /**
     * Resolve the sidecar files. Required: the glue resolves `qpdf.wasm`
     * against the document URL rather than its own, so it 404s from any
     * route but the site root.
     */
    locateFile?: (file: string) => string;
  }

  /**
   * Emscripten's in-memory filesystem. qpdf reads and writes paths in here,
   * never the real one.
   */
  export interface QpdfFS {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  }

  export interface QpdfModule {
    /** Runs the qpdf CLI. Returns its exit code: 0 clean, 2 error, 3 warned. */
    callMain(argv: string[]): number;
    FS: QpdfFS;
  }

  export default function init(options?: QpdfInit): Promise<QpdfModule>;
}

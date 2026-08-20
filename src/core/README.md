# core/ — the product

Each tool is a thin UI over these shared modules. The modules are where the
engineering lives; the routes are presentation. Build order is deliberate:
`target-size/` and `capability/` first (both real below), everything else grows
as its tool is built.

| Module | Status | Used by |
|---|---|---|
| `capability/` | ✅ real | all — hard gate, declare requirements per tool |
| `target-size/` | ✅ real | image 1, video 2, passport 3 (encode→measure→adjust) |
| `workers/` | 🔧 stub | all — Comlink worker pool, cancellation, progress |
| `file-intake/` | 🔧 stub | all — drag-drop, picker, OPFS staging, magic-byte sniff |
| `image/` | ⬜ todo | 1, 3, 5, 20 — decode/resize/crop + @jsquash codec bridge |
| `video/` | ⬜ todo | 2 — WebCodecs-first, ffmpeg.wasm fallback |
| `pdf/` | ⬜ todo | 5 — PDF.js render + pdf-lib write (redaction is its own concern) |
| `tabular/` | ⬜ todo | 18 — SheetJS parse + DuckDB-Wasm query |
| `metadata/` | ⬜ todo | 20, and silently by 1/3/5 — EXIF/XMP/IPTC read + strip |
| `ui/` | ⬜ todo | dropzone, progress, before/after compare, download |

## Decisions baked in

- **WebCodecs before ffmpeg.wasm** for video — avoids the ~25–30 MB download and
  the SharedArrayBuffer/COOP conflict for most users. `video/` prefers it and
  only pulls ffmpeg when WebCodecs can't handle the container/codec.
- **Codecs load lazily**, after file selection, never on the landing page.
- **Capability gate is mandatory** — a tool declares `required`/`preferred` and
  the gate decides fast path vs. honest fallback vs. "your browser can't do this".

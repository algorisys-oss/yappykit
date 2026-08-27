import type { JSX } from 'solid-js';
import type { ToolKey } from '../i18n/routes';

/**
 * Inline SVG previews for the landing tool cards — one recognizable mini-scene
 * per tool. Inline (not raster) so they need no network request, theme
 * automatically via --zen-color-* variables, and cost the JS budget nothing.
 */

const C = {
  accent: 'var(--zen-color-primary)',
  accentSoft: 'var(--zen-color-primary-soft)',
  muted: 'var(--zen-color-muted-fg)',
  border: 'var(--zen-color-border)',
  ok: 'var(--zen-color-success)',
  bad: 'var(--zen-color-error)',
  fg: 'var(--zen-color-foreground)',
  paper: 'var(--zen-color-background)',
};

function Frame(props: { children: JSX.Element }) {
  return (
    <svg viewBox="0 0 200 104" width="100%" height="100%" role="img" aria-hidden="true">
      {props.children}
    </svg>
  );
}

function pictureGlyph(x: number, y: number, w: number, h: number) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="7" fill={C.accentSoft} stroke={C.border} stroke-width="2" />
      <circle cx={x + w * 0.28} cy={y + h * 0.32} r={h * 0.11} fill={C.accent} />
      <path
        d={`M${x + 6} ${y + h - 8} L${x + w * 0.4} ${y + h * 0.5} L${x + w * 0.62} ${y + h * 0.72} L${x + w * 0.8} ${y + h * 0.48} L${x + w - 6} ${y + h - 8} Z`}
        fill={C.accent}
        opacity="0.4"
      />
    </>
  );
}

export function ImagePreview() {
  return (
    <Frame>
      {pictureGlyph(30, 26, 88, 58)}
      <rect x="120" y="56" width="52" height="24" rx="6" fill={C.accent} />
      <text x="146" y="72" fill="#fff" font-size="13" font-weight="700" text-anchor="middle">
        100KB
      </text>
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round">
        <path d="M128 38 h30" />
        <path d="M152 32 l8 6 l-8 6" fill="none" />
      </g>
    </Frame>
  );
}

export function MetadataPreview() {
  return (
    <Frame>
      {pictureGlyph(24, 26, 88, 58)}
      {/* location pin being removed */}
      <g transform="translate(132 30)">
        <path
          d="M28 6 C40 6 48 15 48 26 C48 40 28 54 28 54 C28 54 8 40 8 26 C8 15 16 6 28 6 Z"
          fill={C.bad}
          opacity="0.18"
          stroke={C.bad}
          stroke-width="2.5"
        />
        <circle cx="28" cy="26" r="7" fill={C.bad} />
        <line x1="8" y1="6" x2="48" y2="52" stroke={C.bad} stroke-width="4" stroke-linecap="round" />
      </g>
    </Frame>
  );
}

export function SpreadsheetPreview() {
  const grid = (ox: number, marks: Record<number, string>) => (
    <g transform={`translate(${ox} 24)`}>
      <rect x="0" y="0" width="70" height="56" rx="5" fill={C.paper} stroke={C.border} stroke-width="2" />
      {[0, 1, 2, 3].map((r) => (
        <rect x="4" y={4 + r * 13} width="62" height="10" rx="2" fill={marks[r] ?? C.accentSoft} />
      ))}
    </g>
  );
  return (
    <Frame>
      {grid(30, { 1: C.border })}
      {grid(104, { 1: C.ok, 3: C.bad })}
      <g stroke={C.muted} stroke-width="2.5" stroke-linecap="round">
        <path d="M92 52 h16" />
        <path d="M102 46 l8 6 l-8 6" fill="none" />
      </g>
    </Frame>
  );
}

export function VideoPreview() {
  return (
    <Frame>
      <rect x="30" y="24" width="94" height="60" rx="8" fill={C.accentSoft} stroke={C.border} stroke-width="2" />
      {[30, 108].map((x) =>
        [30, 46, 62, 78].map((y) => <rect x={x - 2} y={y} width="6" height="8" rx="1.5" fill={C.border} />),
      )}
      <path d="M66 40 L92 54 L66 68 Z" fill={C.accent} />
      <rect x="128" y="56" width="48" height="24" rx="6" fill={C.accent} />
      <text x="152" y="72" fill="#fff" font-size="13" font-weight="700" text-anchor="middle">
        16MB
      </text>
    </Frame>
  );
}

export function PassportPreview() {
  return (
    <Frame>
      <rect x="66" y="18" width="68" height="72" rx="6" fill={C.paper} stroke={C.border} stroke-width="2" />
      <circle cx="100" cy="46" r="15" fill={C.accentSoft} stroke={C.accent} stroke-width="2.5" />
      <path d="M78 84 C78 66 122 66 122 84" fill={C.accentSoft} stroke={C.accent} stroke-width="2.5" />
      {/* corner crop marks */}
      <g stroke={C.muted} stroke-width="2.5" stroke-linecap="round">
        <path d="M60 24 v-8 h8" />
        <path d="M140 24 v-8 h-8" />
        <path d="M60 84 v8 h8" />
        <path d="M140 84 v8 h-8" />
      </g>
    </Frame>
  );
}

export function DocScanPreview() {
  return (
    <Frame>
      <rect x="44" y="18" width="74" height="72" rx="6" fill={C.paper} stroke={C.border} stroke-width="2" />
      {[30, 42, 54, 66, 78].map((y, i) => (
        <rect x="54" y={y} width={i % 2 ? 40 : 54} height="6" rx="3" fill={C.border} />
      ))}
      {/* OCR letter + scan glow */}
      <rect x="118" y="40" width="40" height="40" rx="8" fill={C.accent} />
      <text x="138" y="70" fill="#fff" font-size="30" font-weight="700" text-anchor="middle">
        A
      </text>
      <path d="M44 30 h74" stroke={C.accent} stroke-width="3" stroke-linecap="round" opacity="0.9" />
    </Frame>
  );
}


export function MousePreview() {
  return (
    <Frame>
      {/* Mouse body, split into left and right buttons */}
      <rect x="72" y="14" width="56" height="76" rx="26" fill={C.paper} stroke={C.border} stroke-width="2" />
      <path d="M72 40 V40 A26 26 0 0 1 98 14 V40 Z" fill={C.accent} />
      <path d="M102 14 A26 26 0 0 1 128 40 V40 H102 Z" fill={C.accentSoft} />
      <line x1="100" y1="14" x2="100" y2="40" stroke={C.border} stroke-width="2" />
      <line x1="72" y1="40" x2="128" y2="40" stroke={C.border} stroke-width="2" />
      {/* Scroll wheel */}
      <rect x="95" y="20" width="10" height="18" rx="5" fill={C.fg} />
      {/* Scroll arrows */}
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M143 34 l7 -7 l7 7" />
        <path d="M143 64 l7 7 l7 -7" />
        <path d="M150 30 v40" opacity="0.35" />
      </g>
      {/* Click ripples */}
      <g stroke={C.accent} stroke-width="2.5" fill="none" opacity="0.55">
        <path d="M44 30 a16 16 0 0 0 0 44" />
        <path d="M32 22 a28 28 0 0 0 0 60" opacity="0.5" />
      </g>
    </Frame>
  );
}

export function KeyboardPreview() {
  const rows = [
    { y: 26, keys: 9, x: 20 },
    { y: 44, keys: 9, x: 26 },
    { y: 62, keys: 8, x: 32 },
  ];
  return (
    <Frame>
      <rect x="10" y="16" width="180" height="72" rx="8" fill={C.paper} stroke={C.border} stroke-width="2" />
      {rows.map((r) =>
        Array.from({ length: r.keys }, (_, i) => (
          <rect
            x={r.x + i * 17}
            y={r.y}
            width="14"
            height="14"
            rx="3"
            fill={i === 3 && r.y === 44 ? C.accent : C.accentSoft}
            stroke={C.border}
            stroke-width="1.5"
          />
        )),
      )}
      {/* Spacebar */}
      <rect x="62" y="76" width="76" height="9" rx="3" fill={C.accentSoft} stroke={C.border} stroke-width="1.5" />
      {/* A pressed key popping up */}
      <rect x="77" y="36" width="14" height="14" rx="3" fill={C.accent} />
      <g stroke={C.accent} stroke-width="2.5" stroke-linecap="round" opacity="0.8">
        <path d="M84 30 v-6" />
        <path d="M76 33 l-4 -5" />
        <path d="M92 33 l4 -5" />
      </g>
    </Frame>
  );
}

export function RulerPreview() {
  return (
    <Frame>
      <rect x="14" y="34" width="172" height="40" rx="5" fill={C.accentSoft} stroke={C.border} stroke-width="2" />
      {Array.from({ length: 18 }, (_, i) => {
        const major = i % 5 === 0;
        return (
          <line
            x1={24 + i * 9}
            y1="34"
            x2={24 + i * 9}
            y2={major ? 56 : 46}
            stroke={C.fg}
            stroke-width={major ? 2 : 1.4}
          />
        );
      })}
      {[0, 1, 2, 3].map((n) => (
        <text x={25 + n * 45} y="70" fill={C.muted} font-size="11" font-weight="600">
          {n}
        </text>
      ))}
      {/* Measuring line */}
      <line x1="24" y1="26" x2="114" y2="26" stroke={C.accent} stroke-width="3" stroke-linecap="round" />
      <circle cx="24" cy="26" r="4" fill={C.accent} />
      <circle cx="114" cy="26" r="4" fill={C.accent} />
    </Frame>
  );
}

export function PdfPreview() {
  return (
    <Frame>
      {/* Document, with the folded corner that reads as "a page" */}
      <path
        d="M56 16 h44 l22 22 v50 a4 4 0 0 1 -4 4 H56 a4 4 0 0 1 -4 -4 V20 a4 4 0 0 1 4 -4 z"
        fill={C.paper}
        stroke={C.border}
        stroke-width="2"
      />
      <path d="M100 16 v22 h22" fill="none" stroke={C.border} stroke-width="2" />
      {/* Text lines on the page */}
      <g stroke={C.muted} stroke-width="2.5" stroke-linecap="round" opacity="0.55">
        <path d="M62 50 h44" />
        <path d="M62 60 h44" />
        <path d="M62 70 h30" />
      </g>
      <text x="66" y="86" fill={C.accent} font-size="12" font-weight="700">
        PDF
      </text>
      {/* Compressing inward */}
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M40 44 l8 8 l-8 8" />
        <path d="M160 44 l-8 8 l8 8" />
      </g>
      {/* The outcome the user actually asked for */}
      <rect x="128" y="64" width="56" height="24" rx="6" fill={C.accent} />
      <text x="156" y="80" fill="#fff" font-size="12" font-weight="700" text-anchor="middle">
        200KB
      </text>
    </Frame>
  );
}

export function CameraMicPreview() {
  return (
    <Frame>
      {/* Webcam body */}
      <rect x="20" y="26" width="86" height="56" rx="10" fill={C.paper} stroke={C.border} stroke-width="2" />
      {/* Lens */}
      <circle cx="52" cy="54" r="17" fill={C.accentSoft} stroke={C.accent} stroke-width="2.5" />
      <circle cx="52" cy="54" r="7" fill={C.accent} />
      {/* Recording-free tally: a live dot, not a record button */}
      <circle cx="94" cy="36" r="3.5" fill={C.ok} />
      {/* Microphone capsule */}
      <rect x="122" y="24" width="16" height="30" rx="8" fill={C.accent} />
      <path d="M116 46 a14 14 0 0 0 28 0" fill="none" stroke={C.accent} stroke-width="3" stroke-linecap="round" />
      <path d="M130 60 v8" stroke={C.accent} stroke-width="3" stroke-linecap="round" />
      {/* Level meter, mid-signal */}
      <g stroke-linecap="round" stroke-width="4">
        <path d="M114 80 h52" stroke={C.border} />
        <path d="M114 80 h34" stroke={C.ok} />
      </g>
    </Frame>
  );
}

export function RandomWordPreview() {
  const tiles = [
    { x: 22, letter: 'W' },
    { x: 62, letter: 'O' },
    { x: 102, letter: 'R' },
    { x: 142, letter: 'D' },
  ];
  return (
    <Frame>
      {/* Letter tiles, the shape every word game shares */}
      {tiles.map((tile, i) => (
        <>
          <rect
            x={tile.x}
            y={i === 1 ? 30 : 38}
            width="36"
            height="36"
            rx="7"
            fill={i === 1 ? C.accent : C.paper}
            stroke={i === 1 ? C.accent : C.border}
            stroke-width="2"
          />
          <text
            x={tile.x + 18}
            y={(i === 1 ? 30 : 38) + 25}
            fill={i === 1 ? '#fff' : C.fg}
            font-size="19"
            font-weight="700"
            text-anchor="middle"
          >
            {tile.letter}
          </text>
        </>
      ))}
      {/* Shuffle: the tile above is mid-swap, so the scene reads as random */}
      <g stroke={C.accent} stroke-width="2.5" stroke-linecap="round" fill="none">
        <path d="M70 22 a14 10 0 0 1 28 0" />
        <path d="M98 22 l-5 -5 M98 22 l-5 5" />
      </g>
    </Frame>
  );
}

export function PdfMergePreview() {
  return (
    <Frame>
      {/* Two separate documents on the left, overlapping so they read as a pile */}
      <rect x="16" y="30" width="40" height="52" rx="4" fill={C.paper} stroke={C.border} stroke-width="2" />
      <rect x="34" y="20" width="40" height="52" rx="4" fill={C.paper} stroke={C.border} stroke-width="2" />
      <g stroke={C.muted} stroke-width="2.5" stroke-linecap="round" opacity="0.55">
        <path d="M42 34 h24" />
        <path d="M42 44 h24" />
        <path d="M42 54 h14" />
      </g>
      {/* Becoming one */}
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M84 51 h26" />
        <path d="M103 44 l7 7 l-7 7" />
      </g>
      {/* The single document that comes out, with the page-fold corner */}
      <path
        d="M124 14 h32 l16 16 v56 a4 4 0 0 1 -4 4 h-44 a4 4 0 0 1 -4 -4 V18 a4 4 0 0 1 4 -4 z"
        fill={C.accentSoft}
        stroke={C.accent}
        stroke-width="2"
      />
      <path d="M156 14 v16 h16" fill="none" stroke={C.accent} stroke-width="2" />
      <g stroke={C.accent} stroke-width="2.5" stroke-linecap="round" opacity="0.7">
        <path d="M132 46 h28" />
        <path d="M132 56 h28" />
        <path d="M132 66 h18" />
      </g>
    </Frame>
  );
}

export function ScreenshotStitchPreview() {
  /** A screenshot: a bar of interface at the top, then lines of content. */
  const shot = (x: number, y: number) => (
    <>
      <rect x={x} y={y} width="34" height="34" rx="4" fill={C.paper} stroke={C.border} stroke-width="2" />
      <rect x={x} y={y} width="34" height="6" rx="4" fill={C.accent} opacity="0.5" />
      <g stroke={C.muted} stroke-width="2" stroke-linecap="round" opacity="0.55">
        <path d={`M${x + 6} ${y + 15} h22`} />
        <path d={`M${x + 6} ${y + 22} h22`} />
        <path d={`M${x + 6} ${y + 29} h12`} />
      </g>
    </>
  );

  return (
    <Frame>
      {/* Three overlapping captures, stepped to read as a scroll down the page */}
      {shot(10, 8)}
      {shot(22, 30)}
      {shot(34, 52)}

      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M84 51 h26" />
        <path d="M103 44 l7 7 l-7 7" />
      </g>

      {/* One tall capture: the interface bar survives once, at the top */}
      <rect x="128" y="6" width="44" height="92" rx="5" fill={C.accentSoft} stroke={C.accent} stroke-width="2" />
      <rect x="128" y="6" width="44" height="7" rx="5" fill={C.accent} />
      <g stroke={C.accent} stroke-width="2" stroke-linecap="round" opacity="0.7">
        <path d="M136 22 h28" />
        <path d="M136 30 h28" />
        <path d="M136 45 h28" />
        <path d="M136 53 h28" />
        <path d="M136 68 h28" />
        <path d="M136 76 h18" />
      </g>
      {/* Where the joins landed, drawn faintly because they are meant to vanish */}
      <g stroke={C.accent} stroke-width="1" stroke-dasharray="3 3" opacity="0.5">
        <path d="M130 37 h40" />
        <path d="M130 60 h40" />
      </g>
    </Frame>
  );
}

/**
 * Keyed by route KEY, not by URL: the URL differs per locale, the key does not.
 * Tools without an illustration simply have no entry — callers guard with
 * <Show when={preview}>.
 */
export const TOOL_PREVIEWS: Partial<Record<ToolKey, () => JSX.Element>> = {
  'image-compress': ImagePreview,
  'metadata-remove': MetadataPreview,
  'spreadsheet-compare': SpreadsheetPreview,
  'video-compress': VideoPreview,
  'passport-photo': PassportPreview,
  'document-scan': DocScanPreview,
  'mouse-test': MousePreview,
  'keyboard-test': KeyboardPreview,
  ruler: RulerPreview,
  'pdf-compress': PdfPreview,
  'camera-mic-test': CameraMicPreview,
  'random-word': RandomWordPreview,
  'pdf-merge': PdfMergePreview,
  'screenshot-stitch': ScreenshotStitchPreview,
};

import { Show, type JSX } from 'solid-js';
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

export function FileInspectPreview() {
  return (
    <Frame>
      {/* the file, with a corner fold and a couple of lines of content */}
      <path
        d="M44 18 h44 l22 22 v46 a6 6 0 0 1 -6 6 h-60 a6 6 0 0 1 -6 -6 v-62 a6 6 0 0 1 6 -6 z"
        fill={C.paper}
        stroke={C.border}
        stroke-width="2"
      />
      <path d="M88 18 v22 h22" fill="none" stroke={C.border} stroke-width="2" />
      <g fill={C.accentSoft}>
        <rect x="54" y="50" width="40" height="6" rx="3" />
        <rect x="54" y="62" width="30" height="6" rx="3" />
      </g>
      {/* what the reading found: a location pin the owner did not put there */}
      <path
        d="M64 74 C69 74 73 78 73 83 C73 89 64 96 64 96 C64 96 55 89 55 83 C55 78 59 74 64 74 Z"
        fill={C.bad}
        opacity="0.85"
      />
      {/* the lens */}
      <circle cx="132" cy="52" r="26" fill={C.accentSoft} opacity="0.5" />
      <circle cx="132" cy="52" r="26" fill="none" stroke={C.accent} stroke-width="4" />
      <path d="M151 71 l18 18" stroke={C.accent} stroke-width="7" stroke-linecap="round" />
    </Frame>
  );
}

export function ImageConvertPreview() {
  const label = (x: number, text: string, fill: string, color: string) => (
    <g transform={`translate(${x} 38)`}>
      <rect x="0" y="0" width="56" height="28" rx="6" fill={fill} stroke={C.border} stroke-width="2" />
      <text x="28" y="19" fill={color} font-size="13" font-weight="700" text-anchor="middle">
        {text}
      </text>
    </g>
  );
  return (
    <Frame>
      {label(16, 'HEIC', C.accentSoft, C.fg)}
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M82 52 h34" />
        <path d="M110 46 l8 6 l-8 6" fill="none" />
      </g>
      {label(128, 'JPG', C.accent, '#fff')}
    </Frame>
  );
}

export function PdfSplitPreview() {
  const sheet = (x: number, y: number, label: string) => (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="40" height="52" rx="5" fill={C.paper} stroke={C.border} stroke-width="2" />
      <g fill={C.accentSoft}>
        <rect x="7" y="10" width="26" height="5" rx="2.5" />
        <rect x="7" y="20" width="18" height="5" rx="2.5" />
      </g>
      <text x="20" y="44" fill={C.muted} font-size="11" font-weight="700" text-anchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <Frame>
      {/* the source, and the cut through it */}
      {sheet(20, 26, '1-9')}
      <path
        d="M74 18 v68"
        stroke={C.bad}
        stroke-width="2.5"
        stroke-dasharray="5 5"
        stroke-linecap="round"
      />
      {sheet(92, 12, 'p2')}
      {sheet(140, 40, 'p7')}
    </Frame>
  );
}

export function PdfToImagesPreview() {
  return (
    <Frame>
      {/* the document */}
      <g transform="translate(22 24)">
        <rect x="0" y="0" width="46" height="58" rx="5" fill={C.paper} stroke={C.border} stroke-width="2" />
        <g fill={C.accentSoft}>
          <rect x="8" y="10" width="30" height="5" rx="2.5" />
          <rect x="8" y="21" width="22" height="5" rx="2.5" />
          <rect x="8" y="32" width="30" height="5" rx="2.5" />
        </g>
        <text x="23" y="52" fill={C.muted} font-size="10" font-weight="700" text-anchor="middle">
          PDF
        </text>
      </g>
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M78 52 h22" />
        <path d="M96 46 l8 6 l-8 6" fill="none" />
      </g>
      {/* the pages, now pictures */}
      {[0, 1].map((i) => (
        <g transform={`translate(${116 + i * 30} ${26 + i * 14})`}>
          <rect x="0" y="0" width="46" height="46" rx="5" fill={C.accentSoft} stroke={C.border} stroke-width="2" />
          <circle cx="14" cy="15" r="5" fill={C.accent} />
          <path d="M5 38 L18 22 L26 30 L34 20 L41 38 Z" fill={C.accent} opacity="0.45" />
        </g>
      ))}
    </Frame>
  );
}

export function RedactPreview() {
  return (
    <Frame>
      <g transform="translate(40 18)">
        <rect x="0" y="0" width="120" height="68" rx="6" fill={C.paper} stroke={C.border} stroke-width="2" />
        <g fill={C.accentSoft}>
          <rect x="12" y="12" width="60" height="7" rx="3.5" />
          <rect x="12" y="44" width="96" height="7" rx="3.5" />
          <rect x="12" y="56" width="70" height="7" rx="3.5" />
        </g>
        {/* the line that is gone, not covered */}
        <rect x="12" y="26" width="84" height="12" rx="2" fill={C.fg} />
      </g>
    </Frame>
  );
}

export function SheetCleanPreview() {
  const row = (y: number, fill: string, w = 92) => <rect x="0" y={y} width={w} height="9" rx="2" fill={fill} />;
  return (
    <Frame>
      <g transform="translate(28 22)">
        <rect x="-6" y="-6" width="104" height="72" rx="6" fill={C.paper} stroke={C.border} stroke-width="2" />
        {row(0, C.accentSoft)}
        {row(13, C.accentSoft)}
        {/* the duplicate and the blank, on their way out */}
        {row(26, C.bad)}
        {row(39, C.border, 40)}
        {row(52, C.accentSoft)}
      </g>
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M136 52 h22" />
        <path d="M154 46 l8 6 l-8 6" fill="none" />
      </g>
      <g transform="translate(150 34)">
        <circle cx="14" cy="18" r="14" fill={C.ok} opacity="0.18" />
        <path d="M7 18 l5 5 l10 -11" fill="none" stroke={C.ok} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    </Frame>
  );
}

export function ImageResizePreview() {
  return (
    <Frame>
      {/* the original, and the exact box it has to land in */}
      {pictureGlyph(20, 20, 76, 64)}
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M104 52 h20" />
        <path d="M120 46 l8 6 l-8 6" fill="none" />
      </g>
      <rect
        x="138"
        y="26"
        width="52"
        height="52"
        rx="5"
        fill={C.accentSoft}
        stroke={C.accent}
        stroke-width="2.5"
        stroke-dasharray="6 4"
      />
      <text x="164" y="57" fill={C.fg} font-size="12" font-weight="700" text-anchor="middle">
        1:1
      </text>
    </Frame>
  );
}

export function ImageCropPreview() {
  return (
    <Frame>
      {/* the photo, dimmed outside the selection */}
      <rect x="24" y="18" width="152" height="68" rx="6" fill={C.accentSoft} stroke={C.border} stroke-width="2" />
      <circle cx="58" cy="42" r="9" fill={C.accent} opacity="0.5" />
      <path d="M30 80 L66 44 L86 62 L110 38 L170 80 Z" fill={C.accent} opacity="0.25" />
      <rect x="64" y="28" width="76" height="48" fill="none" stroke={C.accent} stroke-width="2.5" />
      {/* the handles */}
      {([
        [64, 28],
        [140, 28],
        [64, 76],
        [140, 76],
      ] as const).map(([x, y]) => (
        <rect x={x - 4} y={y - 4} width="8" height="8" rx="1.5" fill={C.accent} />
      ))}
    </Frame>
  );
}

export function ScreenshotSplitPreview() {
  return (
    <Frame>
      {/* one tall capture on the left, its pieces on the right */}
      <rect x="26" y="14" width="46" height="76" rx="5" fill={C.paper} stroke={C.border} stroke-width="2" />
      {[20, 30, 40, 50, 60, 70, 80].map((y) => (
        <rect x="32" y={y} width={y % 20 === 0 ? 28 : 34} height="4" rx="2" fill={C.accentSoft} />
      ))}
      {/* the cuts, sitting in the gaps between the lines rather than on them */}
      {[45, 75].map((y) => (
        <path d={`M22 ${y} h54`} stroke={C.accent} stroke-width="2" stroke-dasharray="4 3" />
      ))}
      <g stroke={C.muted} stroke-width="2.5" stroke-linecap="round">
        <path d="M84 52 h16" />
        <path d="M94 46 l8 6 l-8 6" fill="none" />
      </g>
      {[14, 42, 70].map((y) => (
        <rect x="112" y={y} width="46" height="22" rx="4" fill={C.paper} stroke={C.accent} stroke-width="2" />
      ))}
    </Frame>
  );
}

export function ColorPickerPreview() {
  return (
    <Frame>
      {/* the picture, with a dropper over it */}
      <rect x="24" y="16" width="92" height="60" rx="6" fill={C.accentSoft} stroke={C.border} stroke-width="2" />
      <path d="M28 70 L58 40 L76 58 L94 42 L112 70 Z" fill={C.accent} opacity="0.3" />
      <circle cx="52" cy="34" r="7" fill={C.accent} opacity="0.55" />
      <g stroke={C.fg} stroke-width="2.5" stroke-linecap="round">
        <path d="M84 34 l12 12" />
        <path d="M96 46 l-8 8 a4 4 0 0 1 -6 -6 l8 -8" fill="none" />
      </g>
      <circle cx="84" cy="34" r="3.5" fill={C.accent} stroke={C.paper} stroke-width="1.5" />
      {/* the palette it found, widest share first */}
      {([
        [C.accent, 26, 0],
        [C.ok, 18, 30],
        [C.muted, 12, 52],
        [C.bad, 8, 68],
      ] as const).map(([fill, w, dx]) => (
        <rect x={24 + dx} y="84" width={w} height="10" rx="3" fill={fill} />
      ))}
      <rect x="128" y="16" width="48" height="78" rx="6" fill={C.paper} stroke={C.border} stroke-width="2" />
      {[24, 40, 56, 72].map((y) => (
        <rect x="136" y={y} width="32" height="8" rx="2" fill={C.accentSoft} />
      ))}
    </Frame>
  );
}

export function BatchRenamePreview() {
  return (
    <Frame>
      {/* messy names on the left, ordered ones on the right */}
      {[18, 40, 62].map((y, i) => (
        <g>
          <rect x="20" y={y} width="60" height="16" rx="4" fill={C.paper} stroke={C.border} stroke-width="2" />
          <rect x="26" y={y + 5} width={[44, 34, 40][i]} height="6" rx="3" fill={C.muted} opacity="0.55" />
        </g>
      ))}
      <g stroke={C.muted} stroke-width="2.5" stroke-linecap="round">
        <path d="M90 48 h16" />
        <path d="M100 42 l8 6 l-8 6" fill="none" />
      </g>
      {[18, 40, 62].map((y) => (
        <g>
          <rect x="120" y={y} width="60" height="16" rx="4" fill={C.paper} stroke={C.accent} stroke-width="2" />
          <rect x="126" y={y + 5} width="34" height="6" rx="3" fill={C.accent} opacity="0.7" />
          <rect x="164" y={y + 5} width="10" height="6" rx="3" fill={C.ok} />
        </g>
      ))}
    </Frame>
  );
}

export function SheetConvertPreview() {
  return (
    <Frame>
      {/* a comma-separated file on the left, a grid on the right */}
      <rect x="20" y="20" width="62" height="66" rx="5" fill={C.paper} stroke={C.border} stroke-width="2" />
      {[28, 40, 52, 64, 76].map((y) => (
        <rect x="27" y={y} width={y === 76 ? 30 : 48} height="5" rx="2.5" fill={C.muted} opacity="0.5" />
      ))}
      <g stroke={C.muted} stroke-width="2.5" stroke-linecap="round">
        <path d="M92 47 h14" />
        <path d="M101 41 l8 6 l-8 6" fill="none" />
        <path d="M108 61 h-14" />
        <path d="M99 55 l-8 6 l8 6" fill="none" />
      </g>
      <rect x="122" y="20" width="58" height="66" rx="5" fill={C.paper} stroke={C.accent} stroke-width="2" />
      {[0, 1, 2, 3].map((r) => (
        <g>
          <rect x="128" y={27 + r * 14} width="20" height="9" rx="2" fill={r === 0 ? C.accent : C.accentSoft} />
          <rect x="152" y={27 + r * 14} width="22" height="9" rx="2" fill={r === 0 ? C.accent : C.accentSoft} />
        </g>
      ))}
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

/** A filmstrip with a slice lifted out of the middle — the whole tool in one picture. */
export function VideoTrimPreview() {
  return (
    <Frame>
      <rect x="18" y="34" width="60" height="44" rx="5" fill={C.accentSoft} stroke={C.accent} stroke-width="2" />
      <rect x="122" y="34" width="60" height="44" rx="5" fill={C.accentSoft} stroke={C.accent} stroke-width="2" />
      {/* The removed middle, lifted clear of the strip and dashed. */}
      <rect
        x="84"
        y="20"
        width="32"
        height="44"
        rx="5"
        fill={C.paper}
        stroke={C.muted}
        stroke-width="2"
        stroke-dasharray="5 4"
        opacity="0.65"
      />
      <g stroke={C.border} stroke-width="2" stroke-linecap="round">
        <path d="M18 44 h60 M18 68 h60 M122 44 h60 M122 68 h60" />
      </g>
      {/* Handles at the two cut points. */}
      <g fill={C.accent}>
        <rect x="74" y="30" width="7" height="52" rx="3.5" />
        <rect x="119" y="30" width="7" height="52" rx="3.5" />
      </g>
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

export function PdfPasswordPreview() {
  return (
    <Frame>
      {/* The document, with the page-fold corner the other PDF scenes use */}
      <path
        d="M40 12 h34 l18 18 v60 a4 4 0 0 1 -4 4 h-48 a4 4 0 0 1 -4 -4 V16 a4 4 0 0 1 4 -4 z"
        fill={C.paper}
        stroke={C.border}
        stroke-width="2"
      />
      <path d="M74 12 v18 h18" fill="none" stroke={C.border} stroke-width="2" />
      {/* Lines of text, fading out: what a reader without the password gets */}
      <g stroke={C.muted} stroke-width="2.5" stroke-linecap="round">
        <path d="M48 44 h30" opacity="0.5" />
        <path d="M48 54 h30" opacity="0.32" />
        <path d="M48 64 h18" opacity="0.18" />
      </g>
      {/* The padlock, closed, sitting over the document's edge */}
      <rect x="92" y="52" width="44" height="34" rx="6" fill={C.accent} />
      <path
        d="M101 52 v-9 a13 13 0 0 1 26 0 v9"
        fill="none"
        stroke={C.accent}
        stroke-width="6"
        stroke-linecap="round"
      />
      <circle cx="114" cy="66" r="4.5" fill={C.paper} />
      <path d="M114 69 v6" stroke={C.paper} stroke-width="3" stroke-linecap="round" />
      {/* The key, as the thing that opens it rather than a second decoration */}
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" fill="none" opacity="0.75">
        <circle cx="160" cy="34" r="9" />
        <path d="M160 43 v26" />
        <path d="M160 57 h9" />
        <path d="M160 65 h7" />
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


export function FontCoveragePreview() {
  // Glyph cells: two the font has, one it does not. The empty outlined box is
  // the "tofu" a browser draws for a missing glyph, so it needs no text of its
  // own to be recognised — which matters, because a preview that relied on real
  // Devanagari or a rupee sign would render as tofu itself on a machine missing
  // the font, right on the page telling you about missing fonts.
  const cell = (x: number, has: boolean) => (
    <>
      <rect
        x={x}
        y={38}
        width="24"
        height="28"
        rx="4"
        fill={has ? C.accentSoft : 'none'}
        stroke={has ? C.accent : C.muted}
        stroke-width="2"
        stroke-dasharray={has ? undefined : '3 3'}
      />
      <Show when={has}>
        <g stroke={C.accent} stroke-width="3" stroke-linecap="round">
          <path d={`M${x + 7} ${60} L${x + 12} ${44} L${x + 17} ${60}`} fill="none" />
          <path d={`M${x + 9} ${54} h6`} />
        </g>
      </Show>
    </>
  );

  const verdict = (y: number, ok: boolean) => (
    <>
      <circle cx="136" cy={y} r="9" fill={ok ? C.ok : C.bad} opacity="0.18" />
      <g stroke={ok ? C.ok : C.bad} stroke-width="2.5" stroke-linecap="round" fill="none">
        {ok ? (
          <path d="M131.5 40 l3.5 3.5 l6 -7" />
        ) : (
          <>
            <path d="M132.5 60.5 l7 7" />
            <path d="M139.5 60.5 l-7 7" />
          </>
        )}
      </g>
      <rect x="152" y={y - 4} width="38" height="8" rx="4" fill={C.border} />
    </>
  );

  return (
    <Frame>
      <rect x="8" y="28" width="92" height="48" rx="7" fill={C.paper} stroke={C.border} stroke-width="2" />
      {cell(14, true)}
      {cell(42, true)}
      {cell(70, false)}

      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M106 52 h10" />
        <path d="M111 46 l6 6 l-6 6" />
      </g>

      {verdict(42, true)}
      {verdict(64, false)}
    </Frame>
  );
}


export function FontStylePreview() {
  // The same letter three times, at three stroke weights. Drawn as strokes
  // rather than set as text: a <text> element here would render in whatever
  // face the viewer happens to have, which is the one thing this illustration
  // cannot afford to leave to chance.
  const letterA = (x: number, thickness: number, colour: string) => (
    <g stroke={colour} stroke-width={thickness} stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d={`M${x + 6} 68 L${x + 18} 34 L${x + 30} 68`} />
      <path d={`M${x + 11} 56 h14`} />
    </g>
  );

  const card = (x: number, thickness: number, chosen: boolean) => (
    <>
      <rect
        x={x}
        y={22}
        width="36"
        height="60"
        rx="6"
        fill={chosen ? C.accentSoft : C.paper}
        stroke={chosen ? C.accent : C.border}
        stroke-width="2"
      />
      {letterA(x, thickness, chosen ? C.accent : C.muted)}
    </>
  );

  return (
    <Frame>
      {card(14, 3, false)}
      {card(62, 7, true)}
      {card(110, 12, false)}

      {/* The chosen one, marked. */}
      <circle cx="98" cy="28" r="9" fill={C.ok} />
      <path d="M93.5 28 l3 3 l6 -6.5" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />

      {/* Trait readout beside the row */}
      <g fill={C.border}>
        <rect x="156" y="34" width="32" height="6" rx="3" />
        <rect x="156" y="48" width="24" height="6" rx="3" />
        <rect x="156" y="62" width="30" height="6" rx="3" />
      </g>
      <circle cx="150" cy="37" r="3" fill={C.ok} />
      <circle cx="150" cy="51" r="3" fill={C.ok} />
      <circle cx="150" cy="65" r="3" fill={C.bad} />
    </Frame>
  );
}

export function ImageToPdfPreview() {
  return (
    <Frame>
      {/* A small stack of photographs on the left */}
      <rect x="14" y="34" width="46" height="34" rx="5" fill={C.accentSoft} stroke={C.border} stroke-width="2" />
      <rect x="22" y="26" width="46" height="34" rx="5" fill={C.accentSoft} stroke={C.border} stroke-width="2" />
      <circle cx="35" cy="37" r="4" fill={C.accent} />
      <path d="M26 55 L38 43 L46 50 L54 42 L64 55 Z" fill={C.accent} opacity="0.45" />
      {/* Becoming one document */}
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M80 51 h26" />
        <path d="M99 44 l7 7 l-7 7" />
      </g>
      {/* The PDF page, with the picture sitting inside its margin */}
      <path
        d="M124 14 h32 l16 16 v56 a4 4 0 0 1 -4 4 h-44 a4 4 0 0 1 -4 -4 V18 a4 4 0 0 1 4 -4 z"
        fill={C.paper}
        stroke={C.accent}
        stroke-width="2"
      />
      <path d="M156 14 v16 h16" fill="none" stroke={C.accent} stroke-width="2" />
      <rect x="131" y="40" width="34" height="26" rx="3" fill={C.accentSoft} stroke={C.accent} stroke-width="1.5" />
      <circle cx="139" cy="48" r="3" fill={C.accent} />
      <path d="M134 62 L143 53 L149 58 L155 51 L162 62 Z" fill={C.accent} opacity="0.5" />
    </Frame>
  );
}

export function MarkdownToPdfPreview() {
  return (
    <Frame>
      {/* The source, shown as the Markdown it is: hashes and a dash */}
      <rect x="14" y="14" width="66" height="76" rx="5" fill={C.paper} stroke={C.border} stroke-width="2" />
      <g fill={C.accent} font-family="monospace" font-size="11" font-weight="700">
        <text x="22" y="34">#</text>
        <text x="22" y="52">##</text>
        <text x="22" y="70">-</text>
      </g>
      <g fill={C.muted} opacity="0.55">
        <rect x="34" y="27" width="36" height="6" rx="3" />
        <rect x="40" y="45" width="30" height="5" rx="2.5" />
        <rect x="32" y="63" width="38" height="5" rx="2.5" />
        <rect x="32" y="74" width="26" height="5" rx="2.5" />
      </g>
      {/* Becoming a laid-out page */}
      <g stroke={C.accent} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M90 51 h24" />
        <path d="M107 44 l7 7 l-7 7" />
      </g>
      {/* The PDF, with the same structure set as type */}
      <path
        d="M126 14 h32 l16 16 v56 a4 4 0 0 1 -4 4 h-44 a4 4 0 0 1 -4 -4 V18 a4 4 0 0 1 4 -4 z"
        fill={C.paper}
        stroke={C.accent}
        stroke-width="2"
      />
      <path d="M158 14 v16 h16" fill="none" stroke={C.accent} stroke-width="2" />
      <rect x="134" y="40" width="26" height="7" rx="3.5" fill={C.accent} />
      <g fill={C.muted} opacity="0.6">
        <rect x="134" y="54" width="32" height="4" rx="2" />
        <rect x="134" y="62" width="32" height="4" rx="2" />
        <rect x="134" y="70" width="20" height="4" rx="2" />
      </g>
    </Frame>
  );
}

export function WatermarkPreview() {
  return (
    <Frame>
      {/* The photograph */}
      <rect x="30" y="14" width="140" height="76" rx="6" fill={C.paper} stroke={C.border} stroke-width="2" />
      <circle cx="54" cy="34" r="6" fill={C.accentSoft} />
      <path d="M36 78 L64 50 L82 66 L104 44 L136 78 Z" fill={C.accentSoft} />
      {/* The mark, repeated across it on the diagonal */}
      <g fill={C.accent} opacity="0.5">
        <g transform="rotate(-30 100 52)">
          <rect x="34" y="26" width="34" height="7" rx="3.5" />
          <rect x="82" y="26" width="34" height="7" rx="3.5" />
          <rect x="130" y="26" width="34" height="7" rx="3.5" />
          <rect x="58" y="48" width="34" height="7" rx="3.5" />
          <rect x="106" y="48" width="34" height="7" rx="3.5" />
          <rect x="34" y="70" width="34" height="7" rx="3.5" />
          <rect x="82" y="70" width="34" height="7" rx="3.5" />
          <rect x="130" y="70" width="34" height="7" rx="3.5" />
        </g>
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
  'video-trim': VideoTrimPreview,
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
  'screenshot-split': ScreenshotSplitPreview,
  'color-picker': ColorPickerPreview,
  'batch-rename': BatchRenamePreview,
  'sheet-convert': SheetConvertPreview,
  'font-coverage': FontCoveragePreview,
  'font-style': FontStylePreview,
  'image-to-pdf': ImageToPdfPreview,
  'image-watermark': WatermarkPreview,
  'file-inspect': FileInspectPreview,
  'image-convert': ImageConvertPreview,
  'pdf-split': PdfSplitPreview,
  'pdf-to-images': PdfToImagesPreview,
  redact: RedactPreview,
  'sheet-clean': SheetCleanPreview,
  'image-resize': ImageResizePreview,
  'image-crop': ImageCropPreview,
  'pdf-password': PdfPasswordPreview,
};

import { Show, type JSX } from 'solid-js';

/**
 * A mouse you can recognise, whose real buttons light up.
 *
 * Deliberately SVG rather than WebGL. A 3D renderer for this would cost a
 * canvas context, a shader pipeline and its accessibility story, to display
 * what is five highlighted regions and a wheel — and it would render nothing a
 * shaded vector cannot. Gradients give the shell its depth, `currentColor`-free
 * token fills keep it on the shared palette in both themes, and the whole thing
 * stays inspectable, printable and screen-reader friendly.
 *
 * Button numbering follows PointerEvent.button: 0 left, 1 middle/wheel,
 * 2 right, 3 back, 4 forward.
 */

/**
 * The shell is the LIGHTER surface and the buttons the softer neutral, so the
 * buttons read as inset panels. Doing it the other way round — which is the
 * obvious first guess — leaves white buttons on a white shell with no depth at
 * all in light mode.
 */
const C = {
  shellTop: 'var(--zen-color-background)',
  shellBottom: 'var(--zen-color-muted)',
  border: 'var(--zen-color-border)',
  held: 'var(--zen-color-primary)',
  tested: 'var(--zen-color-success-soft)',
  idle: 'var(--zen-color-muted)',
  fg: 'var(--zen-color-foreground)',
  muted: 'var(--zen-color-muted-fg)',
  accent: 'var(--zen-color-primary)',
};

function fillFor(held: boolean, tested: boolean): string {
  return held ? C.held : tested ? C.tested : C.idle;
}

export interface MouseDiagramProps {
  held: Set<number>;
  tested: Set<number>;
  /** Highlighted while a wheel event is still fresh. */
  scrollDir: 'up' | 'down' | 'left' | 'right' | null;
  label: string;
}

export default function MouseDiagram(props: MouseDiagramProps): JSX.Element {
  const is = (b: number) => ({
    held: props.held.has(b),
    tested: props.tested.has(b),
  });

  return (
    <svg
      viewBox="0 0 200 240"
      width="200"
      height="240"
      role="img"
      aria-label={props.label}
      class="max-w-full"
    >
      <defs>
        <linearGradient id="mouse-shell" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stop-color={C.shellTop} />
          <stop offset="100%" stop-color={C.shellBottom} />
        </linearGradient>
        {/* A soft highlight down the left of the shell reads as roundness. */}
        <linearGradient id="mouse-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22" />
          <stop offset="40%" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.10" />
        </linearGradient>
        {/* Contact shadow — without it the mouse floats. */}
        <radialGradient id="mouse-shadow">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="232" rx="52" ry="8" fill="url(#mouse-shadow)" />

      {/* Shell */}
      <path
        d="M100 14 C133 14 156 46 156 102 L156 172 C156 210 132 230 100 230 C68 230 44 210 44 172 L44 102 C44 46 67 14 100 14 Z"
        fill="url(#mouse-shell)"
        stroke={C.border}
        stroke-width="2.5"
      />

      {/* Left button (0) */}
      <path
        d="M100 15 C69 15 45 47 45 101 L93 101 L93 15 Z"
        fill={fillFor(is(0).held, is(0).tested)}
        stroke={C.border}
        stroke-width="2"
      />
      {/* Right button (2) */}
      <path
        d="M100 15 C131 15 155 47 155 101 L107 101 L107 15 Z"
        fill={fillFor(is(2).held, is(2).tested)}
        stroke={C.border}
        stroke-width="2"
      />

      {/* Wheel / middle button (1) */}
      <rect
        x="90"
        y="34"
        width="20"
        height="46"
        rx="10"
        fill={fillFor(is(1).held, is(1).tested)}
        stroke={C.border}
        stroke-width="2"
      />
      {/* Wheel treads */}
      <g stroke={C.muted} stroke-width="1.5" opacity="0.85">
        <line x1="94" y1="45" x2="106" y2="45" />
        <line x1="94" y1="57" x2="106" y2="57" />
        <line x1="94" y1="69" x2="106" y2="69" />
      </g>

      {/* Side buttons — forward (4) above back (3), as on most mice */}
      <rect
        x="38"
        y="106"
        width="18"
        height="26"
        rx="6"
        fill={fillFor(is(4).held, is(4).tested)}
        stroke={C.border}
        stroke-width="2"
      />
      <rect
        x="38"
        y="138"
        width="18"
        height="26"
        rx="6"
        fill={fillFor(is(3).held, is(3).tested)}
        stroke={C.border}
        stroke-width="2"
      />

      {/* Seam under the buttons, where the shell begins */}
      <path
        d="M45 101 L155 101"
        stroke={C.border}
        stroke-width="2"
        opacity="0.9"
      />

      {/* Roundness sheen, painted last so it sits over the buttons */}
      <path
        d="M100 14 C133 14 156 46 156 102 L156 172 C156 210 132 230 100 230 C68 230 44 210 44 172 L44 102 C44 46 67 14 100 14 Z"
        fill="url(#mouse-sheen)"
        pointer-events="none"
      />

      {/* Scroll direction indicators */}
      <g stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path
          d="M172 52 l8 -9 l8 9"
          stroke={props.scrollDir === 'up' ? C.accent : C.muted}
          opacity={props.scrollDir === 'up' ? '1' : '0.35'}
        />
        <path
          d="M172 70 l8 9 l8 -9"
          stroke={props.scrollDir === 'down' ? C.accent : C.muted}
          opacity={props.scrollDir === 'down' ? '1' : '0.35'}
        />
        <path
          d="M22 56 l-9 8 l9 8"
          stroke={props.scrollDir === 'left' ? C.accent : C.muted}
          opacity={props.scrollDir === 'left' ? '1' : '0.35'}
        />
        <path
          d="M14 78 l9 8 l-9 8"
          stroke={props.scrollDir === 'right' ? C.accent : C.muted}
          opacity={props.scrollDir === 'right' ? '1' : '0.35'}
        />
      </g>

      {/* Cable */}
      <path
        d="M100 14 C100 6 100 6 100 2"
        stroke={C.border}
        stroke-width="4"
        fill="none"
        stroke-linecap="round"
      />

      <Show when={props.held.size > 0}>
        <circle cx="100" cy="196" r="6" fill={C.accent} opacity="0.8" />
      </Show>
    </svg>
  );
}

/**
 * YappyKit logo mark — a "YK" monogram on a rounded brand-blue tile. Inline SVG
 * so it themes/scales cleanly and needs no network request. Keep it in sync with
 * public/favicon.svg (same artwork).
 */
export default function Logo(props: { class?: string }) {
  return (
    <svg viewBox="0 0 48 48" class={props.class} role="img" aria-label="YappyKit">
      <defs>
        <linearGradient id="yk-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#38bdf8" />
          <stop offset="1" stop-color="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#yk-logo-g)" />
      <text
        x="24"
        y="25"
        fill="#fff"
        font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="21"
        font-weight="800"
        letter-spacing="-1"
        text-anchor="middle"
        dominant-baseline="central"
      >
        YK
      </text>
    </svg>
  );
}

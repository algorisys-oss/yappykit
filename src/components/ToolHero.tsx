import { Show, type JSX } from 'solid-js';

/**
 * Tool-page header: the tool's title + one-line description, with the same
 * inline-SVG illustration used on its landing card (reused from tool-previews).
 * The illustration is decorative, so it's hidden from assistive tech and on the
 * narrowest screens where space is tight.
 */
export default function ToolHero(props: {
  title: string;
  preview?: () => JSX.Element;
  children: JSX.Element;
}) {
  return (
    <header class="flex items-start gap-5">
      <Show when={props.preview}>
        {(P) => (
          <div
            aria-hidden="true"
            class="hidden h-20 w-32 shrink-0 items-center justify-center rounded-lg border border-border bg-bg p-2 sm:flex"
          >
            {P()()}
          </div>
        )}
      </Show>
      <div>
        <h1 class="text-2xl font-bold">{props.title}</h1>
        <p class="mt-2 max-w-prose text-sm text-muted">{props.children}</p>
      </div>
    </header>
  );
}

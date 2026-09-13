import { Show, type JSX } from 'solid-js';
import { useI18n } from '../i18n/runtime';
import type { ToolKey } from '../i18n/routes';
import { isBeta } from '../lib/tool-status';

/**
 * Tool-page header: the tool's title + one-line description, with the same
 * inline-SVG illustration used on its landing card (reused from tool-previews).
 * The illustration is decorative, so it's hidden from assistive tech and on the
 * narrowest screens where space is tight.
 *
 * `tool` is what lets a page show its Beta label; see ../lib/tool-status.
 */
export default function ToolHero(props: {
  title: string;
  tool?: ToolKey;
  preview?: () => JSX.Element;
  children: JSX.Element;
}) {
  const { m } = useI18n();
  const beta = () => (props.tool ? isBeta(props.tool) : false);
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
        <h1 class="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold">
          {props.title}
          <Show when={beta()}>
            <span class="rounded-full bg-warning px-2.5 py-0.5 text-sm font-semibold text-warning-fg">{m.common.betaLabel}</span>
          </Show>
        </h1>
        <p class="mt-2 max-w-prose text-sm text-muted">{props.children}</p>
        <Show when={beta()}>
          <p class="mt-2 max-w-prose text-xs text-muted" data-beta-note>
            {m.common.betaNote}
          </p>
        </Show>
      </div>
    </header>
  );
}

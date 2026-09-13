import { A } from '@solidjs/router';
import { Show } from 'solid-js';
import { TOOL_PREVIEWS } from '../routes/tool-previews';
import type { Tool } from '../lib/tools';
import { useI18n } from '../i18n/runtime';

/** One tool in a grid. Shared by the landing page and the category hubs. */
export default function ToolCard(props: { tool: Tool }) {
  const Preview = TOOL_PREVIEWS[props.tool.key];
  const { m } = useI18n();
  return (
    <A
      href={props.tool.href}
      class="group relative flex flex-col rounded-lg border p-5 no-underline transition-all duration-150 cursor-pointer overflow-hidden border-border bg-surface shadow-sm hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
    >
      <Show when={Preview}>
        {(P) => (
          <div class="-mx-5 -mt-5 mb-4 flex h-28 items-center justify-center border-b border-border px-8 py-4">
            {P()()}
          </div>
        )}
      </Show>
      <span class="flex items-center justify-between gap-2">
        <span class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-fg">{props.tool.title}</span>
          <Show when={props.tool.beta}>
            <span class="rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-warning-fg">{m.common.betaLabel}</span>
          </Show>
        </span>
        <span aria-hidden="true" class="text-accent transition-transform duration-150 group-hover:translate-x-1">
          →
        </span>
      </span>
      <span class="mt-1 text-sm text-muted">{props.tool.blurb}</span>
    </A>
  );
}

import { createSignal, onMount, For, Show } from 'solid-js';
import { useI18n } from '../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { supportFor, SUPPORT_VERIFIED } from '@core/capability/support';
import { TOOL_CAPABILITIES } from '../lib/tool-capabilities';
import type { ToolKey } from '../i18n/routes';

/**
 * What this tool needs from a browser, per browser.
 *
 * The table is computed from the tool's own capability declaration, so it
 * cannot drift from what the tool actually does, and it is prerendered by
 * src/prerender/body so a crawler and a no-JS visitor see the same thing.
 *
 * The one line that cannot be prerendered is the useful one: a verdict on the
 * browser actually reading the page. It appears on mount, from the same gate
 * the tool itself runs on, which is why it agrees with what happens when the
 * visitor presses the button.
 */
export default function BrowserSupport(props: { route: ToolKey }) {
  const { m, fmt } = useI18n();
  const c = () => m.content;
  const spec = () => TOOL_CAPABILITIES[props.route];
  const [mine, setMine] = createSignal<'ok' | 'slow' | 'no' | null>(null);

  onMount(() => {
    const verdict = evaluate(spec(), detectCapabilities());
    setMine(!verdict.supported ? 'no' : verdict.fastPath ? 'ok' : 'slow');
  });

  /**
   * What to add after the version, if anything.
   *
   * Silence is the common case and means the version that runs is the version
   * that runs fast. Anything else would be noise on fifteen of the eighteen
   * tools.
   */
  const qualifier = (b: { minVersion: number | null; fastVersion: number | null }) => {
    if (b.minVersion === null) return '';
    if (b.fastVersion === null) return ` · ${c().browserDegraded}`;
    if (b.fastVersion > b.minVersion) {
      return ` · ${fmt(c().browserFastFrom, { version: b.fastVersion })}`;
    }
    return '';
  };

  const yours = () => {
    const v = mine();
    return v === 'ok' ? c().browserYoursOk : v === 'slow' ? c().browserYoursSlow : c().browserYoursNo;
  };

  return (
    <div>
      <h2 class="text-xl font-bold">{c().browserHeading}</h2>
      <ul class="mt-3 grid list-none gap-2 p-0 sm:grid-cols-2">
        <For each={supportFor(spec())}>
          {(b) => (
            <li class="flex items-baseline justify-between gap-3 rounded border border-border bg-surface px-3 py-2">
              <span class="text-sm font-medium text-fg">{b.label}</span>
              <span class="text-xs text-muted">
                {b.minVersion === null
                  ? c().browserNever
                  : fmt(c().browserVersion, { version: b.minVersion })}
                {qualifier(b)}
              </span>
            </li>
          )}
        </For>
      </ul>
      <Show when={mine()}>
        {/* Deliberately not a live region: this is a fact about the page, not
            a result of anything the visitor did, and every tool already has a
            role="status" for the thing they actually pressed. */}
        <p class="mt-3 rounded border border-border bg-surface p-3 text-sm text-fg">{yours()}</p>
      </Show>
      <p class="mt-2 max-w-prose text-xs text-muted">{c().browserNote}</p>
      <p class="mt-1 text-xs text-muted">{fmt(c().browserVerified, { date: SUPPORT_VERIFIED })}</p>
    </div>
  );
}

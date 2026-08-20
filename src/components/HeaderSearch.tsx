import { createSignal, createMemo, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { searchTools, toolList } from '../lib/tools';
import { useI18n } from '../i18n/runtime';

/**
 * Global tool search in the header. Matches tool titles, descriptions and common
 * tags/synonyms. Works from any page.
 *
 * Accessibility: this is a hand-rolled ARIA combobox (role="combobox" + a
 * role="listbox" popup of role="option"s, driven by aria-activedescendant) —
 * zen-ui has an accessible Combobox, but the header rides on the landing route,
 * which forbids component-library JS for its size budget, so we implement the
 * same pattern by hand. Full keyboard support: "/" or ⌘K/Ctrl+K to focus,
 * ↑/↓ to move, Enter to open, Escape to close.
 */
const LISTBOX_ID = 'header-search-listbox';
const optId = (i: number) => `header-search-opt-${i}`;

export default function HeaderSearch() {
  const { m, locale } = useI18n();
  const tools = createMemo(() => toolList(m, locale));
  const [q, setQ] = createSignal('');
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(-1); // highlighted option, -1 = none
  const results = createMemo(() => searchTools(tools(), q()));
  const navigate = useNavigate();
  let inputRef: HTMLInputElement | undefined;

  const showList = () => open() && q().trim().length > 0;

  // Reset the highlight whenever the query (hence the result set) changes.
  createEffect(() => {
    q();
    setActive(-1);
  });

  const go = (href: string) => {
    setQ('');
    setOpen(false);
    inputRef?.blur();
    navigate(href);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const r = results();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (r.length) setActive((i) => (i + 1) % r.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (r.length) setActive((i) => (i <= 0 ? r.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      const pick = r[active() >= 0 ? active() : 0];
      if (pick) {
        e.preventDefault();
        go(pick.href);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef?.blur();
    }
  };

  // Global shortcut: "/" (when not already typing) or ⌘K / Ctrl+K focuses search.
  onMount(() => {
    const onDocKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const slash = e.key === '/' && !typing;
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (slash || cmdK) {
        e.preventDefault();
        inputRef?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onDocKey);
    onCleanup(() => document.removeEventListener('keydown', onDocKey));
  });

  return (
    <div class="relative w-full sm:max-w-md">
      <span aria-hidden="true" class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      </span>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList()}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={showList() && active() >= 0 ? optId(active()) : undefined}
        value={q()}
        onInput={(e) => {
          setQ(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // The delay covers focus moving to something inside the dropdown; the
        // options themselves no longer rely on it, since they refuse to take
        // focus at all (see onMouseDown below).
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={m.common.searchPlaceholder}
        aria-label={m.common.searchLabel}
        class="w-full rounded-lg border border-border bg-surface py-2 ps-9 pe-9 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {/* Shortcut hint (hidden once typing, and on small screens) */}
      <Show when={!q()}>
        <kbd
          aria-hidden="true"
          class="pointer-events-none absolute end-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted sm:block"
        >
          /
        </kbd>
      </Show>

      <Show when={showList()}>
        <div class="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-border bg-bg shadow-lg">
          <Show
            when={results().length > 0}
            fallback={<p class="px-3 py-3 text-sm text-muted">{m.common.searchNoResults}</p>}
          >
            <ul id={LISTBOX_ID} role="listbox" aria-label={m.common.footerHome} class="max-h-80 list-none overflow-auto p-0 py-1">
              <For each={results()}>
                {(tool, i) => (
                  <li role="option" id={optId(i())} aria-selected={active() === i()}>
                    <A
                      href={tool.href}
                      tabindex={-1}
                      onMouseEnter={() => setActive(i())}
                      // Keep focus in the input. Without this, mousedown blurs
                      // it, the close timer below starts, and an ordinary click
                      // (which holds the button down longer than that timer)
                      // unmounts this element before mouseup lands: the result
                      // is a dropdown that ignores mouse clicks while working
                      // perfectly under a fast synthetic one.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        // Leave modified clicks to the browser so "open in new
                        // tab" keeps working; navigating ourselves as well
                        // would send this tab there too.
                        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        go(tool.href);
                      }}
                      class={`block px-3 py-2 no-underline ${active() === i() ? 'bg-surface' : ''}`}
                    >
                      <span class="block text-sm font-medium text-fg">{tool.title}</span>
                      <span class="block truncate text-xs text-muted">{tool.blurb}</span>
                    </A>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </Show>
    </div>
  );
}

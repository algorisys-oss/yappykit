/**
 * zen-ui integration seam.
 *
 * The SINGLE place YappyKit touches the design-system library. zen-ui is
 * vendored as a git submodule under vendor/zen-ui and consumed via the Vite
 * alias + tsconfig path that point at its built Solid binding
 * (@algorisys/zen-ui-solid, Kobalte-backed). Importing this module pulls in the
 * zen stylesheet as a side effect — and because only tool routes import this
 * file, none of that JS/CSS reaches the SEO landing bundle.
 *
 * Button and Switch come straight from zen. SegmentedControl is local: zen's
 * analog is RadioGroup with a different API, and the outcome-picker styling is
 * ours — keeping it here means the tool routes import one consistent surface.
 */
import '@algorisys/zen-ui-solid/styles';
import type { JSX } from 'solid-js';
import { For } from 'solid-js';

export { Button, Switch, RadioGroup, RadioGroupItem, DataTable } from '@algorisys/zen-ui-solid';
export type { ButtonProps, SwitchProps, ColumnDef, DataTableProps } from '@algorisys/zen-ui-solid';

/** The outcome-driven picker: "Under 100 KB / WhatsApp / Email" as one control. */
export function SegmentedControl<T extends string>(props: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  'aria-label': string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props['aria-label']}
      class="inline-flex overflow-hidden rounded border border-border bg-surface"
    >
      <For each={props.options}>
        {(opt) => {
          const selected = () => props.value === opt.value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected()}
              onClick={() => props.onChange(opt.value)}
              // Reset the native button appearance and set an EXPLICIT background
              // on every state — otherwise the UA's default light button face
              // shows through in dark mode and low-contrasts the label.
              // min-h-11 keeps the tap target ≥44px on touch screens.
              class={`m-0 flex min-h-11 cursor-pointer appearance-none items-center border-0 px-3.5 py-2 text-sm font-medium transition-colors ${
                selected()
                  ? 'bg-accent text-accent-fg'
                  : 'bg-transparent text-fg hover:bg-accent-soft'
              }`}
            >
              {opt.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}

// Re-exported so the JSX namespace import above is always used even when a
// consumer only pulls SegmentedControl.
export type { JSX };

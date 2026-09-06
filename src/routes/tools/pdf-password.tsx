import { createSignal, createMemo, onMount, onCleanup, Show } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { PdfPasswordPreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteFiles, isPdf } from '../../lib/paste';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import {
  protectPdf,
  unprotectPdf,
  looksEncrypted,
  checkPassword,
  PdfPasswordError,
  type EncryptError,
} from '@core/pdf/encrypt';

/**
 * Add a password to a PDF, or take one off.
 *
 * The capability gate is a HARD one and it runs before anything else is shown.
 * qpdf's only build needs cross-origin isolation, and in a page without it the
 * engine does not fail — it hangs (spike/qpdf-encrypt/FINDINGS.md). A spinner
 * that never stops is the worst possible way to tell someone their browser
 * cannot do this, so the tool refuses up front instead.
 *
 * Outcome-driven: the two choices are the two things a person wants, and the
 * cipher is not among them. AES-256 is the only option the engine is ever asked
 * for, so there is nothing to present.
 *
 * The password is confirmed on the way in. A typo in a field you cannot read
 * produces a file that opens with something you do not know, and you find out
 * the next time you need it — which is exactly when it is too late.
 */

type Mode = 'add' | 'remove';

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

export default function PdfPassword() {
  const { m, fmt } = useI18n();
  const tt = m.tools['pdf-password'];
  const u = tt.ui;
  useSeo('pdf-password');

  const [supported, setSupported] = createSignal(true);
  const [file, setFile] = createSignal<{ name: string; bytes: Uint8Array } | null>(null);
  const [mode, setMode] = createSignal<Mode>('add');
  const [wasProtected, setWasProtected] = createSignal(false);
  const [password, setPassword] = createSignal('');
  const [confirm, setConfirm] = createSignal('');
  const [reveal, setReveal] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [result, setResult] = createSignal<{ url: string; name: string; bytes: number } | null>(null);

  onMount(() =>
    setSupported(evaluate(TOOL_CAPABILITIES['pdf-password'], detectCapabilities()).supported),
  );

  const revoke = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
  };
  onCleanup(revoke);

  /** Any change to the inputs invalidates a file produced from the old ones. */
  const reset = () => {
    revoke();
    setResult(null);
    setError('');
  };

  async function accept(picked: File[]) {
    const f = picked.find((p) => isPdf(p)) ?? picked[0];
    if (!f) return;
    reset();
    const bytes = new Uint8Array(await f.arrayBuffer());
    setFile({ name: f.name, bytes });
    // Offer the verb the file actually calls for. Being wrong costs one click.
    const already = looksEncrypted(bytes);
    setWasProtected(already);
    setMode(already ? 'remove' : 'add');
    setPassword('');
    setConfirm('');
  }

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const picked = [...(e.currentTarget.files ?? [])];
    // Clearing lets the same file be chosen again after a failed attempt.
    e.currentTarget.value = '';
    await accept(picked);
  }

  usePasteFiles(isPdf, (files) => void accept(files));

  /** Only the "add" flow confirms: removing a password proves itself by working. */
  const mismatch = createMemo(
    () => mode() === 'add' && confirm() !== '' && confirm() !== password(),
  );

  const ready = createMemo(() => {
    if (!file() || busy()) return false;
    if (checkPassword(password()) !== null) return false;
    return mode() === 'remove' || confirm() === password();
  });

  const outputName = (name: string) => {
    const stem = name.replace(/\.pdf$/i, '');
    return mode() === 'add' ? `${stem}-protected.pdf` : `${stem}-unlocked.pdf`;
  };

  const reason = (r: EncryptError): string =>
    ({
      wrongPassword: u.wrongPassword,
      notPdf: u.notPdf,
      damaged: u.damaged,
      notIsolated: u.notIsolated,
      failed: u.failed,
    })[r];

  async function run() {
    const f = file();
    if (!f) {
      setError(u.needFile);
      return;
    }
    const bad = checkPassword(password());
    if (bad) {
      setError(bad === 'empty' ? u.emptyPassword : u.tooLongPassword);
      return;
    }
    reset();
    setBusy(true);
    try {
      const out =
        mode() === 'add'
          ? await protectPdf(f.bytes, password())
          : await unprotectPdf(f.bytes, password());
      setResult({
        url: URL.createObjectURL(new Blob([out as BlobPart], { type: 'application/pdf' })),
        name: outputName(f.name),
        bytes: out.length,
      });
    } catch (e) {
      setError(e instanceof PdfPasswordError ? reason(e.reason) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  const pickMode = (next: Mode) => {
    reset();
    setMode(next);
    setConfirm('');
  };

  const fieldClass =
    'block w-full rounded border border-border bg-surface p-2 text-sm text-fg';

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={PdfPasswordPreview}>
        {tt.heroNote}
      </ToolHero>

      <Show
        when={supported()}
        fallback={
          <p class="mt-8 rounded border border-danger bg-danger-soft p-4 text-sm text-fg">
            {u.unsupported}
          </p>
        }
      >
        <div class="mt-8 space-y-6">
          <div>
            <label class="mb-2 block text-sm font-medium" for="pdf-password-file">
              {u.pickLabel}
            </label>
            <input
              id="pdf-password-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={onPick}
              class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
            />
            <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
            <Show when={file()}>
              {(f) => (
                <p class="mt-2 text-xs text-muted">
                  {fmt(u.fileMeta, { name: f().name, size: kb(f().bytes.length) })}
                </p>
              )}
            </Show>
          </div>

          <Show when={file()}>
            <fieldset>
              <legend class="mb-2 text-sm font-medium">{u.modeLabel}</legend>
              <div class="flex flex-wrap gap-4">
                {(
                  [
                    ['add', u.modeAdd],
                    ['remove', u.modeRemove],
                  ] as const
                ).map(([value, label]) => (
                  <label class="flex items-center gap-2 text-sm text-fg">
                    <input
                      type="radio"
                      name="pdf-password-mode"
                      value={value}
                      checked={mode() === value}
                      onChange={() => pickMode(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Show when={wasProtected() && mode() === 'remove'}>
                <p class="mt-2 text-xs text-muted">{u.detectedProtected}</p>
              </Show>
            </fieldset>

            <div class="space-y-3">
              <div>
                <label class="mb-2 block text-sm font-medium" for="pdf-password-value">
                  {mode() === 'add' ? u.passwordLabel : u.passwordLabelExisting}
                </label>
                <input
                  id="pdf-password-value"
                  type={reveal() ? 'text' : 'password'}
                  autocomplete="new-password"
                  value={password()}
                  onInput={(e) => {
                    reset();
                    setPassword(e.currentTarget.value);
                  }}
                  class={fieldClass}
                />
                <Show when={mode() === 'add'}>
                  <p class="mt-2 text-xs text-muted">{u.passwordHint}</p>
                </Show>
              </div>

              <Show when={mode() === 'add'}>
                <div>
                  <label class="mb-2 block text-sm font-medium" for="pdf-password-confirm">
                    {u.confirmLabel}
                  </label>
                  <input
                    id="pdf-password-confirm"
                    type={reveal() ? 'text' : 'password'}
                    autocomplete="new-password"
                    value={confirm()}
                    onInput={(e) => {
                      reset();
                      setConfirm(e.currentTarget.value);
                    }}
                    class={fieldClass}
                  />
                  <Show when={mismatch()}>
                    <p class="mt-2 text-xs text-danger">{u.mismatch}</p>
                  </Show>
                </div>
              </Show>

              <label class="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={reveal()}
                  onChange={(e) => setReveal(e.currentTarget.checked)}
                />
                {reveal() ? u.hidePassword : u.showPassword}
              </label>
            </div>

            <Show when={mode() === 'add'}>
              <p class="rounded border border-border bg-surface p-3 text-sm text-fg">
                {u.noRecovery}
              </p>
            </Show>

            <Button onClick={() => void run()} disabled={!ready()}>
              {busy() ? u.working : mode() === 'add' ? u.actionAdd : u.actionRemove}
            </Button>
          </Show>

          <Show when={error()}>
            <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg" role="alert">
              {error()}
            </p>
          </Show>

          <Show when={result()}>
            {(r) => (
              <div class="space-y-3">
                <p class="text-sm text-fg" role="status">
                  {mode() === 'add' ? u.doneAdd : u.doneRemove}
                </p>
                <a
                  href={r().url}
                  download={r().name}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {u.download} ({kb(r().bytes)})
                </a>
              </div>
            )}
          </Show>
        </div>
      </Show>
      <ToolContent route="pdf-password" />
    </main>
  );
}

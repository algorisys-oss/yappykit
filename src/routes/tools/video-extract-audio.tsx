import { createSignal, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { ExtractAudioPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { useHoldWorkWhile } from '../../lib/work-guard';
import { formatTimecode } from '@core/video/trim';
import { AUDIO_FORMATS, outputName, type AudioFormat } from '@core/video/audio';
import { extractAudio, NothingToDoError } from '@core/video/ffmpeg';

/**
 * Save a video's soundtrack as MP3, M4A or WAV.
 *
 * When the soundtrack already is the format asked for, it is copied rather than
 * encoded again, so an AAC track saved as M4A comes out bit for bit the same.
 */

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(v.src);
      Number.isFinite(d) && d > 0 ? resolve(d) : reject(new Error('no duration'));
    };
    v.onerror = () => reject(new Error('cannot read video'));
    v.src = URL.createObjectURL(file);
  });
}

const FORMATS: readonly AudioFormat[] = ['mp3', 'm4a', 'wav'];

export default function VideoExtractAudio() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-extract-audio'];
  const u = tt.ui;
  useSeo('video-extract-audio');

  const formatText: Record<AudioFormat, { label: string; hint: string }> = {
    mp3: { label: u.formatMp3, hint: u.formatMp3Hint },
    m4a: { label: u.formatM4a, hint: u.formatM4aHint },
    wav: { label: u.formatWav, hint: u.formatWavHint },
  };

  const [supported, setSupported] = createSignal(true);
  const [source, setSource] = createSignal<{ name: string; bytes: number; duration: number } | null>(null);
  const [format, setFormat] = createSignal<AudioFormat>('mp3');
  const [result, setResult] = createSignal<{ url: string; bytes: number; name: string } | null>(null);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  let file: File | null = null;

  onMount(() =>
    setSupported(evaluate(TOOL_CAPABILITIES['video-extract-audio'], detectCapabilities()).supported),
  );
  const clearResult = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
    setResult(null);
  };
  onCleanup(clearResult);
  useHoldWorkWhile(() => source() !== null);

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    clearResult();
    setSource(null);
    setStatus('');
    setError('');
    setProgress(0);
    file = f;
    try {
      setSource({ name: f.name, bytes: f.size, duration: await readDuration(f) });
    } catch {
      file = null;
      setError(u.readError);
    }
  }

  async function run() {
    const s = source();
    if (!file || !s) return;
    const chosen = format();
    clearResult();
    setError('');
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const out = await extractAudio(file, chosen, {
        duration: s.duration,
        onReady: () => setStatus(u.working),
        onProgress: setProgress,
      });
      setResult({
        url: URL.createObjectURL(new Blob([out as BlobPart], { type: AUDIO_FORMATS[chosen].mime })),
        bytes: out.byteLength,
        name: outputName(s.name, '', AUDIO_FORMATS[chosen].ext),
      });
      setStatus(fmt(u.doneStatus, { format: formatText[chosen].label, size: size(out.byteLength) }));
    } catch (err) {
      setStatus('');
      if (err instanceof NothingToDoError) setError(u.noAudio);
      else setError(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={ExtractAudioPreview}>
        {tt.heroNote}
      </ToolHero>
      <Show
        when={supported()}
        fallback={<p class="mt-8 rounded border border-danger bg-danger-soft p-4 text-sm text-fg">{u.unsupported}</p>}
      >
        <div class="mt-8 space-y-6">
          <div>
            <label class="mb-2 block text-sm font-medium" for="extract-file">
              {u.pickLabel}
            </label>
            <input
              id="extract-file"
              type="file"
              accept="video/*"
              onChange={(e) => void onPick(e)}
              disabled={busy()}
              class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
            />
            <Show when={source()}>
              {(s) => (
                <p class="mt-2 text-xs text-muted">
                  {fmt(u.fileMeta, { name: s().name, size: size(s().bytes), duration: formatTimecode(s().duration) })}
                </p>
              )}
            </Show>
          </div>

          <Show when={source()}>
            <fieldset>
              <legend class="mb-2 text-sm font-medium">{u.formatLabel}</legend>
              <div class="space-y-2">
                <For each={FORMATS}>
                  {(f) => (
                    <label class="flex items-start gap-2 text-sm text-fg">
                      <input
                        type="radio"
                        name="extract-format"
                        value={f}
                        checked={format() === f}
                        disabled={busy()}
                        onChange={() => {
                          clearResult();
                          setStatus('');
                          setFormat(f);
                        }}
                        class="mt-1"
                      />
                      <span>
                        <span class="font-medium">{formatText[f].label}</span>
                        <span class="block text-xs text-muted">{formatText[f].hint}</span>
                      </span>
                    </label>
                  )}
                </For>
              </div>
            </fieldset>
            <Button onClick={() => void run()} disabled={busy()}>
              {busy() ? u.working : u.action}
            </Button>
          </Show>

          <Show when={error()}>
            <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
          </Show>
          <Show when={busy() && progress() > 0}>
            <div class="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div class="h-full bg-accent transition-all" style={{ width: `${Math.round(progress() * 100)}%` }} />
            </div>
          </Show>
          <Show when={status()}>
            <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
              {status()}
            </p>
          </Show>
          <Show when={result()}>
            {(r) => (
              <div class="space-y-3">
                <a
                  href={r().url}
                  download={r().name}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {fmt(u.download, { size: size(r().bytes) })}
                </a>
                <audio src={r().url} controls class="w-full" />
                <p class="text-xs text-muted">{u.verifyHint}</p>
              </div>
            )}
          </Show>
        </div>
      </Show>
      <ToolContent route="video-extract-audio" />
    </main>
  );
}

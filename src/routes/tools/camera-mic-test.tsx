import { createSignal, createMemo, onMount, onCleanup, Show } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import {
  classifyMediaError, mediaSupport, rmsLevel, toDbfs, meterFraction, judgeMic,
  cameraFacts, resolutionName, type MediaFault, type CameraFacts,
} from '@core/media/diagnose';

/**
 * Webcam and microphone test.
 *
 * What separates this from the many "here is a video rectangle" pages is that it
 * answers the failure case. getUserMedia rejects with a specific reason for
 * every common problem, and the most frequent one, another application already
 * holding the camera, is invisible to the user. We surface it in words.
 *
 * The live level meter matters for the same reason: a still picture of a
 * waveform proves nothing, while a bar that moves when you speak proves the
 * microphone is actually delivering audio.
 *
 * NOTHING IS RECORDED. The stream is attached to a preview element and an
 * AnalyserNode in this tab and torn down on stop or unmount. There is no
 * MediaRecorder anywhere in this file, and no network call.
 */

const METER_FLOOR_DB = -60;
/** Per-frame fall of the level bar (~60 fps), so it decays over a few hundred ms. */
const METER_DECAY = 0.88;

export default function CameraMicTest() {
  const { m, fmt } = useI18n();
  const t = m.tools['camera-mic-test'];
  const u = t.ui;
  useSeo('camera-mic-test');

  const [stream, setStream] = createSignal<MediaStream | null>(null);
  const [fault, setFault] = createSignal<MediaFault | null>(null);
  const [camera, setCamera] = createSignal<CameraFacts | null>(null);
  const [micLabel, setMicLabel] = createSignal('');
  const [level, setLevel] = createSignal(0);
  const [peak, setPeak] = createSignal(0);
  const [mirror, setMirror] = createSignal(true);

  // Honest gate, checked BEFORE the user presses anything. An HTTP origin or a
  // browser without getUserMedia can never work here, and finding that out
  // after clicking Start reads as "this site is broken" rather than "this
  // browser cannot do it".
  const [blocked, setBlocked] = createSignal(false);
  onMount(() => {
    const support = mediaSupport();
    if (support === 'ok') return;
    setBlocked(true);
    setFault(support);
  });

  let video: HTMLVideoElement | undefined;
  let audioCtx: AudioContext | null = null;
  let raf = 0;

  function teardown() {
    cancelAnimationFrame(raf);
    raf = 0;
    stream()?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setCamera(null);
    setMicLabel('');
    setLevel(0);
    void audioCtx?.close();
    audioCtx = null;
    if (video) video.srcObject = null;
  }
  onCleanup(teardown);

  /** Drive the meter from the live stream. Read-only: nothing is captured. */
  function meter(source: MediaStream) {
    audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    audioCtx.createMediaStreamSource(source).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      const l = rmsLevel(buf);
      // Peak-and-decay, as on a hardware meter. The raw RMS of speech drops to
      // zero between syllables, so a bar driven straight from it strobes and
      // reads as broken; falling back gradually makes the movement legible.
      setLevel((prev) => Math.max(l, prev * METER_DECAY));
      setPeak((p) => Math.max(p, l));
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  async function start(want: { video: boolean; audio: boolean }) {
    teardown();
    setFault(null);
    setPeak(0);

    const support = mediaSupport();
    if (support !== 'ok') {
      setFault(support);
      return;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: want.video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: want.audio ? { echoCancellation: false, noiseSuppression: false } : false,
      });
      setStream(s);

      const track = s.getVideoTracks()[0];
      if (track) {
        setCamera(cameraFacts(track.getSettings(), track.label));
        if (video) {
          video.srcObject = s;
          await video.play().catch(() => undefined);
        }
      }
      const mic = s.getAudioTracks()[0];
      if (mic) {
        setMicLabel(mic.label);
        meter(s);
      }
    } catch (err) {
      setFault(classifyMediaError(err));
    }
  }

  const faultText = (f: MediaFault) =>
    f === 'denied' ? u.faultDenied
    : f === 'notFound' ? u.faultNotFound
    : f === 'inUse' ? u.faultInUse
    : f === 'insecure' ? u.faultInsecure
    : f === 'unsupported' ? u.faultUnsupported
    : f === 'overconstrained' ? u.faultOverconstrained
    : u.faultUnknown;

  const verdict = createMemo(() => judgeMic(peak()));
  const running = () => stream() !== null;

  function downloadReport() {
    const c = camera();
    const v = verdict();
    const lines = [
      'YappyKit camera and microphone test report',
      `Generated: ${new Date().toISOString()}`,
      `User agent: ${navigator.userAgent}`,
      '',
      'CAMERA',
      c
        ? `  ${c.label || '(unnamed)'} at ${c.width}x${c.height}` +
          `${c.frameRate ? `, ${c.frameRate} fps` : ''}`
        : '  not started',
      '',
      'MICROPHONE',
      micLabel() ? `  ${micLabel()}` : '  not started',
      `  heard: ${v.heard ? 'yes' : 'no'}${v.veryQuiet ? ' (very quiet)' : ''}`,
      `  peak: ${toDbfs(v.peak, METER_FLOOR_DB).toFixed(1)} dBFS`,
      '',
      fault() ? `FAULT: ${fault()}` : 'No fault reported.',
      '',
      'Measured locally in the browser. No video or audio was recorded or uploaded.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yappykit-camera-mic-test.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <ToolHero title={t.heroTitle}>{t.heroNote}</ToolHero>

      <div class="mt-8 space-y-6">
        <div class="flex flex-wrap items-center gap-2">
          <Button onClick={() => void start({ video: true, audio: true })} disabled={running() || blocked()}>
            {u.startBoth}
          </Button>
          <button
            type="button"
            onClick={() => void start({ video: true, audio: false })}
            disabled={running() || blocked()}
            class="inline-flex items-center rounded border border-border px-4 py-2 text-sm font-medium text-fg transition hover:border-accent disabled:opacity-50"
          >
            {u.startCamera}
          </button>
          <button
            type="button"
            onClick={() => void start({ video: false, audio: true })}
            disabled={running() || blocked()}
            class="inline-flex items-center rounded border border-border px-4 py-2 text-sm font-medium text-fg transition hover:border-accent disabled:opacity-50"
          >
            {u.startMic}
          </button>
          <Show when={running()}>
            <button
              type="button"
              onClick={teardown}
              class="inline-flex items-center rounded border border-border px-4 py-2 text-sm font-medium text-fg transition hover:border-accent"
            >
              {u.stop}
            </button>
          </Show>
        </div>
        <p class="text-xs text-muted">{u.permissionHint}</p>

        <Show when={fault()}>
          {(f) => (
            <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg" role="alert">
              {faultText(f())}
            </p>
          )}
        </Show>

        <section>
          <h2 class="text-base font-semibold">{u.cameraHeading}</h2>
          {/* Hidden on a microphone-only run: an empty black rectangle reads as
              a broken camera rather than one that was never asked for. */}
          <div
            class="mt-3 overflow-hidden rounded-lg border border-border bg-surface"
            classList={{ hidden: running() && camera() === null }}
          >
            <video
              ref={video}
              playsinline
              muted
              class={`block max-h-96 w-full bg-bg object-contain ${mirror() ? '-scale-x-100' : ''}`}
            />
          </div>
          <Show when={camera()}>
            {(c) => (
              <div class="mt-2 space-y-1 text-sm text-muted">
                <p>
                  {u.deviceLabel}: <span class="text-fg">{c().label || '—'}</span>
                </p>
                <p>
                  {fmt(u.resolution, {
                    w: c().width,
                    h: c().height,
                    named: resolutionName(c().width, c().height)
                      ? fmt(u.namedSuffix, { name: resolutionName(c().width, c().height)! })
                      : '',
                  })}
                </p>
                <p>
                  {c().frameRate
                    ? fmt(u.frameRate, { fps: c().frameRate! })
                    : u.frameRateUnknown}
                </p>
              </div>
            )}
          </Show>
          <label class="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={mirror()} onChange={(e) => setMirror(e.currentTarget.checked)} />
            {u.mirrorLabel}
          </label>
        </section>

        <section>
          <h2 class="text-base font-semibold">{u.micHeading}</h2>
          <Show when={micLabel()}>
            <p class="mt-2 text-sm text-muted">
              {u.deviceLabel}: <span class="text-fg">{micLabel()}</span>
            </p>
          </Show>
          <p class="mt-3 text-sm font-medium">{u.levelHeading}</p>
          <div class="mt-2 h-6 w-full overflow-hidden rounded border border-border bg-surface">
            <div
              class="h-full bg-accent transition-[width] duration-75"
              style={{ width: `${Math.round(meterFraction(level(), METER_FLOOR_DB) * 100)}%` }}
            />
          </div>
          <p class="mt-2 text-sm text-fg" role="status">
            {!verdict().heard ? u.levelSilent : verdict().veryQuiet ? u.levelQuiet : u.levelOk}
          </p>
          <Show when={verdict().heard}>
            <p class="mt-1 text-xs text-muted">
              {fmt(u.peakLabel, { db: toDbfs(peak(), METER_FLOOR_DB).toFixed(1) })}
            </p>
          </Show>
        </section>

        <p class="rounded border border-border bg-surface p-3 text-xs text-muted">{u.privacyNote}</p>

        <section class="rounded-lg border border-border bg-surface p-4">
          <h2 class="text-base font-semibold">{u.reportHeading}</h2>
          <p class="mt-1 text-xs text-muted">{u.reportHint}</p>
          <div class="mt-3">
            <Button onClick={downloadReport}>{u.reportButton}</Button>
          </div>
        </section>
      </div>

      <ToolContent route="camera-mic-test" />
    </main>
  );
}

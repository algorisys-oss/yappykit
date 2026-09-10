import { createEffect, createSignal, onCleanup, onMount, untrack, Show, type JSX } from 'solid-js';
import { createBurst, stepParticles, isSpent, type Particle } from '@core/timer/confetti';

/**
 * The canvas half of the celebration burst. It owns the frame loop and the
 * pixels; the motion itself lives in @core/timer/confetti, where it is tested.
 *
 * Three things a confetti overlay gets wrong and this one does not:
 *
 * 1. IT STOPS. The loop ends the moment the last piece has fallen through the
 *    bottom, instead of holding a requestAnimationFrame open for the rest of
 *    the session — which on a stream timer means for hours.
 * 2. ONE REDRAW PER FRAME, over the whole canvas, rather than a draw call per
 *    particle event. A hundred-odd pieces at 144Hz is only affordable batched.
 * 3. IT TAKES prefers-reduced-motion SERIOUSLY. Motion sickness and vestibular
 *    disorders are the reason that setting exists, and a full-screen burst of
 *    flying objects is exactly what it is asking us not to do. Nothing renders
 *    at all in that case, so there is nothing to fall back from.
 *
 * The canvas fills its positioned parent and is decoration, so it is
 * pointer-transparent and hidden from assistive technology.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Enough to read as a celebration on a display-sized area, cheap enough to draw. */
const PIECES = 140;

export interface ConfettiProps {
  /** A burst fires when this goes true; it then plays out on its own. */
  active: boolean;
  /** The tool's own colours — this component owns no palette. */
  palette: string[];
}

export default function Confetti(props: ConfettiProps): JSX.Element {
  const [allowed, setAllowed] = createSignal(true);

  let canvas: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  let particles: Particle[] = [];
  let frame = 0;
  let last = 0;
  let width = 0;
  let height = 0;

  /**
   * Match the backing store to the CSS box, ONCE per size change. The transform
   * has to be re-applied here because assigning `canvas.width` resets it; doing
   * either per frame would scale the drawing repeatedly and cost a full buffer
   * reallocation every frame.
   */
  function resize(): void {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w === width && h === height) return;

    width = w;
    height = h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
      ctx.restore();
    }
  }

  function loop(t: number): void {
    const dt = last === 0 ? 0 : (t - last) / 1000;
    last = t;
    particles = stepParticles(particles, dt, height);
    draw();
    if (isSpent(particles)) {
      frame = 0;
      last = 0;
      return;
    }
    frame = requestAnimationFrame(loop);
  }

  function stop(): void {
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    particles = [];
    draw();
  }

  function burst(): void {
    resize();
    if (width === 0 || height === 0) return;
    particles = createBurst(PIECES, width, height, Date.now(), untrack(() => props.palette));
    last = 0;
    if (frame === 0) frame = requestAnimationFrame(loop);
  }

  onMount(() => {
    const mq = window.matchMedia(REDUCED_MOTION);
    setAllowed(!mq.matches);
    const onMotionChange = () => {
      setAllowed(!mq.matches);
      if (mq.matches) stop();
    };
    mq.addEventListener('change', onMotionChange);
    window.addEventListener('resize', resize);
    onCleanup(() => {
      mq.removeEventListener('change', onMotionChange);
      window.removeEventListener('resize', resize);
      stop();
    });
  });

  // Only `active` re-fires this. Reading the palette or the motion preference
  // reactively would restart the burst when either changed, which is not what
  // either of them means.
  createEffect(() => {
    if (props.active && untrack(allowed)) burst();
  });

  return (
    <Show when={allowed()}>
      <canvas ref={canvas} aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full" />
    </Show>
  );
}

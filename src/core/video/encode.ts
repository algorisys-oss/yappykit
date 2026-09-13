/**
 * The encode every editing tool writes: H.264 and AAC in an MP4 that plays
 * anywhere.
 *
 * Trim, blur and annotate all re-encode because the edit has to be in the
 * frames, and all of them aim for "you cannot see the difference" rather than a
 * size, which is the compressor's job. One definition, so the three cannot
 * drift into three slightly different ideas of quality.
 */

/** x264 quality: visually lossless for this kind of edit, not a size target. */
const CRF = '20';
const AUDIO_KBPS = '128k';

/** libx264 with yuv420p needs even dimensions, and plenty of sources are odd. */
export const EVEN_DIMENSIONS = 'pad=ceil(iw/2)*2:ceil(ih/2)*2';

/** Drop the float noise that turns 6 into "6.000000000000001" in an argument. */
export const t = (n: number) => String(Number(n.toFixed(3)));

/**
 * Output arguments for the video and, when there is one, the audio.
 *
 * Audio is re-encoded rather than copied: WebM sources carry Opus, which an MP4
 * cannot take as it is. A silent source gets `-an`, because mapping an audio
 * stream that does not exist fails the encode instead of being ignored.
 */
export function encodeArgs(hasAudio: boolean): string[] {
  return [
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', CRF,
    '-pix_fmt', 'yuv420p',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', AUDIO_KBPS] : ['-an']),
    '-movflags', '+faststart',
  ];
}

import { describe, it, expect } from 'vitest';
import {
  streamsFrom,
  containerFor,
  canCopy,
  buildMuteArgs,
  buildExtractArgs,
  outputName,
  AUDIO_FORMATS,
} from './audio';

// Captured from ffmpeg's input summary for real files.
const MP4 = [
  "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':",
  '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 640x480, 150 kb/s, 25 fps',
  '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)',
];
const WEBM = [
  "Input #0, matroska,webm, from 'in.webm':",
  '  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv, progressive), 320x240, SAR 1:1 DAR 4:3, 15 fps',
  '  Stream #0:1: Audio: opus, 48000 Hz, mono, fltp',
];
const SILENT = ["Input #0, mov,mp4, from 'in.mp4':", '  Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 640x480'];

describe('streamsFrom', () => {
  it('reads the first audio codec and whether there is a picture', () => {
    expect(streamsFrom(MP4)).toEqual({ audioCodec: 'aac', hasVideo: true });
    expect(streamsFrom(WEBM)).toEqual({ audioCodec: 'opus', hasVideo: true });
  });

  it('reports no audio for a silent video, rather than guessing', () => {
    expect(streamsFrom(SILENT)).toEqual({ audioCodec: null, hasVideo: true });
  });

  it('reports no picture for a file that is only sound', () => {
    expect(streamsFrom(["Input #0, mp3, from 'a.mp3':", '  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s'])).toEqual({
      audioCodec: 'mp3',
      hasVideo: false,
    });
  });
});

describe('containerFor', () => {
  it('keeps the source’s own container, so a copied stream still plays', () => {
    expect(containerFor('holiday.MP4')).toEqual({ ext: 'mp4', mime: 'video/mp4' });
    expect(containerFor('screen.mov')).toEqual({ ext: 'mov', mime: 'video/quicktime' });
    expect(containerFor('clip.webm')).toEqual({ ext: 'webm', mime: 'video/webm' });
    expect(containerFor('talk.m4v')).toEqual({ ext: 'mp4', mime: 'video/mp4' });
  });

  it('falls back to Matroska, which takes any codec, for anything unrecognised', () => {
    expect(containerFor('old.avi')).toEqual({ ext: 'mkv', mime: 'video/x-matroska' });
    expect(containerFor('noextension')).toEqual({ ext: 'mkv', mime: 'video/x-matroska' });
  });
});

describe('canCopy', () => {
  it('copies only when the source audio already is the format asked for', () => {
    expect(canCopy('aac', 'm4a')).toBe(true);
    expect(canCopy('mp3', 'mp3')).toBe(true);
    expect(canCopy('pcm_s16le', 'wav')).toBe(true);
    expect(canCopy('aac', 'mp3')).toBe(false);
    expect(canCopy('opus', 'm4a')).toBe(false);
    expect(canCopy(null, 'mp3')).toBe(false);
  });
});

describe('buildMuteArgs', () => {
  it('copies the picture untouched and drops every audio track', () => {
    const args = buildMuteArgs({ input: 'in.mp4', output: 'out.mp4' });
    expect(args).toEqual(['-i', 'in.mp4', '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', 'out.mp4']);
  });

  it('only asks for faststart where the container has it', () => {
    expect(buildMuteArgs({ input: 'in.webm', output: 'out.webm' })).not.toContain('-movflags');
    expect(buildMuteArgs({ input: 'in.mov', output: 'out.mov' })).toContain('-movflags');
  });
});

describe('buildExtractArgs', () => {
  const base = { input: 'in.mp4', output: 'out' };

  it('copies AAC into M4A instead of encoding it again', () => {
    expect(buildExtractArgs({ ...base, format: 'm4a', sourceCodec: 'aac' })).toEqual([
      '-i', 'in.mp4', '-map', '0:a:0', '-vn', '-c:a', 'copy', '-movflags', '+faststart', 'out',
    ]);
  });

  it('encodes MP3 with LAME when the source is not already MP3', () => {
    const args = buildExtractArgs({ ...base, format: 'mp3', sourceCodec: 'aac' });
    expect(args.join(' ')).toContain('-c:a libmp3lame -b:a 192k');
    expect(args).toContain('-vn');
  });

  it('writes 16-bit PCM for WAV', () => {
    expect(buildExtractArgs({ ...base, format: 'wav', sourceCodec: 'opus' }).join(' ')).toContain('-c:a pcm_s16le');
  });

  it('encodes Opus to AAC for M4A, since an M4A cannot carry Opus as it is', () => {
    expect(buildExtractArgs({ ...base, format: 'm4a', sourceCodec: 'opus' }).join(' ')).toContain('-c:a aac -b:a 192k');
  });

  it('names a file type for every format it offers', () => {
    for (const f of ['mp3', 'm4a', 'wav'] as const) {
      expect(AUDIO_FORMATS[f].ext).toBe(f);
      expect(AUDIO_FORMATS[f].mime).toMatch(/^audio\//);
    }
  });
});

describe('outputName', () => {
  it('keeps the stem and swaps the extension', () => {
    expect(outputName('Holiday Clip.MOV', '-muted', 'mov')).toBe('Holiday Clip-muted.mov');
    expect(outputName('talk.mp4', '', 'mp3')).toBe('talk.mp3');
    expect(outputName('noext', '', 'wav')).toBe('noext.wav');
  });
});

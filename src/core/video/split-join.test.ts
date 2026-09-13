import { describe, it, expect } from 'vitest';
import { splitRanges, partName, joinTarget, buildJoinArgs, moveItem, SPLIT_LENGTHS } from './split-join';

describe('splitRanges', () => {
  it('cuts into equal parts that cover the whole video', () => {
    expect(splitRanges(90, { kind: 'count', count: 3 })).toEqual([
      { start: 0, end: 30 },
      { start: 30, end: 60 },
      { start: 60, end: 90 },
    ]);
  });

  it('cuts into parts no longer than a limit, with the remainder last', () => {
    expect(splitRanges(70, { kind: 'length', seconds: 30 })).toEqual([
      { start: 0, end: 30 },
      { start: 30, end: 60 },
      { start: 60, end: 70 },
    ]);
  });

  it('does not leave a sliver of a part from floating point', () => {
    const parts = splitRanges(90.00000001, { kind: 'length', seconds: 30 });
    expect(parts).toHaveLength(3);
    expect(parts[2]!.end).toBeCloseTo(90);
  });

  it('keeps a short video whole rather than splitting it into nothing', () => {
    expect(splitRanges(12, { kind: 'length', seconds: 30 })).toEqual([{ start: 0, end: 12 }]);
    expect(splitRanges(12, { kind: 'count', count: 1 })).toEqual([{ start: 0, end: 12 }]);
  });

  it('refuses counts and lengths that are not real', () => {
    expect(() => splitRanges(60, { kind: 'count', count: 0 })).toThrow(RangeError);
    expect(() => splitRanges(60, { kind: 'length', seconds: 0 })).toThrow(RangeError);
  });

  it('offers the lengths platforms cap stories and statuses at', () => {
    expect(SPLIT_LENGTHS).toEqual([15, 30, 60]);
  });
});

describe('partName', () => {
  it('numbers parts so they sort in order, keeping the video’s name', () => {
    expect(partName('Holiday Clip.MOV', 0, 3)).toBe('Holiday Clip-part-1-of-3.mp4');
    expect(partName('talk.mp4', 8, 12)).toBe('talk-part-09-of-12.mp4');
  });
});

describe('joinTarget', () => {
  it('uses the first clip’s even size and frame rate, capped at 60 fps', () => {
    expect(joinTarget([{ width: 1281, height: 721, fps: 29.97 }, { width: 720, height: 1280, fps: 60 }])).toEqual({
      width: 1282,
      height: 722,
      fps: 29.97,
    });
    expect(joinTarget([{ width: 640, height: 480, fps: 120 }]).fps).toBe(60);
    expect(joinTarget([{ width: 640, height: 480, fps: null }]).fps).toBe(30);
  });
});

describe('buildJoinArgs', () => {
  const target = { width: 1280, height: 720, fps: 30 };
  const clips = [
    { input: 'a.mp4', hasAudio: true, duration: 10 },
    { input: 'b.mov', hasAudio: false, duration: 4.5 },
  ];

  it('takes each clip as an input in order and concatenates them', () => {
    const args = buildJoinArgs(clips, target, 'out.mp4');
    expect(args.slice(0, 4)).toEqual(['-i', 'a.mp4', '-i', 'b.mov']);
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]');
    expect(args.slice(-1)).toEqual(['out.mp4']);
  });

  it('fits every picture into the first clip’s frame without stretching, at one frame rate', () => {
    const graph = buildJoinArgs(clips, target, 'out.mp4')[5]!;
    expect(graph).toContain(
      '[1:v]scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=4.5,trim=duration=4.5,setpts=PTS-STARTPTS[v1]',
    );
  });

  it('pads or trims each clip’s sound to the clip’s length, so later clips stay in sync', () => {
    const graph = buildJoinArgs(clips, target, 'out.mp4')[5]!;
    expect(graph).toContain('[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=10,asetpts=PTS-STARTPTS[a0]');
  });

  it('gives a clip with no sound the right length of silence', () => {
    const graph = buildJoinArgs(clips, target, 'out.mp4')[5]!;
    expect(graph).toContain('anullsrc=r=48000:cl=stereo,atrim=duration=4.5,aformat=sample_fmts=fltp:channel_layouts=stereo[a1]');
  });

  it('leaves sound out entirely when no clip has any', () => {
    const silent = clips.map((c) => ({ ...c, hasAudio: false }));
    const args = buildJoinArgs(silent, target, 'out.mp4');
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).not.toContain('anullsrc');
    expect(graph).toContain('concat=n=2:v=1:a=0[outv]');
    expect(args).toContain('-an');
    expect(args).not.toContain('[outa]');
  });

  it('refuses fewer than two clips', () => {
    expect(() => buildJoinArgs([clips[0]!], target, 'out.mp4')).toThrow(RangeError);
  });
});

describe('moveItem', () => {
  it('moves one clip up or down and leaves the rest in order', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('does nothing at either end', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

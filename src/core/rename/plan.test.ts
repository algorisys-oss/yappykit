import { describe, it, expect } from 'vitest';
import {
  extensionOf,
  stemOf,
  sanitiseStem,
  tidyStem,
  padWidth,
  formatTaken,
  planRename,
  byTakenThenName,
  type Source,
} from './plan';

const at = (iso: string) => new Date(iso);
const src = (name: string, taken?: string): Source => ({
  name,
  taken: taken ? at(taken) : null,
});

describe('taking a name apart', () => {
  it('finds the extension, lowercased', () => {
    expect(extensionOf('Holiday.JPG')).toBe('.jpg');
    expect(stemOf('Holiday.JPG')).toBe('Holiday');
  });

  it('treats a leading dot as a hidden file rather than an extension', () => {
    expect(extensionOf('.gitignore')).toBe('');
    expect(stemOf('.gitignore')).toBe('.gitignore');
  });

  it('copes with no extension at all', () => {
    expect(extensionOf('README')).toBe('');
    expect(stemOf('README')).toBe('README');
  });

  it('takes only the last extension', () => {
    expect(extensionOf('archive.tar.gz')).toBe('.gz');
  });
});

describe('names that survive being copied to Windows', () => {
  it('removes the characters Windows refuses', () => {
    expect(sanitiseStem('a:b*c?d"e<f>g|h/i\\j')).toBe('abcdefghij');
  });

  it('does not leave a trailing dot or space, which Windows truncates silently', () => {
    expect(sanitiseStem('report. ')).toBe('report');
    expect(sanitiseStem('report...')).toBe('report');
  });

  it('escapes the reserved device names, extension or not', () => {
    // CON.jpg fails exactly as CON does, and has since DOS.
    expect(sanitiseStem('CON')).toBe('CON-file');
    expect(sanitiseStem('com1')).toBe('com1-file');
    expect(sanitiseStem('console')).toBe('console');
  });

  it('never returns an empty name', () => {
    expect(sanitiseStem('')).toBe('file');
    expect(sanitiseStem(':::')).toBe('file');
  });
});

describe('tidying a name that already says something', () => {
  it('drops a camera prefix, which distinguishes nothing', () => {
    expect(tidyStem('IMG_4821')).toBe('4821');
    expect(tidyStem('DSC 0099')).toBe('0099');
  });

  it('makes the rest safe to type and to put in a URL', () => {
    expect(tidyStem('Summer Holiday  2024')).toBe('summer-holiday-2024');
    expect(tidyStem('a__b___c')).toBe('a-b-c');
  });

  it('keeps the name when removing the prefix would leave nothing', () => {
    expect(tidyStem('IMG')).toBe('img');
  });
});

describe('numbering', () => {
  it('pads to the width of the batch, so a file manager sorts them', () => {
    // The whole reason anyone reaches for this tool.
    expect(padWidth(9)).toBe(1);
    expect(padWidth(10)).toBe(2);
    expect(padWidth(100)).toBe(3);
  });

  it('numbers in the order given, from the number asked for', () => {
    const plan = planRename([src('b.jpg'), src('a.jpg')], {
      scheme: 'sequence',
      prefix: 'Holiday',
      start: 1,
    });
    expect(plan.map((r) => r.to)).toEqual(['Holiday-1.jpg', 'Holiday-2.jpg']);
  });

  it('pads once the batch is big enough to need it', () => {
    const many = Array.from({ length: 12 }, (_, i) => src(`p${i}.jpg`));
    const plan = planRename(many, { scheme: 'sequence', prefix: 'shot' });
    expect(plan[0]!.to).toBe('shot-01.jpg');
    expect(plan[11]!.to).toBe('shot-12.jpg');
  });

  it('works with no prefix at all', () => {
    const plan = planRename([src('x.png'), src('y.png')], { scheme: 'sequence' });
    expect(plan.map((r) => r.to)).toEqual(['1.png', '2.png']);
  });

  it('keeps each file its own extension', () => {
    const plan = planRename([src('a.PNG'), src('b.jpeg')], {
      scheme: 'sequence',
      prefix: 'mix',
    });
    expect(plan.map((r) => r.to)).toEqual(['mix-1.png', 'mix-2.jpeg']);
  });
});

describe('naming by the date the photo was taken', () => {
  it('writes a stamp that sorts chronologically as text', () => {
    expect(formatTaken(at('2024-06-12T14:33:05'))).toBe('2024-06-12_14-33-05');
    // Zero padded, or March sorts after October.
    expect(formatTaken(at('2024-03-04T05:06:07'))).toBe('2024-03-04_05-06-07');
  });

  it('uses the capture time rather than the file name', () => {
    const plan = planRename([src('IMG_9999.jpg', '2024-06-12T14:33:05')], {
      scheme: 'dateTaken',
    });
    expect(plan[0]!.to).toBe('2024-06-12_14-33-05.jpg');
  });

  it('keeps a prefix in front of the stamp when one is given', () => {
    const plan = planRename([src('IMG_1.jpg', '2024-06-12T14:33:05')], {
      scheme: 'dateTaken',
      prefix: 'Wedding',
    });
    expect(plan[0]!.to).toBe('Wedding-2024-06-12_14-33-05.jpg');
  });

  it('says so rather than inventing a time for a file with no date', () => {
    const plan = planRename([src('scan.jpg')], { scheme: 'dateTaken' });
    expect(plan[0]!).toEqual({ from: 'scan.jpg', to: 'scan.jpg', note: 'noDate' });
  });

  it('sorts dated files first and leaves undated ones in arrival order', () => {
    const list = [src('c.jpg'), src('b.jpg', '2024-01-02T00:00:00'), src('a.jpg', '2023-01-01T00:00:00')];
    expect([...list].sort(byTakenThenName).map((s) => s.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });
});

describe('two files never get the same name', () => {
  it('separates a burst taken in the same second', () => {
    const plan = planRename(
      [src('a.jpg', '2024-06-12T14:33:05'), src('b.jpg', '2024-06-12T14:33:05')],
      { scheme: 'dateTaken' },
    );
    expect(plan.map((r) => r.to)).toEqual(['2024-06-12_14-33-05.jpg', '2024-06-12_14-33-05-2.jpg']);
    expect(plan[1]!.note).toBe('collision');
  });

  it('separates names that differed only in punctuation', () => {
    const plan = planRename([src('My Photo.jpg'), src('my_photo.jpg')], { scheme: 'tidy' });
    expect(new Set(plan.map((r) => r.to)).size).toBe(2);
  });

  it('compares case-insensitively, because Windows and macOS do', () => {
    // A.jpg and a.jpg are the same file on two of the three desktops.
    const plan = planRename([src('A.jpg'), src('a.jpg')], { scheme: 'tidy' });
    expect(plan[1]!.to).not.toBe(plan[0]!.to);
  });

  it('keeps counting past the first clash', () => {
    const three = [src('x y.jpg'), src('x_y.jpg'), src('X-Y.jpg')];
    const plan = planRename(three, { scheme: 'tidy' });
    expect(new Set(plan.map((r) => r.to.toLowerCase())).size).toBe(3);
  });
});

describe('the plan as a whole', () => {
  it('returns one row per file, in order, whatever the scheme', () => {
    const list = [src('a.jpg'), src('b.jpg'), src('c.jpg')];
    for (const scheme of ['sequence', 'dateTaken', 'tidy'] as const) {
      const plan = planRename(list, { scheme });
      expect(plan).toHaveLength(3);
      expect(plan.map((r) => r.from)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    }
  });

  it('marks a tidy that changed nothing, so the preview can say so', () => {
    expect(planRename([src('holiday.jpg')], { scheme: 'tidy' })[0]!.note).toBe('unchanged');
    expect(planRename([src('Holiday Photo.jpg')], { scheme: 'tidy' })[0]!.note).toBeUndefined();
  });

  it('handles an empty batch without inventing a row', () => {
    expect(planRename([], { scheme: 'sequence' })).toEqual([]);
  });

  it('refuses to build an unsafe name even from a hostile prefix', () => {
    const plan = planRename([src('a.jpg')], { scheme: 'sequence', prefix: '../../etc/passwd' });
    expect(plan[0]!.to).not.toContain('/');
    expect(plan[0]!.to).not.toContain('..');
  });
});

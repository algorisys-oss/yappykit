import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  buildEncryptArgv,
  buildDecryptArgv,
  classifyFailure,
  checkPassword,
  looksEncrypted,
} from './encrypt';

describe('checkPassword', () => {
  it('accepts an ordinary password', () => {
    expect(checkPassword('hunter2')).toBeNull();
  });

  it('refuses an empty password, which would silently mean something else', () => {
    // qpdf treats an empty user password as "anyone may open this", so accepting
    // one here would hand back a file the user believes is protected and is not.
    expect(checkPassword('')).toBe('empty');
    expect(checkPassword('   ')).toBe('empty');
  });

  it('keeps a password that is only unusual, not empty', () => {
    for (const pw of ['-p', '--encrypt', 'a=b', 'p a s s', '☕', '🔐🔐', 'a'.repeat(127)]) {
      expect(checkPassword(pw), pw).toBeNull();
    }
  });

  it('refuses a password longer than AES-256 can carry', () => {
    // The standard truncates to 127 bytes, so a longer one would appear to work
    // and then not match what the user typed.
    expect(checkPassword('a'.repeat(128))).toBe('tooLong');
    // Measured in bytes, not characters: an emoji is four.
    expect(checkPassword('🔐'.repeat(32))).toBe('tooLong');
    expect(checkPassword('🔐'.repeat(31))).toBeNull();
  });
});

describe('buildEncryptArgv', () => {
  it('always asks for AES-256 and nothing weaker', () => {
    const argv = buildEncryptArgv('hunter2');
    expect(argv).toContain('--bits=256');
    // 128 selects RC4, which qpdf refuses to write without --allow-weak-crypto.
    // That flag must never appear.
    expect(argv.join(' ')).not.toContain('allow-weak-crypto');
    expect(argv.join(' ')).not.toContain('--bits=128');
  });

  it('sets the same password for opening and for permissions', () => {
    // Two different passwords is a distinction almost nobody wants and everybody
    // misreads; one password means "this file needs this password".
    const argv = buildEncryptArgv('hunter2');
    expect(argv).toContain('--user-password=hunter2');
    expect(argv).toContain('--owner-password=hunter2');
  });

  it('passes the password as one argv entry, whatever is in it', () => {
    // These go straight to main(), never through a shell, so the only thing that
    // could break them is us splitting or quoting them ourselves.
    for (const pw of ['a b', 'a=b', '--encrypt', "it's", 'a"b', '☕']) {
      const argv = buildEncryptArgv(pw);
      expect(argv.filter((a) => a.startsWith('--user-password=')), pw).toEqual([
        `--user-password=${pw}`,
      ]);
    }
  });

  it('ends with the -- separator and the two paths, in that order', () => {
    expect(buildEncryptArgv('x').slice(-3)).toEqual(['--', '/in.pdf', '/out.pdf']);
  });
});

describe('buildDecryptArgv', () => {
  it('passes the password to open the file, and asks for no encryption out', () => {
    const argv = buildDecryptArgv('hunter2');
    expect(argv).toContain('--decrypt');
    expect(argv).toContain('--password=hunter2');
    expect(argv.slice(-3)).toEqual(['--', '/in.pdf', '/out.pdf']);
  });

  it('never writes encryption back out', () => {
    expect(buildDecryptArgv('x').join(' ')).not.toContain('--encrypt');
  });
});

describe('classifyFailure', () => {
  it('says nothing went wrong when nothing did', () => {
    expect(classifyFailure(0, [])).toBeNull();
  });

  it('recognises a wrong password from what qpdf actually prints', () => {
    // Verbatim from the spike; see spike/qpdf-encrypt/FINDINGS.md.
    expect(classifyFailure(2, ['this.program: /in.pdf: invalid password'])).toBe('wrongPassword');
  });

  it('recognises something that is not a PDF', () => {
    expect(
      classifyFailure(2, [
        "WARNING: /in.pdf: can't find PDF header",
        "this.program: /in.pdf: can't find startxref",
      ]),
    ).toBe('notPdf');
  });

  it('recognises a PDF that is damaged rather than mistyped', () => {
    expect(classifyFailure(2, ['this.program: /in.pdf: unable to find trailer dictionary'])).toBe(
      'damaged',
    );
  });

  it('falls back to a generic failure rather than inventing a reason', () => {
    expect(classifyFailure(2, ['this.program: something nobody predicted'])).toBe('failed');
    expect(classifyFailure(2, [])).toBe('failed');
  });

  it('treats qpdf warnings as success, because exit 3 still writes the file', () => {
    // qpdf exits 3 when it recovered from a problem; the output is valid and
    // refusing it would throw away a file the user can use.
    expect(classifyFailure(3, ['WARNING: /in.pdf: file is damaged'])).toBeNull();
  });
});

describe('looksEncrypted', () => {
  /** A real PDF, so the negative case is not a straw man. */
  async function plainPdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    return doc.save();
  }

  it('says no for a PDF that is not protected', async () => {
    expect(looksEncrypted(await plainPdf())).toBe(false);
  });

  it('spots the /Encrypt entry that every protected PDF carries', () => {
    // The trailer's /Encrypt reference is never itself encrypted — it is what
    // tells a reader how to decrypt everything else — so it is readable in the
    // raw bytes even when every content stream is not.
    const bytes = new TextEncoder().encode(
      '%PDF-1.7\ntrailer\n<< /Size 9 /Root 1 0 R /Encrypt 8 0 R >>\nstartxref\n',
    );
    expect(looksEncrypted(bytes)).toBe(true);
  });

  it('is not fooled by the word appearing inside ordinary text', () => {
    // A document that talks about encryption is not an encrypted document.
    const bytes = new TextEncoder().encode(
      '%PDF-1.7\n(This chapter covers /Encryption and how to Encrypt things) Tj\n',
    );
    expect(looksEncrypted(bytes)).toBe(false);
  });

  it('says no for something that is not a PDF at all', () => {
    expect(looksEncrypted(new TextEncoder().encode('hello, world'))).toBe(false);
  });
});

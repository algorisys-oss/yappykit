import { describe, it, expect } from 'vitest';
import { clipboardImages, isEditableTarget } from './paste';

const img = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type });
const transfer = (files: File[]) => ({ files: files as unknown as FileList });

describe('clipboardImages', () => {
  it('is empty when there is no clipboard payload', () => {
    expect(clipboardImages(null)).toEqual([]);
  });

  it('ignores a paste that carries no image', () => {
    expect(clipboardImages(transfer([img('notes.txt', 'text/plain')]))).toEqual([]);
  });

  it('takes the image out of a mixed paste', () => {
    const files = clipboardImages(transfer([img('notes.txt', 'text/plain'), img('cat.png', 'image/png')]));
    expect(files.map((f) => f.name)).toEqual(['cat.png']);
  });

  it('keeps a real filename, because the user chose it', () => {
    const files = clipboardImages(transfer([img('screenshot-2026-01-04.png', 'image/png')]));
    expect(files[0]!.name).toBe('screenshot-2026-01-04.png');
  });

  it('names the placeholder a screenshot paste arrives with', () => {
    // Every browser hands a copied screenshot over as "image.png"; two of them
    // in one list would collide, and the tools key their rows by name.
    const files = clipboardImages(transfer([img('image.png', 'image/png'), img('', 'image/jpeg')]));
    expect(files.map((f) => f.name)).toEqual(['pasted-1.png', 'pasted-2.jpg']);
  });

  it('continues the numbering the caller is already on', () => {
    const files = clipboardImages(transfer([img('image.png', 'image/png')]), 4);
    expect(files[0]!.name).toBe('pasted-4.png');
  });

  it('does not spend a number on a file that kept its name', () => {
    const files = clipboardImages(transfer([img('cat.png', 'image/png'), img('image.png', 'image/png')]));
    expect(files.map((f) => f.name)).toEqual(['cat.png', 'pasted-1.png']);
  });

  it('gives the renamed file the extension its type implies', () => {
    const types = ['image/jpeg', 'image/webp', 'image/svg+xml', 'image/heic'];
    const files = clipboardImages(transfer(types.map((t) => img('image.png', t))));
    expect(files.map((f) => f.name)).toEqual([
      'pasted-1.jpg',
      'pasted-2.webp',
      'pasted-3.svg',
      'pasted-4.heic',
    ]);
  });

  it('preserves the bytes and the type it was given', async () => {
    const files = clipboardImages(transfer([new File(['hello'], 'image.png', { type: 'image/png' })]));
    expect(files[0]!.type).toBe('image/png');
    // jsdom's File has no arrayBuffer(), so read it the way a browser did in 2015.
    const text = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(files[0]!);
    });
    expect(text).toBe('hello');
  });
});

describe('isEditableTarget', () => {
  it('is false for the page itself', () => {
    expect(isEditableTarget(document.body)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('is true where the user is typing, so their text paste is left alone', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isEditableTarget(document.createElement(tag)), tag).toBe(true);
    }
  });

  it('is true inside a contenteditable region', () => {
    const box = document.createElement('div');
    box.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    box.append(inner);
    document.body.append(box);
    expect(isEditableTarget(inner)).toBe(true);
    box.remove();
  });

  it('is false for a file input, which cannot take typed text anyway', () => {
    const el = document.createElement('input');
    el.type = 'file';
    expect(isEditableTarget(el)).toBe(false);
  });
});

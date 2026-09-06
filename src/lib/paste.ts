/**
 * Pasting a file straight into a tool.
 *
 * A screenshot rarely exists as a file: it is on the clipboard, and asking the
 * user to save it somewhere first just to pick it back up is the kind of detour
 * these tools exist to remove. The same is true of a document copied in a file
 * manager, which arrives on the clipboard as a real File. Ctrl/Cmd+V anywhere
 * on a tool page hands it to the same code the file picker feeds, so nothing
 * downstream has to know where the file came from.
 *
 * Each tool says what it can take. A PDF pasted onto the image compressor is
 * ignored rather than failing later with a decode error.
 *
 * The clipboard never leaves the tab: the File is read by the same on-device
 * pipeline as a picked file.
 */
import { onCleanup, onMount } from 'solid-js';

/** Every browser hands a copied screenshot over under this name. */
const PLACEHOLDER = /^(image|screenshot)\.(png|jpe?g|webp|gif|avif|bmp)$/i;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

function extensionFor(type: string): string {
  const known = EXTENSIONS[type];
  if (known) return known;
  const subtype = type.split('/')[1];
  return subtype ? subtype.toLowerCase() : 'bin';
}

/** What a tool is willing to take off the clipboard. */
export type FileFilter = (file: File) => boolean;

export const isImage: FileFilter = (f) => f.type.startsWith('image/');

/**
 * The type is checked first and the name second: a file manager sometimes hands
 * over a File with an empty `type`, and the extension is then all there is.
 */
export const isPdf: FileFilter = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export const anyFile: FileFilter = () => true;

/**
 * The acceptable files on a clipboard payload, named so they can be told apart.
 *
 * `startIndex` continues the caller's numbering: two pastes on the same page
 * would otherwise both produce `pasted-1.png`, and the tools key their rows by
 * name. A file that arrived with a name of its own keeps it and spends no
 * number, which is the usual case for anything copied in a file manager.
 */
export function clipboardFiles(
  data: Pick<DataTransfer, 'files'> | null,
  accept: FileFilter = anyFile,
  startIndex = 1,
): File[] {
  if (!data) return [];
  let n = startIndex;
  const out: File[] = [];
  for (const file of Array.from(data.files ?? [])) {
    if (!accept(file)) continue;
    if (file.name && !PLACEHOLDER.test(file.name)) {
      out.push(file);
      continue;
    }
    out.push(new File([file], `pasted-${n++}.${extensionFor(file.type)}`, { type: file.type }));
  }
  return out;
}

/** Whether the paste belongs to something the user is typing into. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const el = target.closest('input, textarea, select, [contenteditable]');
  if (!el) return false;
  // A file input takes no typed text, so a paste over it is meant for the tool.
  return !(el instanceof HTMLInputElement && el.type === 'file');
}

/**
 * Deliver acceptable clipboard files to `onFiles` while the component is mounted.
 *
 * Listens on the document rather than a drop target: there is nothing to focus
 * before the first file exists, so Ctrl+V has to work from anywhere on the page.
 */
export function usePasteFiles(accept: FileFilter, onFiles: (files: File[]) => void): void {
  let next = 1;
  const handle = (e: ClipboardEvent) => {
    if (isEditableTarget(e.target)) return;
    const files = clipboardFiles(e.clipboardData, accept, next);
    if (files.length === 0) return;
    next += files.filter((f) => f.name.startsWith('pasted-')).length;
    e.preventDefault();
    onFiles(files);
  };
  onMount(() => document.addEventListener('paste', handle));
  onCleanup(() => document.removeEventListener('paste', handle));
}

/** The image-only case, which is most of the tools. */
export function usePasteImages(onFiles: (files: File[]) => void): void {
  usePasteFiles(isImage, onFiles);
}

/**
 * Pasting an image straight into a tool.
 *
 * A screenshot rarely exists as a file: it is on the clipboard, and asking the
 * user to save it somewhere first just to pick it back up is the kind of detour
 * these tools exist to remove. Ctrl/Cmd+V anywhere on a tool page hands the
 * image to the same code the file picker feeds, so nothing downstream has to
 * know where the file came from.
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
};

function extensionFor(type: string): string {
  return EXTENSIONS[type] ?? type.slice('image/'.length).toLowerCase() ?? 'png';
}

/**
 * The images on a clipboard payload, named so they can be told apart.
 *
 * `startIndex` continues the caller's numbering: two pastes on the same page
 * would otherwise both produce `pasted-1.png`, and the tools key their rows by
 * name. A file that arrived with a name of its own keeps it and spends no
 * number.
 */
export function clipboardImages(data: Pick<DataTransfer, 'files'> | null, startIndex = 1): File[] {
  if (!data) return [];
  let n = startIndex;
  const out: File[] = [];
  for (const file of Array.from(data.files ?? [])) {
    if (!file.type.startsWith('image/')) continue;
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
 * Deliver clipboard images to `onFiles` for as long as the component is mounted.
 *
 * Listens on the document rather than a drop target: there is nothing to focus
 * before the first file exists, so Ctrl+V has to work from anywhere on the page.
 */
export function usePasteImages(onFiles: (files: File[]) => void): void {
  let next = 1;
  const handle = (e: ClipboardEvent) => {
    if (isEditableTarget(e.target)) return;
    const files = clipboardImages(e.clipboardData, next);
    if (files.length === 0) return;
    next += files.filter((f) => f.name.startsWith('pasted-')).length;
    e.preventDefault();
    onFiles(files);
  };
  onMount(() => document.addEventListener('paste', handle));
  onCleanup(() => document.removeEventListener('paste', handle));
}

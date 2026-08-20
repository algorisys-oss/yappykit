/**
 * OCR wrapper (lazy Tesseract.js).
 *
 * Runs text recognition on-device. Tesseract's worker, wasm and the English
 * language pack load only when the user starts OCR — and that download IS a
 * network request for a program asset (not the user's image), which the tool
 * discloses per docs/08 ("the user should never be surprised by one").
 */

export interface OcrProgress {
  status: string;
  progress: number; // 0..1
}

/** Recognize text in an image (canvas/blob/bitmap). Returns the extracted text. */
export async function recognizeText(
  image: HTMLCanvasElement | Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: onProgress
      ? (m: { status: string; progress: number }) =>
          onProgress({ status: m.status, progress: m.progress })
      : undefined,
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(image as Parameters<typeof worker.recognize>[0]);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}

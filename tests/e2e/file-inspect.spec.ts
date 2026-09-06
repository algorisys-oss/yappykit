import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { pngOf, type Rgb } from './helpers/fixtures';

/**
 * Inspecting a file, in a real browser.
 *
 * The tool's reason to exist is that a name is not evidence. A .jpg that is
 * really a PNG is the usual cause of an upload being rejected without saying
 * why, and nothing in an operating system will tell you that is what happened.
 *
 * So the fixture that matters most is a deliberate lie: PNG bytes under a .jpg
 * name. Everything about the file except its first eight bytes says JPEG.
 */

const TEAL: Rgb = [20, 160, 160];
const picture = (w = 64, h = 48) => pngOf(w, h, () => TEAL);

async function inspect(
  page: import('@playwright/test').Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto('/inspect-a-file');
  await page.setInputFiles('input[type="file"]', file);
  await expect(page.getByText(/^What it is$/)).toBeVisible({ timeout: 30_000 });
}

test('catches a file whose name disagrees with its bytes', async ({ page }) => {
  await inspect(page, { name: 'holiday.jpg', mimeType: 'image/jpeg', buffer: picture() });

  // The finding, in the words that explain the consequence.
  await expect(page.getByText(/the bytes say this is a png file/i)).toBeVisible();
  await expect(page.getByText(/rejected without explaining itself/i)).toBeVisible();
});

test('says nothing is wrong when the name and the bytes agree', async ({ page }) => {
  await inspect(page, { name: 'holiday.png', mimeType: 'image/png', buffer: picture() });

  await expect(page.getByText(/the bytes say this is a/i)).toBeHidden();
  await expect(page.getByText(/64 x 48 pixels/)).toBeVisible();
});

test('reads a PDF without opening it as one', async ({ page }) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setAuthor('Rajesh');
  doc.setTitle('Quarterly');
  for (let n = 0; n < 4; n += 1) doc.addPage([200, 200]).drawText('x', { x: 10, y: 10, font });

  await inspect(page, {
    name: 'quarterly.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  });

  await expect(page.getByText(/^Pages$/)).toBeVisible();
  // The author is a finding, not a curiosity: it names a person.
  await expect(page.getByText(/it names a person, or the software/i)).toBeVisible();
});

test('lists the parts inside a ZIP-shaped document without unpacking it', async ({ page }) => {
  // A minimal ZIP with two stored entries, which is the shape of every office
  // document. Nothing here needs decompressing to be counted.
  const entries = ['[Content_Types].xml', 'word/document.xml'];
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const name of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  await inspect(page, {
    name: 'quarterly.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.concat([...chunks, centralBuf, end]),
  });

  await expect(page.getByText(/an office document, which is a zip/i)).toBeVisible();
  await expect(page.getByText(/^Parts inside$/)).toBeVisible();
});

test('does not pretend to recognise a file it does not know', async ({ page }) => {
  await inspect(page, {
    name: 'mystery.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('  not a format anyone knows'),
  });
  await expect(page.getByText(/not recognised/i)).toBeVisible();
});

/**
 * Metadata reader. Wraps exifr (imported dynamically so its weight loads only
 * when a file is chosen) to surface a human-readable summary — with GPS called
 * out, because location is the field users most need to know is there. Reading
 * is entirely in-tab; nothing is uploaded.
 */

export interface MetadataField {
  label: string;
  value: string;
  /** Privacy-sensitive fields (location, device, personal) render highlighted. */
  sensitive?: boolean;
}

export interface MetadataSummary {
  fields: MetadataField[];
  hasGps: boolean;
  /** True when no readable metadata was found. */
  empty: boolean;
}

export async function readMetadata(file: Blob): Promise<MetadataSummary> {
  const exifr = await import('exifr');
  // gps:true asks exifr to also resolve latitude/longitude if present.
  const data: Record<string, unknown> | undefined = await exifr
    .parse(file, { gps: true, xmp: true, iptc: true })
    .catch(() => undefined);

  if (!data) return { fields: [], hasGps: false, empty: true };

  const fields: MetadataField[] = [];
  const push = (label: string, value: unknown, sensitive = false) => {
    if (value == null || value === '') return;
    fields.push({ label, value: String(value), sensitive });
  };

  const hasGps = data.latitude != null && data.longitude != null;
  if (hasGps) {
    push('Location', `${fmt(data.latitude)}, ${fmt(data.longitude)}`, true);
  }
  push('Camera', join([data.Make, data.Model]), true);
  push('Lens', data.LensModel);
  push('Taken', formatDate(data.DateTimeOriginal ?? data.CreateDate));
  push('Software', data.Software, true);
  push('Artist', data.Artist ?? data.Creator, true);
  push('Copyright', data.Copyright);
  push('Dimensions', data.ExifImageWidth && data.ExifImageHeight ? `${data.ExifImageWidth}×${data.ExifImageHeight}` : undefined);
  push('Orientation', typeof data.Orientation === 'number' ? String(data.Orientation) : undefined);

  return { fields, hasGps, empty: fields.length === 0 };
}

function fmt(n: unknown): string {
  return typeof n === 'number' ? n.toFixed(5) : String(n);
}
function join(parts: unknown[]): string {
  return parts.filter((p) => p != null && p !== '').join(' ');
}
function formatDate(d: unknown): string | undefined {
  if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
  return typeof d === 'string' ? d : undefined;
}

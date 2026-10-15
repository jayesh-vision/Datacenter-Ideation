/* The review pack files as the portal offers them (download buttons, email attachments): names and builders. The builders are Agent A's
   (pdf.ts, xlsx.ts, zip.ts), loaded lazily so the libraries stay out of the main bundle. */
import type { ReviewDoc } from './model';
import type { ReviewAttachment, ReviewDelivery } from '../../../../planner/lib/reviews';

export type PackFile = 'pdf' | 'xlsx' | 'zip';
export const fileName = (doc: ReviewDoc, f: PackFile) => `${doc.meta.plnId}-${doc.meta.revision} ${f === 'xlsx' ? 'Data' : 'Review pack'}.${f}`;

/** Build one file of the pack (lazy). */
export async function buildFile(doc: ReviewDoc, f: PackFile): Promise<Blob | undefined> {
  // Agent A's builders (zip.ts → pdf.ts / xlsx.ts), loaded on demand
  const { buildPackFile } = await import('./zip');
  return buildPackFile(doc, f);
}

/** Download one file of the pack. */
export async function downloadFile(doc: ReviewDoc, f: PackFile): Promise<boolean> {
  const b = await buildFile(doc, f); if (!b) return false;
  const url = URL.createObjectURL(b); const a = document.createElement('a');
  a.href = url; a.download = fileName(doc, f); a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

/** The attachments an email of this kind carries, with their real sizes (built once). */
export async function attachmentsFor(doc: ReviewDoc, d: ReviewDelivery): Promise<ReviewAttachment[]> {
  if (d === 'link') return [];
  const f: PackFile = d === 'pdf' ? 'pdf' : 'zip';
  const b = await buildFile(doc, f);
  return [{ name: fileName(doc, f), bytes: b?.size ?? 0 }];
}

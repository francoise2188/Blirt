import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatLetterDate,
  formatTextBlirtLetter,
  LETTER_RULE,
} from './textBlirtLetterFormat';
import { normalizeBlirtMediaStoragePath } from './blirtsStoragePath';

/**
 * PDF fonts: jsPDF only supports its built-in 14 fonts reliably. Embedding DM Sans /
 * Fraunces TTF (even from WOFF2) often fails with "No unicode cmap for font".
 * We use Times (serif) for display headings and Helvetica (sans) for body — close
 * to the site’s Fraunces + DM Sans pairing, and stable everywhere.
 */

type BlirtRow = {
  id: string;
  type: string;
  content: string;
  created_at: string | null;
  guest_name: string | null;
  prompt_snapshot?: string | null;
};

const MARGIN = 52;
const PAGE_H = 792;
const PAGE_W = 612;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const INK: [number, number, number] = [21, 21, 21];
/** Brand chartreuse ~ #b5cc2e */
const ACCENT: [number, number, number] = [181, 204, 46];
const MUTED: [number, number, number] = [95, 95, 95];

/** Long enough for keepsake PDF; Supabase may cap lower. */
const MEDIA_LINK_EXPIRY_SEC = 60 * 60 * 24 * 30;

/** jsPDF built-in fonts use PDF standard encodings; normalize common punctuation. */
function pdfSafeLine(input: string): string {
  return input
    .replace(/\u00b7/g, ' - ')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function sortChronological(items: BlirtRow[]): BlirtRow[] {
  return [...items].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });
}

export async function buildBlirtsCollectionPdf(params: {
  supabase: SupabaseClient;
  items: BlirtRow[];
  eventDisplayName: string;
  eventTypeLabel?: string | null;
}): Promise<{ blob: Blob; mediaLinkErrors: string[] }> {
  const { jsPDF } = await import('jspdf');
  const { supabase, items, eventDisplayName, eventTypeLabel } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = MARGIN;

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  const ensureBottom = (h: number) => {
    if (y + h > PAGE_H - MARGIN) newPage();
  };

  const writeLine = (
    text: string,
    opts?: {
      bold?: boolean;
      /** Times bold (serif headings, like Fraunces on the site) */
      display?: boolean;
      size?: number;
      color?: [number, number, number];
    },
  ) => {
    if (!text) return;
    text = pdfSafeLine(text);
    const size = opts?.size ?? 11;
    const lineH = Math.round(size * 1.35);
    ensureBottom(lineH + 4);
    if (opts?.display) {
      doc.setFont('times', 'bold');
    } else {
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    }
    doc.setFontSize(size);
    const c = opts?.color ?? INK;
    doc.setTextColor(c[0], c[1], c[2]);
    const wrapped = doc.splitTextToSize(text, CONTENT_W);
    for (const w of wrapped) {
      ensureBottom(lineH);
      doc.text(w, MARGIN, y);
      y += lineH;
    }
  };

  const writeGap = (gap: number) => {
    y += gap;
  };

  // —— Cover
  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  ensureBottom(40);
  doc.text(pdfSafeLine('Your Blirt collection'), MARGIN, y);
  y += 36;

  doc.setFontSize(20);
  doc.text(pdfSafeLine(eventDisplayName.trim() || 'Your event'), MARGIN, y);
  y += 30;

  if (eventTypeLabel?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    ensureBottom(20);
    doc.text(pdfSafeLine(eventTypeLabel.trim()), MARGIN, y);
    y += 22;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  ensureBottom(16);
  doc.text(`Saved ${formatLetterDate(new Date().toISOString())}`, MARGIN, y);
  y += 40;

  const sorted = sortChronological(items);
  const texts = sorted.filter((b) => (b.type || '').toLowerCase() === 'text');
  const media = sorted.filter((b) => {
    const t = (b.type || '').toLowerCase();
    return t === 'video' || t === 'audio';
  });

  // —— Text messages (letter format)
  if (texts.length > 0) {
    writeLine('Messages', { display: true, size: 16, color: ACCENT });
    writeGap(8);
    doc.setTextColor(INK[0], INK[1], INK[2]);

    for (let i = 0; i < texts.length; i++) {
      const b = texts[i];
      const letter = formatTextBlirtLetter({
        eventDisplayName,
        guestName: b.guest_name,
        prompt: (b.prompt_snapshot ?? '').trim(),
        message: b.content,
        createdAt: b.created_at,
      });

      const lines = letter.split('\n');
      for (const line of lines) {
        if (line === '') {
          writeGap(8);
          continue;
        }
        const isRule = line.trim() === LETTER_RULE.trim();
        const isFooter = line.startsWith('Sent via Blirt');
        if (isRule) {
          writeLine(line, { size: 10, color: MUTED });
        } else if (isFooter) {
          writeLine(line, { size: 10, color: MUTED });
        } else {
          writeLine(line, { size: 11, color: INK });
        }
      }

      if (i < texts.length - 1) {
        writeGap(28);
        ensureBottom(40);
        doc.setDrawColor(230, 228, 220);
        doc.setLineWidth(0.5);
        doc.line(MARGIN, y, PAGE_W - MARGIN, y);
        y += 24;
      }
    }
  }

  const mediaLinkErrors: string[] = [];

  // —— Video & audio (links) — ASCII-only helper line avoids WinAnsi issues
  if (media.length > 0) {
    newPage();
    writeLine('Video & voice notes', { display: true, size: 16, color: ACCENT });
    writeGap(6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const note = doc.splitTextToSize(
      'These links open in a browser. They expire after a while - for files you keep forever, use "Download all files."',
      CONTENT_W,
    );
    for (const ln of note) {
      ensureBottom(14);
      doc.text(ln, MARGIN, y);
      y += 14;
    }
    y += 16;

    for (let i = 0; i < media.length; i++) {
      const b = media[i];
      const t = (b.type || '').toLowerCase();
      const label = t === 'video' ? 'Video' : 'Voice note';
      const guest = b.guest_name?.trim() || 'A friend';
      const when = formatLetterDate(b.created_at);
      const prompt = (b.prompt_snapshot ?? '').trim();

      const mediaPath = normalizeBlirtMediaStoragePath(b.content);
      ensureBottom(120);

      writeLine(`${label} · ${guest}`, { bold: true, size: 12, color: INK });
      if (when) writeLine(when, { size: 10, color: MUTED });
      if (prompt) {
        writeGap(4);
        writeLine(`Prompt: ${prompt}`, { size: 10, color: MUTED });
      }

      if (mediaPath.includes('/')) {
        const { data, error } = await supabase.storage
          .from('blirts-media')
          .createSignedUrl(mediaPath, MEDIA_LINK_EXPIRY_SEC);
        if (error || !data?.signedUrl) {
          mediaLinkErrors.push(`${b.id}: ${error?.message ?? 'no URL'}`);
          writeLine('Could not create a link for this file (permissions or missing file).', {
            size: 10,
            color: MUTED,
          });
        } else {
          const url = data.signedUrl;
          ensureBottom(18);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(60, 90, 160);
          doc.textWithLink('Open recording', MARGIN, y, { url });
          y += 14;
          doc.setTextColor(INK[0], INK[1], INK[2]);
          doc.setFontSize(11);
        }
      } else {
        writeLine('No media path on file.', { size: 10, color: MUTED });
      }

      if (i < media.length - 1) {
        y += 12;
        doc.setDrawColor(230, 228, 220);
        doc.line(MARGIN, y, PAGE_W - MARGIN, y);
        y += 20;
      }
    }
  }

  // Empty state
  if (texts.length === 0 && media.length === 0) {
    writeGap(16);
    writeLine('No Blirts in this export yet.', { size: 12, color: MUTED });
  }

  const blob = doc.output('blob');
  return { blob, mediaLinkErrors };
}

export function collectionPdfFilename(eventDisplayName: string): string {
  const slug = eventDisplayName
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 48);
  return `blirt-collection-${slug || 'event'}.pdf`;
}

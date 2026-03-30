/**
 * QR → PNG and branded 4×6″ print card (PDF) for host sharing.
 * Client-only (uses canvas / DOM).
 */
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

export type DownloadPrintCardOptions = {
  filename?: string;
};

export type DownloadQrPngOptions = {
  filename?: string;
  /** Pixel width of the square QR (default 1200 for print-friendly output). */
  width?: number;
};

/** 4×6 inch printable card with QR + messaging + Blirt branding. */
export async function downloadPrintCard(
  blirtUrl: string,
  hostName = '',
  options?: DownloadPrintCardOptions,
): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(blirtUrl, {
    width: 400,
    margin: 1,
    color: {
      dark: '#1a1a1a',
      light: '#ffffff',
    },
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [4, 6],
  });

  const pageW = 4;
  const pageH = 6;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');

  doc.setFillColor(24, 24, 24);
  doc.rect(0, 0, pageW, 0.12, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(24, 24, 24);
  doc.text('Scan & leave a memory', pageW / 2, 0.75, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);

  const subtext = hostName.trim()
    ? `Leave a video, voice, or text message for ${hostName.trim()}`
    : 'Leave a video, voice, or text message';

  doc.text(subtext, pageW / 2, 1.12, { align: 'center' });

  const qrSize = 2.4;
  const qrX = (pageW - qrSize) / 2;
  const qrY = 1.4;
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.01);
  doc.rect(qrX - 0.05, qrY - 0.05, qrSize + 0.1, qrSize + 0.1);

  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.008);
  doc.line(0.4, 4.1, pageW - 0.4, 4.1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(24, 24, 24);
  doc.text('blirt', pageW / 2, 4.45, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text('blirt-it.com', pageW / 2, 4.7, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text('No app download needed · Works on any phone', pageW / 2, 5.6, {
    align: 'center',
  });

  doc.setFillColor(24, 24, 24);
  doc.rect(0, pageH - 0.12, pageW, 0.12, 'F');

  doc.save(options?.filename ?? 'blirt-print-card.pdf');
}

/** Square PNG from the same URL (for signs or custom layouts). */
export async function downloadQRCodeAsPng(
  blirtUrl: string,
  options?: DownloadQrPngOptions,
): Promise<void> {
  const width = options?.width ?? 600;
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, blirtUrl, {
    width,
    margin: 2,
    color: {
      dark: '#1a1a1a',
      light: '#ffffff',
    },
  });

  const link = document.createElement('a');
  link.download = options?.filename ?? 'blirt-qr-code.png';
  link.href = canvas.toDataURL('image/png');
  link.rel = 'noopener';
  link.click();
}

/** Alias for snippet compatibility. */
export const downloadQRCode = downloadQRCodeAsPng;

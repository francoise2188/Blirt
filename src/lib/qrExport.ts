/**
 * Turn the SVG from react-qr-code into a sharp PNG for download / print.
 * (Libraries don't change QR quality — vector SVG scales; we rasterize at high pixel size.)
 */

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Rasterize QR SVG to PNG data URL (white background, square). */
export async function svgQrToPngDataUrl(
  svg: SVGSVGElement,
  outSize = 1200,
): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(outSize));
  clone.setAttribute('height', String(outSize));
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not load QR image'));
      i.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outSize, outSize);
    ctx.drawImage(img, 0, 0, outSize, outSize);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadPngDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function openQrPrintSheet(opts: {
  documentTitle: string;
  headline: string;
  guestUrl: string;
  pngDataUrl: string;
}): void {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
  if (!w) {
    window.alert(
      'Your browser blocked the print window. Allow pop-ups for this site, or use Download QR instead.',
    );
    return;
  }

  const title = escapeHtml(opts.documentTitle);
  const headline = escapeHtml(opts.headline);
  const url = escapeHtml(opts.guestUrl);

  w.document.open();
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      margin: 0;
      padding: 28px 20px 40px;
      text-align: center;
      color: #111;
    }
    h1 { font-size: 1.35rem; margin: 0 0 6px; line-height: 1.25; }
    .hint { font-size: 0.95rem; color: #444; margin: 0 0 18px; }
    .url {
      font-size: 0.8rem;
      word-break: break-all;
      max-width: 520px;
      margin: 0 auto 22px;
      padding: 10px 12px;
      background: #f4f4f4;
      border-radius: 8px;
      text-align: left;
    }
    .qr {
      width: 280px;
      height: 280px;
      max-width: 72vw;
      max-height: 72vw;
      margin: 0 auto;
      display: block;
    }
    .footer { font-size: 0.8rem; color: #555; margin-top: 18px; }
    @media print {
      body { padding: 12mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>${headline}</h1>
  <p class="hint">Scan with a phone camera to leave a Blirt</p>
  <div class="url">${url}</div>
  <img class="qr" src="${opts.pngDataUrl}" alt="QR code" width="280" height="280" />
  <p class="footer">Blirt — ${headline}</p>
  <p class="no-print" style="margin-top:20px;font-size:0.85rem;color:#666;">
    A print dialog should open. If not, use your browser menu: Print.
  </p>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 300);
    });
  </script>
</body>
</html>`);
  w.document.close();
}

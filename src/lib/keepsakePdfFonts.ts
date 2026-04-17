import path from 'path';
import { Font } from '@react-pdf/renderer';

let registered = false;

function fontsourceFile(pkg: string, file: string): string {
  return path.join(process.cwd(), 'node_modules', pkg, 'files', file);
}

/**
 * EB Garamond + Inter from `@fontsource/*` (WOFF, not WOFF2 — fewer fontkit embed edge cases).
 * Paths resolve at runtime from `node_modules` so deploys include fonts via npm deps.
 */
export function registerKeepsakePdfFonts(): void {
  if (registered) return;
  registered = true;

  Font.register({
    family: 'KeepsakeSerif',
    fonts: [
      {
        src: fontsourceFile('@fontsource/eb-garamond', 'eb-garamond-latin-400-normal.woff'),
        fontWeight: 400,
        fontStyle: 'normal',
      },
      {
        src: fontsourceFile('@fontsource/eb-garamond', 'eb-garamond-latin-400-italic.woff'),
        fontWeight: 400,
        fontStyle: 'italic',
      },
    ],
  });

  Font.register({
    family: 'KeepsakeSans',
    src: fontsourceFile('@fontsource/inter', 'inter-latin-400-normal.woff'),
  });
}

/**
 * Strip emoji / pictographs and normalize “smart” punctuation so Latin-subset PDF
 * fonts do not hit missing glyphs during subset embedding.
 */
export function sanitizePdfText(s: string | null | undefined): string {
  if (s == null) return '';
  return (
    s
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u00A0/g, ' ')
  );
}

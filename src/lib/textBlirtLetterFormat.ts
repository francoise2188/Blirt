/** Shared by ZIP text files, collection PDF, etc. */

/**
 * ASCII hyphens only — Unicode “box drawing” lines break in PDFs (jsPDF’s Helvetica
 * can’t render U+2500 and shows garbage like %%& instead).
 */
export const LETTER_RULE = '----------------------------------------';

export function formatLetterDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatTextBlirtLetter(params: {
  eventDisplayName: string;
  guestName: string | null;
  prompt: string;
  message: string;
  createdAt: string | null;
}): string {
  const main = params.eventDisplayName.trim() || 'your event';
  const fromLine = params.guestName?.trim() ? params.guestName.trim() : 'a friend';
  const dateLine = formatLetterDate(params.createdAt);
  const prompt = params.prompt.trim();
  const msg = params.message;

  const lines: string[] = [
    `A message for ${main}`,
    `from ${fromLine}`,
    '',
    LETTER_RULE,
    '',
  ];
  if (prompt) {
    lines.push(prompt, '', msg);
  } else {
    lines.push(msg);
  }
  lines.push('', LETTER_RULE, `Sent via Blirt · ${dateLine}`);
  return lines.join('\n');
}

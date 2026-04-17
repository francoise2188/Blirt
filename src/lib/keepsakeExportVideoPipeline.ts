/**
 * Keepsake export video (FFmpeg or Remotion) — **visuals only**.
 *
 * Licensing: do **not** embed Deezer/Spotify preview audio in the rendered file.
 * Closing slate may show a QR pointing to `getExperiencePageUrl(event_id)` for the full experience.
 *
 * Pipeline sketch (implement on a worker or long-running server job):
 * 1. Opening title (names, date, optional cover)
 * 2. Per entry: intro card (art + titles) → optional text slate → guest video (muted or silent bed only)
 * 3. Closing: QR + “Scan to experience it”
 *
 * Input rows can be built from the same fields as `ExperienceEntry` + signed video URLs.
 */

import type { KeepsakeExportEntryInput } from './keepsakeExperienceTypes';

export type KeepsakeExportVideoJob = {
  event_id: string;
  opening: {
    title_line: string;
    subtitle_line?: string;
    /** ISO date string */
    event_date?: string | null;
  };
  closing_qr_target_url: string;
  entries: KeepsakeExportEntryInput[];
};

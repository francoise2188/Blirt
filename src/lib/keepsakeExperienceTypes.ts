/**
 * Keepsake (export) ↔ Experience (web) — shared shapes.
 * Export video uses visuals only (no copyrighted audio embedded). Web streams previews via Deezer proxy.
 */

/** One row for FFmpeg / Remotion keepsake render (server job — not stored as one blob in DB). */
export type KeepsakeExportEntryInput = {
  video_url: string;
  message_text: string;
  song_title: string;
  artist_name: string;
  album_cover_url: string;
  spotify_url: string;
  event_id: string;
  entry_id: string;
  /** Display only — never muxed into export video audio track. */
  guest_label?: string | null;
};

/** Public experience API — safe fields for `/e/{event_id}`. */
export type ExperienceEntry = {
  entry_id: string;
  song_title: string;
  artist_name: string;
  album_cover_url: string | null;
  spotify_url: string;
  message_text: string;
  soundtrack_message_type: 'video' | 'audio' | 'text';
  /** Short-lived signed URL to guest recording in Storage (video). */
  video_url: string | null;
  /** Short-lived signed URL to guest recording in Storage (voice note). */
  audio_url: string | null;
  guest_label: string | null;
};

export type ExperienceEventPayload = {
  event_id: string;
  partner_1: string | null;
  partner_2: string | null;
  event_date: string | null;
  entries: ExperienceEntry[];
};

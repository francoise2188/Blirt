'use client';

import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { duckAudio } from '../lib/audioDuck';
import type { ExperienceEntry, ExperienceEventPayload } from '../lib/keepsakeExperienceTypes';
import { getProxiedDeezerPreviewUrl, SONG_DEDICATION_PLACEHOLDER_ART } from '../lib/songDedication';
import styles from './KeepsakeExperience.module.css';

const PROMPT = 'This made me think of you because…';

function displayNames(p1: string | null, p2: string | null): string {
  const a = (p1 ?? '').trim();
  const b = (p2 ?? '').trim();
  if (a && b) return `${a} & ${b}`;
  return a || b || 'Your event';
}

export default function KeepsakeExperienceClient({
  eventId,
  highlightEntryId,
}: {
  eventId: string;
  highlightEntryId: string | null;
}) {
  const [data, setData] = useState<ExperienceEventPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const activePreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetch(`/api/experience/${encodeURIComponent(eventId)}`)
      .then(async (res) => {
        const body = (await res.json()) as ExperienceEventPayload | { error?: string };
        if (!res.ok) {
          throw new Error('error' in body && body.error ? body.error : res.statusText);
        }
        if (!cancelled) setData(body as ExperienceEventPayload);
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message || 'Could not load experience.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!highlightEntryId || !data) return;
    const el = document.getElementById(`entry-${highlightEntryId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightEntryId, data]);

  const stopPreview = useCallback(() => {
    const a = activePreviewRef.current;
    if (a) {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {
        /* ignore */
      }
      activePreviewRef.current = null;
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>Loading…</p>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className={styles.page}>
        <p className={styles.error} role="alert">
          {err ?? 'Something went wrong.'}
        </p>
      </div>
    );
  }

  const title = displayNames(data.partner_1, data.partner_2);
  const when = data.event_date
    ? new Date(data.event_date + (data.event_date.length <= 10 ? 'T12:00:00' : '')).toLocaleDateString(
        undefined,
        { year: 'numeric', month: 'long', day: 'numeric' },
      )
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {when ? <p className={styles.date}>{when}</p> : null}
        <p className={styles.tagline}>Songs your people chose for you 💌</p>
      </header>

      {data.entries.length === 0 ? (
        <p className={styles.muted}>No saved messages yet. When your host marks Blirts as kept, they’ll appear here.</p>
      ) : (
        <ul className={styles.feed}>
          {data.entries.map((entry) => (
            <li key={entry.entry_id} id={`entry-${entry.entry_id}`} className={styles.card}>
              <EntryCard
                entry={entry}
                activePreviewRef={activePreviewRef}
                stopPreview={stopPreview}
                onDuckPreview={() => {
                  const a = activePreviewRef.current;
                  if (a) duckAudio(a);
                  activePreviewRef.current = null;
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.footer}>
        <p className={styles.footerLine}>Made with Blirt</p>
      </footer>
    </div>
  );
}

function EntryCard({
  entry,
  activePreviewRef,
  onDuckPreview,
  stopPreview,
}: {
  entry: ExperienceEntry;
  activePreviewRef: MutableRefObject<HTMLAudioElement | null>;
  onDuckPreview: () => void;
  stopPreview: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewUrl(null);
    void getProxiedDeezerPreviewUrl(entry.song_title, entry.artist_name).then((url) => {
      if (!cancelled) {
        setPreviewUrl(url);
        setPreviewLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entry.song_title, entry.artist_name, entry.entry_id]);

  const playPreview = async () => {
    if (!previewUrl || previewLoading) return;
    stopPreview();
    const a = new Audio(previewUrl);
    a.volume = 0.85;
    activePreviewRef.current = a;
    a.addEventListener('ended', () => {
      setPreviewPlaying(false);
      if (activePreviewRef.current === a) activePreviewRef.current = null;
    });
    try {
      await a.play();
      setPreviewPlaying(true);
    } catch {
      setPreviewPlaying(false);
    }
  };

  const pausePreview = () => {
    const a = activePreviewRef.current;
    if (a) {
      try {
        a.pause();
      } catch {
        /* ignore */
      }
      if (activePreviewRef.current === a) activePreviewRef.current = null;
      setPreviewPlaying(false);
    }
  };

  const art = entry.album_cover_url?.trim() || SONG_DEDICATION_PLACEHOLDER_ART;

  return (
    <article className={styles.cardInner}>
      <div className={styles.coverRow}>
        <img src={art} alt="" className={styles.cover} />
        <div className={styles.trackBlock}>
          <div className={styles.songLine}>
            {entry.song_title} — {entry.artist_name}
          </div>
          {entry.guest_label ? <div className={styles.guestLine}>A message from {entry.guest_label}</div> : null}
        </div>
      </div>

      <div className={styles.actions}>
        {previewUrl ? (
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={previewLoading}
            onClick={() => {
              if (previewPlaying) pausePreview();
              else void playPreview();
            }}
          >
            {previewLoading ? 'Loading…' : previewPlaying ? 'Pause preview' : '▶ Play preview'}
          </button>
        ) : (
          <span className={styles.mutedSmall}>No preview for this track</span>
        )}
        <a className={styles.spotifyLink} href={entry.spotify_url} target="_blank" rel="noopener noreferrer">
          Open in Spotify
        </a>
      </div>

      <p className={styles.prompt}>{PROMPT}</p>
      {entry.message_text ? (
        <p className={styles.message}>{entry.message_text}</p>
      ) : entry.soundtrack_message_type === 'text' ? (
        <p className={styles.mutedSmall}>(No message text)</p>
      ) : null}

      {entry.soundtrack_message_type === 'video' && entry.video_url ? (
        <div className={styles.mediaBlock}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              onDuckPreview();
              const v = videoRef.current;
              if (!v) return;
              void v.play().catch(() => {});
            }}
          >
            ▶ Play video
          </button>
          <video
            ref={videoRef}
            className={styles.video}
            src={entry.video_url}
            controls
            playsInline
            onPlay={() => {
              onDuckPreview();
            }}
          />
        </div>
      ) : null}

      {entry.soundtrack_message_type === 'audio' && entry.audio_url ? (
        <div className={styles.mediaBlock}>
          <p className={styles.mediaLabel}>Voice note</p>
          <audio
            ref={audioRef}
            className={styles.guestAudio}
            src={entry.audio_url}
            controls
            onPlay={() => {
              onDuckPreview();
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

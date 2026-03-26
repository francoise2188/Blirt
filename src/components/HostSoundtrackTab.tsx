'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VideoFit } from './VideoFit';
import { friendlyBlirtStorageError } from '../lib/blirtsStoragePath';
import styles from '../app/host/host.module.css';

const SOUNDTRACK_PROMPT = 'This song reminds me of you because...';

export type SoundtrackBlirtRow = {
  id: string;
  content: string;
  created_at: string | null;
  guest_name: string | null;
  soundtrack_message_type?: 'video' | 'audio' | 'text' | null;
  spotify_track_id?: string | null;
  spotify_track_name?: string | null;
  spotify_artist_name?: string | null;
  spotify_album_art_url?: string | null;
  spotify_preview_url?: string | null;
};

type Props = {
  eventTitle: string;
  eventDateLine: string;
  keptSoundtracks: SoundtrackBlirtRow[];
  hasAnySoundtrackSubmission: boolean;
  mediaUrls: Record<string, string>;
  mediaUrlErrors: Record<string, string>;
};

function guestLabel(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  return t || 'Guest';
}

export function formatPlaylistEventDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = String(iso).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  if (m) {
    const y = m[1];
    const mo = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    return `${months[mo]} ${day}, ${y}`;
  }
  try {
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  } catch {
    /* ignore */
  }
  return '';
}

function buildPlaylistClipboardText(
  eventTitle: string,
  eventDateLine: string,
  items: SoundtrackBlirtRow[],
): string {
  const lines: string[] = [];
  lines.push(`🎵 ${eventTitle} Blirt Soundtrack`);
  if (eventDateLine) lines.push(eventDateLine);
  lines.push('');
  items.forEach((b, idx) => {
    const track = (b.spotify_track_name ?? '').trim() || 'Unknown track';
    const artist = (b.spotify_artist_name ?? '').trim() || 'Unknown artist';
    const by = guestLabel(b.guest_name);
    lines.push(`${idx + 1}. ${track} — ${artist}`);
    lines.push(`   Dedicated by ${by}`);
  });
  lines.push('');
  lines.push('➡️ Paste this list into Spotify to build your playlist and relive every moment.');
  lines.push('');
  lines.push('Made with Blirt 💛 blirt-it.com');
  return lines.join('\n');
}

export function HostSoundtrackTab({
  eventTitle,
  eventDateLine,
  keptSoundtracks,
  hasAnySoundtrackSubmission,
  mediaUrls,
  mediaUrlErrors,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showEmpty = hasAnySoundtrackSubmission && keptSoundtracks.length === 0;
  const canCopyPlaylist = keptSoundtracks.length >= 1;

  const clipboardText = useMemo(
    () => buildPlaylistClipboardText(eventTitle, eventDateLine, keptSoundtracks),
    [eventTitle, eventDateLine, keptSoundtracks],
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const pausePreview = useCallback(() => {
    const a = previewAudioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    setPlayingPreviewId(null);
  }, []);

  const togglePreview = useCallback(
    async (b: SoundtrackBlirtRow) => {
      const url = (b.spotify_preview_url ?? '').trim();
      if (!url) return;
      const a = previewAudioRef.current;
      if (!a) return;
      if (playingPreviewId === b.id) {
        pausePreview();
        return;
      }
      a.src = url;
      try {
        await a.play();
        setPlayingPreviewId(b.id);
      } catch {
        setPlayingPreviewId(null);
      }
    },
    [playingPreviewId, pausePreview],
  );

  useEffect(() => {
    const a = previewAudioRef.current;
    if (!a) return;
    function onEnded() {
      setPlayingPreviewId(null);
    }
    a.addEventListener('ended', onEnded);
    return () => a.removeEventListener('ended', onEnded);
  }, []);

  async function copyPlaylist() {
    if (!canCopyPlaylist) return;
    try {
      await navigator.clipboard.writeText(clipboardText);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = clipboardText;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        window.alert('Could not copy — select and copy manually.');
        return;
      }
    }
    setCopyToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setCopyToast(false), 3000);
  }

  function toggleRow(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  return (
    <div className={styles.card}>
      <h2 className={styles.soundtrackTabTitle}>Your Blirt Soundtrack</h2>
      <p className={styles.soundtrackTabSub}>
        Songs your guests dedicated to you. Copy them all to build your playlist in Spotify.
      </p>

      <audio ref={previewAudioRef} preload="none" className={styles.soundtrackHiddenAudio} aria-hidden />

      {showEmpty ? (
        <p className={styles.soundtrackEmpty} role="status">
          No songs yet — guests can dedicate a song when they leave a Blirt 🎵
        </p>
      ) : (
        <ul className={styles.soundtrackList}>
          {keptSoundtracks.map((b, index) => {
            const artUrl = (b.spotify_album_art_url ?? '').trim();
            const trackName = (b.spotify_track_name ?? '').trim() || 'Song';
            const artistName = (b.spotify_artist_name ?? '').trim() || 'Artist';
            const previewUrl = (b.spotify_preview_url ?? '').trim();
            const tid = (b.spotify_track_id ?? '').trim();
            const openSpotifyUrl = tid ? `https://open.spotify.com/track/${tid}` : null;
            const memType = ((b.soundtrack_message_type ?? 'text') || 'text').toLowerCase();
            const mediaUrl = mediaUrls[b.id];
            const mediaErr = mediaUrlErrors[b.id];
            const expanded = expandedId === b.id;
            const isPlayingPreview = playingPreviewId === b.id;

            return (
              <li
                key={b.id}
                className={`${styles.soundtrackListItem} ${
                  index < keptSoundtracks.length - 1 ? styles.soundtrackListItemWithRule : ''
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className={styles.soundtrackRowTop}
                  onClick={() => toggleRow(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleRow(b.id);
                    }
                  }}
                >
                  <div className={styles.soundtrackRowArtWrap}>
                    {artUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={artUrl} alt="" className={styles.soundtrackRowArt} width={56} height={56} />
                    ) : (
                      <div className={styles.soundtrackRowArtFallback} aria-hidden />
                    )}
                  </div>
                  <div className={styles.soundtrackRowText}>
                    <div className={styles.soundtrackRowTitle}>{trackName}</div>
                    <div className={styles.soundtrackRowArtist}>{artistName}</div>
                    <div className={styles.soundtrackRowBy}>
                      Dedicated by {guestLabel(b.guest_name)}
                    </div>
                  </div>
                  <div className={styles.soundtrackRowActions} onClick={(e) => e.stopPropagation()}>
                    {previewUrl ? (
                      <button
                        type="button"
                        className={styles.soundtrackRowPlay}
                        aria-label={isPlayingPreview ? 'Pause preview' : 'Play 30 second preview'}
                        onClick={() => void togglePreview(b)}
                      >
                        <span
                          className={
                            isPlayingPreview
                              ? styles.soundtrackRowPlayPause
                              : styles.soundtrackRowPlayTri
                          }
                          aria-hidden
                        />
                      </button>
                    ) : openSpotifyUrl ? (
                      <a
                        className={styles.soundtrackRowSpotifyLink}
                        href={openSpotifyUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Spotify →
                      </a>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div className={styles.soundtrackMemory}>
                    <p className={styles.soundtrackMemoryPrompt}>{SOUNDTRACK_PROMPT}</p>
                    {mediaErr ? (
                      <p className={styles.mediaErrorHint}>{friendlyBlirtStorageError(mediaErr)}</p>
                    ) : memType === 'text' ? (
                      <div className={styles.soundtrackMemoryText}>{b.content}</div>
                    ) : memType === 'audio' ? (
                      mediaUrl ? (
                        <audio src={mediaUrl} controls className={styles.soundtrackMemoryAudio} />
                      ) : (
                        <p className={styles.muted}>Loading…</p>
                      )
                    ) : memType === 'video' ? (
                      mediaUrl ? (
                        <VideoFit src={mediaUrl} variant="guest" />
                      ) : (
                        <p className={styles.muted}>Loading…</p>
                      )
                    ) : (
                      <p className={styles.muted}>—</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canCopyPlaylist ? (
        <button type="button" className={styles.soundtrackCopyBtn} onClick={() => void copyPlaylist()}>
          🎵 Copy playlist to clipboard
        </button>
      ) : null}

      {copyToast ? (
        <div className={styles.soundtrackToast} role="status">
          Copied! Open Spotify and create a new playlist 🎵
        </div>
      ) : null}
    </div>
  );
}

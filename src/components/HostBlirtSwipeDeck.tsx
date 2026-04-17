'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import styles from '../app/host/host.module.css';
import { friendlyBlirtStorageError } from '../lib/blirtsStoragePath';
import HostSoundtrackInboxPlayback from './HostSoundtrackInboxPlayback';
import { getProxiedDeezerPreviewUrl, SONG_DEDICATION_PLACEHOLDER_ART } from '../lib/songDedication';

/** Matches host event Blirt row shape so callbacks stay type-safe with Supabase helpers. */
export type SwipeBlirt = {
  id: string;
  event_id: string;
  type: string;
  content: string;
  status: string | null;
  created_at: string | null;
  guest_name: string | null;
  prompt_snapshot?: string | null;
  soundtrack_message_type?: 'video' | 'audio' | 'text' | null;
  spotify_track_id?: string | null;
  spotify_track_name?: string | null;
  spotify_artist_name?: string | null;
  spotify_album_name?: string | null;
  spotify_album_art_url?: string | null;
  spotify_preview_url?: string | null;
};

const SWIPE_THRESHOLD_PX = 100;
const CHARTREUSE = '#B5CC2E';
const CREAM = '#FAF8F4';
const DARK = '#1a1a1a';
const SOUNDTRACK_PROMPT = 'This song reminds me of you because...';

type Props = {
  blirts: SwipeBlirt[];
  mediaUrls: Record<string, string>;
  mediaUrlErrors: Record<string, string>;
  busyId: string | null;
  onKeep: (b: SwipeBlirt) => Promise<boolean>;
  onDelete: (b: SwipeBlirt) => Promise<void>;
  onBackToEnvelopes: () => void;
};

function formatWhen(iso: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function PeekCard({ blirt }: { blirt: SwipeBlirt }) {
  const guest = (blirt.guest_name ?? '').trim() || 'A friend';
  const t = (blirt.type || '').toLowerCase();
  return (
    <div className={styles.swipePeekCard} aria-hidden>
      <div className={styles.swipePeekType}>{t}</div>
      <div className={styles.swipePeekGuest}>{guest}</div>
    </div>
  );
}

function SwipeVideoCard({
  blirt,
  url,
  err,
  guest,
  promptLine,
  onSkip,
}: {
  blirt: SwipeBlirt;
  url: string | undefined;
  err: string | undefined;
  guest: string;
  promptLine: string;
  onSkip: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [needsTapUnmute, setNeedsTapUnmute] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !url) return;
    el.volume = 1.0;
    el.muted = muted;
    setNeedsTapUnmute(false);
    void el.play().catch(async () => {
      // Try muted autoplay, then ask user to unmute.
      try {
        setMuted(true);
        el.muted = true;
        await el.play();
        setNeedsTapUnmute(true);
      } catch {
        setNeedsTapUnmute(true);
      }
    });
  }, [url, muted, blirt.id]);

  return (
    <div className={styles.swipeMediaCard}>
      <div className={styles.swipeVideoShell}>
        {err ? (
          <p className={styles.swipeMediaErr}>{friendlyBlirtStorageError(err)}</p>
        ) : url ? (
          <video
            ref={videoRef}
            className={styles.swipeVideo}
            src={url}
            playsInline
            autoPlay
            loop
          />
        ) : (
          <p className={styles.swipeMediaErr}>Loading…</p>
        )}
        <div className={styles.swipeVideoOverlay}>
          <div className={styles.swipeVideoOverlayTop}>
            <button
              type="button"
              className={styles.swipeCloseBtn}
              onClick={(e) => {
                e.stopPropagation();
                onSkip();
              }}
              aria-label="Skip"
            >
              ×
            </button>
            <button
              type="button"
              className={styles.swipeUnmute}
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
          <div className={styles.swipeVideoOverlayBottom}>
            {promptLine ? <p className={styles.swipeOverlayPrompt}>{promptLine}</p> : null}
            <p className={styles.swipeOverlayGuest}>{guest}</p>
          </div>
        </div>
        {needsTapUnmute ? (
          <button
            type="button"
            className={styles.swipeTapUnmutePill}
            onClick={(e) => {
              e.stopPropagation();
              const el = videoRef.current;
              if (el) {
                el.muted = false;
                el.volume = 1.0;
                void el.play().catch(() => {});
              }
              setMuted(false);
              setNeedsTapUnmute(false);
            }}
          >
            Tap to unmute 🔊
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SwipeAudioCard({
  blirt,
  url,
  err,
  guest,
  promptLine,
  onSkip,
}: {
  blirt: SwipeBlirt;
  url: string | undefined;
  err: string | undefined;
  guest: string;
  promptLine: string;
  onSkip: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsTapUnmute, setNeedsTapUnmute] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !url) return;
    el.volume = 1.0;
    el.muted = false;
    setNeedsTapUnmute(false);
    void el.play().catch(() => {
      setNeedsTapUnmute(true);
    });
  }, [url, blirt.id]);

  return (
    <div className={styles.swipeAudioCard} style={{ background: CREAM }}>
      <button
        type="button"
        className={styles.swipeCloseBtn}
        onClick={(e) => {
          e.stopPropagation();
          onSkip();
        }}
        aria-label="Skip"
      >
        ×
      </button>
      {promptLine ? (
        <p className={styles.swipeAudioPrompt}>{promptLine}</p>
      ) : null}
      <p className={styles.swipeAudioGuest}>{guest}</p>
      {err ? (
        <p className={styles.swipeMediaErr}>{friendlyBlirtStorageError(err)}</p>
      ) : url ? (
        <audio ref={audioRef} className={styles.swipeAudio} src={url} controls playsInline />
      ) : (
        <p className={styles.swipeMediaErr}>Loading…</p>
      )}
      {needsTapUnmute ? (
        <button
          type="button"
          className={styles.swipeTapUnmutePill}
          onClick={(e) => {
            e.stopPropagation();
            const el = audioRef.current;
            if (el) {
              el.muted = false;
              el.volume = 1.0;
              void el.play().catch(() => {});
            }
            setNeedsTapUnmute(false);
          }}
        >
          Tap to unmute 🔊
        </button>
      ) : null}
    </div>
  );
}

function SwipeTextCard({
  blirt,
  guest,
  promptLine,
  onSkip,
}: {
  blirt: SwipeBlirt;
  guest: string;
  promptLine: string;
  onSkip: () => void;
}) {
  const when = formatWhen(blirt.created_at);
  return (
    <div className={styles.swipeTextCard} style={{ background: CREAM, color: DARK }}>
      <button
        type="button"
        className={styles.swipeCloseBtn}
        onClick={(e) => {
          e.stopPropagation();
          onSkip();
        }}
        aria-label="Skip"
      >
        ×
      </button>
      {promptLine ? (
        <p className={styles.swipeTextPromptTop}>{promptLine}</p>
      ) : null}
      <p className={styles.swipeTextBody}>{blirt.content}</p>
      <div className={styles.swipeTextFooter}>
        <span>{guest}</span>
        {when ? <span className={styles.swipeTextDate}>{when}</span> : null}
      </div>
    </div>
  );
}

function SwipeSoundtrackCard({
  blirt,
  mediaUrl,
  mediaErr,
  onActionsReady,
  onSkip,
}: {
  blirt: SwipeBlirt;
  mediaUrl: string | undefined;
  mediaErr: string | undefined;
  onActionsReady: (ready: boolean) => void;
  onSkip: () => void;
}) {
  const [deezerPreviewUrl, setDeezerPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  const trackName = (blirt.spotify_track_name ?? '').trim() || 'Song';
  const artistName = (blirt.spotify_artist_name ?? '').trim() || 'Artist';
  const artUrl = (blirt.spotify_album_art_url ?? '').trim();
  const guestName = (blirt.guest_name ?? '').trim() || 'a friend';
  const memType = ((blirt.soundtrack_message_type ?? 'text') || 'text').toLowerCase();
  const spotifyTrackId = (blirt.spotify_track_id ?? '').trim();
  const openSpotifyUrl = spotifyTrackId
    ? `https://open.spotify.com/track/${spotifyTrackId}`
    : `https://open.spotify.com/search/${encodeURIComponent(`${trackName} ${artistName}`)}`;

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setDeezerPreviewUrl(null);
    void getProxiedDeezerPreviewUrl(trackName, artistName).then((url) => {
      if (!cancelled) {
        setDeezerPreviewUrl(url);
        setPreviewLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [blirt.id, trackName, artistName]);

  useEffect(() => {
    onActionsReady(false);
  }, [blirt.id, onActionsReady]);

  return (
    <div className={styles.swipeSoundtrackCard}>
      {artUrl ? (
        <>
          <div
            className={styles.swipeSoundtrackBg}
            style={{ backgroundImage: `url(${artUrl})` }}
            aria-hidden
          />
          <div className={styles.swipeSoundtrackBgOverlay} aria-hidden />
        </>
      ) : (
        <>
          <div className={styles.swipeSoundtrackBgFallback} aria-hidden />
          <div className={styles.swipeSoundtrackBgOverlay} aria-hidden />
        </>
      )}

      <div className={styles.swipeSoundtrackTopRow}>
        <div className={styles.swipeSoundtrackType} aria-label="Soundtrack Blirt">
          🎵
        </div>
        <div className={styles.swipeSoundtrackTopRight}>
          <button
            type="button"
            className={styles.swipeCloseBtn}
            onClick={(e) => {
              e.stopPropagation();
              onSkip();
            }}
            aria-label="Skip"
          >
            ×
          </button>
        </div>
      </div>

      <div className={styles.swipeSoundtrackInner}>
        <p className={styles.swipeOverlayPrompt}>{SOUNDTRACK_PROMPT}</p>
        <div className={styles.swipeSoundtrackDedicatedBy}>
          Dedicated by <span>{guestName}</span>
        </div>

        <div className={styles.swipeSoundtrackPlaybackRegion}>
          {mediaErr ? (
            <div className={styles.swipeSoundtrackMemoryErr}>{friendlyBlirtStorageError(mediaErr)}</div>
          ) : memType === 'text' ? (
            <HostSoundtrackInboxPlayback
              key={blirt.id}
              mode="text"
              textContent={blirt.content}
              previewUrl={deezerPreviewUrl}
              previewLoading={previewLoading}
              albumArtUrl={artUrl || SONG_DEDICATION_PLACEHOLDER_ART}
              title={trackName}
              artist={artistName}
              spotifyUrl={openSpotifyUrl}
              variant="swipe"
              onSwipeReady={() => onActionsReady(true)}
            />
          ) : memType === 'video' && mediaUrl ? (
            <HostSoundtrackInboxPlayback
              key={blirt.id}
              mode="video"
              videoSrc={mediaUrl}
              previewUrl={deezerPreviewUrl}
              previewLoading={previewLoading}
              albumArtUrl={artUrl || SONG_DEDICATION_PLACEHOLDER_ART}
              title={trackName}
              artist={artistName}
              spotifyUrl={openSpotifyUrl}
              variant="swipe"
              onSwipeReady={() => onActionsReady(true)}
            />
          ) : memType === 'audio' && mediaUrl ? (
            <HostSoundtrackInboxPlayback
              key={blirt.id}
              mode="audio"
              guestAudioSrc={mediaUrl}
              previewUrl={deezerPreviewUrl}
              previewLoading={previewLoading}
              albumArtUrl={artUrl || SONG_DEDICATION_PLACEHOLDER_ART}
              title={trackName}
              artist={artistName}
              spotifyUrl={openSpotifyUrl}
              variant="swipe"
              onSwipeReady={() => onActionsReady(true)}
            />
          ) : (
            <div className={styles.swipeSoundtrackMemoryErr}>Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardFace({
  blirt,
  mediaUrls,
  mediaUrlErrors,
  onActionsReady,
  onSkip,
}: {
  blirt: SwipeBlirt;
  mediaUrls: Record<string, string>;
  mediaUrlErrors: Record<string, string>;
  onActionsReady: (ready: boolean) => void;
  onSkip: () => void;
}) {
  const t = (blirt.type || '').toLowerCase();
  const guest = (blirt.guest_name ?? '').trim() ? `From: ${(blirt.guest_name ?? '').trim()}` : 'From: a friend';
  const promptLine =
    t === 'soundtrack'
      ? SOUNDTRACK_PROMPT
      : (blirt.prompt_snapshot ?? '').trim();
  const url = mediaUrls[blirt.id];
  const err = mediaUrlErrors[blirt.id];

  useEffect(() => {
    if (t !== 'soundtrack') onActionsReady(true);
  }, [t, blirt.id, onActionsReady]);

  if (t === 'video') {
    return (
      <SwipeVideoCard blirt={blirt} url={url} err={err} guest={guest} promptLine={promptLine} onSkip={onSkip} />
    );
  }
  if (t === 'audio') {
    return (
      <SwipeAudioCard blirt={blirt} url={url} err={err} guest={guest} promptLine={promptLine} onSkip={onSkip} />
    );
  }
  if (t === 'soundtrack') {
    return (
      <SwipeSoundtrackCard
        blirt={blirt}
        mediaUrl={url}
        mediaErr={err}
        onActionsReady={onActionsReady}
        onSkip={onSkip}
      />
    );
  }
  return <SwipeTextCard blirt={blirt} guest={guest} promptLine={promptLine} onSkip={onSkip} />;
}

function DraggableTopCard({
  blirt,
  mediaUrls,
  mediaUrlErrors,
  disabled,
  onReleaseKeep,
  onReleaseDelete,
  onActionsReady,
  onSkip,
}: {
  blirt: SwipeBlirt;
  mediaUrls: Record<string, string>;
  mediaUrlErrors: Record<string, string>;
  disabled: boolean;
  onReleaseKeep: () => Promise<void>;
  onReleaseDelete: () => Promise<void>;
  onActionsReady: (ready: boolean) => void;
  onSkip: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-11, 11]);
  const keepOpacity = useTransform(x, [0, 140], [0, 1]);
  const deleteOpacity = useTransform(x, [-140, 0], [1, 0]);

  const st = (blirt.status ?? '').toLowerCase();
  const alreadyKept = st === 'kept';

  const runExit = useCallback(
    async (direction: 1 | -1) => {
      const target = direction * 520;
      await animate(x, target, { type: 'spring', stiffness: 420, damping: 38 });
      if (direction === 1) await onReleaseKeep();
      else await onReleaseDelete();
      x.set(0);
    },
    [onReleaseDelete, onReleaseKeep, x],
  );

  const runSkipExit = useCallback(async () => {
    const target = 520;
    await animate(x, target, { type: 'spring', stiffness: 420, damping: 38 });
    onSkip();
    x.set(0);
  }, [onSkip, x]);

  const onDragEnd = useCallback(
    async (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
      if (disabled) return;
      const dx = info.offset.x;
      const vx = info.velocity.x;
      const goRight = dx > SWIPE_THRESHOLD_PX || vx > 450;
      const goLeft = dx < -SWIPE_THRESHOLD_PX || vx < -450;

      if (goRight && !goLeft) {
        if (alreadyKept) {
          await runExit(1);
          return;
        }
        await runExit(1);
        return;
      }
      if (goLeft && !goRight) {
        if (!window.confirm('Delete this Blirt permanently?')) {
          await animate(x, 0, { type: 'spring', stiffness: 420, damping: 38 });
          return;
        }
        await runExit(-1);
        return;
      }
      await animate(x, 0, { type: 'spring', stiffness: 420, damping: 38 });
    },
    [alreadyKept, disabled, runExit, x],
  );

  return (
    <motion.div
      className={styles.swipeTopCard}
      style={{ x, rotate }}
      drag={disabled ? false : 'x'}
      dragElastic={0.65}
      dragConstraints={{ left: -280, right: 280 }}
      onDragEnd={onDragEnd}
    >
      <motion.div className={styles.swipeBadgeKeep} style={{ opacity: keepOpacity }} aria-hidden>
        KEEP 💛
      </motion.div>
      <motion.div className={styles.swipeBadgeDelete} style={{ opacity: deleteOpacity }} aria-hidden>
        DELETE
      </motion.div>
      {alreadyKept ? (
        <div className={styles.swipeKeptRibbon} role="status">
          Kept
        </div>
      ) : null}
      <CardFace
        blirt={blirt}
        mediaUrls={mediaUrls}
        mediaUrlErrors={mediaUrlErrors}
        onActionsReady={onActionsReady}
        onSkip={() => void runSkipExit()}
      />
    </motion.div>
  );
}

export function HostBlirtSwipeDeck({
  blirts,
  mediaUrls,
  mediaUrlErrors,
  busyId,
  onKeep,
  onDelete,
  onBackToEnvelopes,
}: Props) {
  const [index, setIndex] = useState(0);
  const confettiFiredRef = useRef(false);
  const prevBlirtsLenRef = useRef(blirts.length);
  const [actionsReady, setActionsReady] = useState(true);

  /** Only clamp index when the list shrinks (e.g. delete) — not when status updates after keep. */
  useEffect(() => {
    const len = blirts.length;
    const prev = prevBlirtsLenRef.current;
    prevBlirtsLenRef.current = len;
    if (len < prev) {
      setIndex((i) => Math.min(i, Math.max(0, len - 1)));
    }
  }, [blirts.length]);

  const current = blirts[index] ?? null;
  const next = blirts[index + 1] ?? null;
  const total = blirts.length;
  const currentType = useMemo(() => (current?.type || '').toLowerCase(), [current?.type]);

  useEffect(() => {
    if (currentType === 'soundtrack') setActionsReady(false);
    else setActionsReady(true);
  }, [currentType, current?.id]);

  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;
  /** Finished reviewing every Blirt in the stack (keep on last advances index past end). */
  const finishedAll = total > 0 && index >= total;

  useEffect(() => {
    if (!finishedAll) {
      confettiFiredRef.current = false;
      return;
    }
    if (confettiFiredRef.current) return;
    confettiFiredRef.current = true;
    void confetti({
      particleCount: 90,
      spread: 58,
      startVelocity: 28,
      origin: { y: 0.62 },
      colors: [CHARTREUSE, CREAM, '#c8d94a', '#e8e4dc'],
    });
  }, [finishedAll]);

  const handleKeepSwipe = useCallback(async () => {
    if (!current) return;
    const st = (current.status ?? '').toLowerCase();
    if (st === 'kept') {
      setIndex((i) => i + 1);
      return;
    }
    const ok = await onKeep(current);
    if (ok) setIndex((i) => i + 1);
  }, [current, onKeep]);

  const handleDeleteSwipe = useCallback(async () => {
    if (!current) return;
    await onDelete(current);
  }, [current, onDelete]);

  const busy = busyId !== null;
  const actionsDisabled = busy || !actionsReady;

  const onSkipCurrent = useCallback(() => {
    setIndex((i) => i + 1);
  }, []);

  const onKeepButton = useCallback(async () => {
    if (!current || actionsDisabled) return;
    const st = (current.status ?? '').toLowerCase();
    if (st === 'kept') {
      setIndex((i) => i + 1);
      return;
    }
    const ok = await onKeep(current);
    if (ok) setIndex((i) => i + 1);
  }, [actionsDisabled, current, onKeep]);

  const onDeleteButton = useCallback(async () => {
    if (!current || actionsDisabled) return;
    if (!window.confirm('Delete this Blirt permanently?')) return;
    await onDelete(current);
  }, [actionsDisabled, current, onDelete]);

  if (total === 0) {
    return (
      <div className={styles.swipeEmpty}>
        <p className={styles.muted}>Nothing to swipe yet — share your guest link.</p>
      </div>
    );
  }

  if (finishedAll) {
    return (
      <div className={styles.swipeDone}>
        <p className={styles.swipeDoneTitle}>You&apos;ve seen all your Blirts! 🎉</p>
        <button type="button" className={styles.swipeBackButton} onClick={onBackToEnvelopes}>
          Back to envelope inbox
        </button>
      </div>
    );
  }

  return (
    <div className={styles.swipeDeck}>
      <div className={styles.swipeProgressTrack} aria-hidden>
        <div className={styles.swipeProgressFill} style={{ width: `${progress}%` }} />
      </div>
      <p className={styles.swipeCounter} aria-live="polite">
        {index + 1} of {total} Blirts
      </p>

      <div className={styles.swipeStack}>
        {next ? (
          <div className={styles.swipePeekWrap}>
            <PeekCard blirt={next} />
          </div>
        ) : null}
        {current ? (
          <DraggableTopCard
            key={current.id}
            blirt={current}
            mediaUrls={mediaUrls}
            mediaUrlErrors={mediaUrlErrors}
            disabled={actionsDisabled}
            onReleaseKeep={handleKeepSwipe}
            onReleaseDelete={handleDeleteSwipe}
            onActionsReady={setActionsReady}
            onSkip={onSkipCurrent}
          />
        ) : null}
      </div>

      <div className={styles.swipeActions}>
        <button
          type="button"
          className={styles.swipeBtnDelete}
          onClick={() => void onDeleteButton()}
          disabled={actionsDisabled}
        >
          Delete
        </button>
        <button
          type="button"
          className={styles.swipeBtnKeep}
          onClick={() => void onKeepButton()}
          disabled={actionsDisabled}
        >
          Keep 💛
        </button>
      </div>
    </div>
  );
}

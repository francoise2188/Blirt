'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoFit } from './VideoFit';
import styles from './HostSoundtrackInboxPlayback.module.css';

type Phase = 'idle' | 'intro' | 'message';

type Props = {
  mode: 'video' | 'audio' | 'text';
  videoSrc?: string;
  guestAudioSrc?: string;
  previewUrl: string | null;
  previewLoading: boolean;
  albumArtUrl: string;
  title: string;
  artist: string;
  spotifyUrl: string;
  /** Soundtrack text blirt body */
  textContent?: string;
  /** Swipe deck: called when the guest message has been heard/seen enough to allow Keep/Delete. */
  onSwipeReady?: () => void;
  /** Tighter host inbox vs swipe deck — swipe needs more room so overlays do not overlap sibling UI. */
  variant?: 'default' | 'swipe';
};

const INTRO_MS = 10_000;
const FADE_OUT_MS = 800;
const HANDOFF_MS = 400;

export default function HostSoundtrackInboxPlayback({
  mode,
  videoSrc,
  guestAudioSrc,
  previewUrl,
  previewLoading,
  albumArtUrl,
  title,
  artist,
  spotifyUrl,
  textContent = '',
  onSwipeReady,
  variant = 'default',
}: Props) {
  const swipe = variant === 'swipe';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const guestAudioRef = useRef<HTMLAudioElement | null>(null);
  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const textBlockRef = useRef<HTMLDivElement | null>(null);
  const swipeReadyFiredRef = useRef(false);
  const fadeOutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeInIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<Phase>(() => (mode === 'text' ? 'message' : 'idle'));
  const [guestMediaPaused, setGuestMediaPaused] = useState(true);

  const fireSwipeReadyOnce = useCallback(() => {
    if (!onSwipeReady || swipeReadyFiredRef.current) return;
    swipeReadyFiredRef.current = true;
    onSwipeReady();
  }, [onSwipeReady]);

  const clearFadeOut = () => {
    if (fadeOutIntervalRef.current) {
      clearInterval(fadeOutIntervalRef.current);
      fadeOutIntervalRef.current = null;
    }
  };

  const clearFadeIn = () => {
    if (fadeInIntervalRef.current) {
      clearInterval(fadeInIntervalRef.current);
      fadeInIntervalRef.current = null;
    }
  };

  const fadeOut = (audio: HTMLAudioElement, duration = FADE_OUT_MS) => {
    clearFadeOut();
    const steps = 20;
    const stepTime = duration / steps;
    const volumeStep = audio.volume / steps;
    let currentStep = 0;

    fadeOutIntervalRef.current = setInterval(() => {
      if (currentStep >= steps) {
        audio.volume = 0;
        audio.pause();
        audio.volume = 1;
        clearFadeOut();
      } else {
        audio.volume = Math.max(0, Math.min(1, audio.volume - volumeStep));
        currentStep++;
      }
    }, stepTime);
  };

  const resetGuestMedia = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        v.currentTime = 0;
        v.muted = false;
      } catch {
        return;
      }
    }
    const a = guestAudioRef.current;
    if (a) {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {
        return;
      }
    }
  }, []);

  const startGuestMessage = useCallback(() => {
    if (mode === 'video') {
      const v = videoRef.current;
      if (!v) return;
      try {
        v.muted = false;
        v.currentTime = 0;
      } catch {
        return;
      }
      void v.play().catch(() => {});
    } else if (mode === 'audio') {
      const a = guestAudioRef.current;
      if (!a) return;
      try {
        a.currentTime = 0;
      } catch {
        return;
      }
      void a.play().catch(() => {});
    } else {
      textBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [mode]);

  const finishIntro = useCallback(() => {
    setPhase('message');
    startGuestMessage();
  }, [startGuestMessage]);

  const runIntroThenMessage = useCallback(() => {
    resetGuestMedia();
    const intro = introAudioRef.current;
    if (!previewUrl || !intro) {
      setPhase('message');
      startGuestMessage();
      return;
    }

    setPhase('intro');
    intro.volume = 0;
    void intro.play().catch(() => {});

    clearFadeIn();
    let vol = 0;
    fadeInIntervalRef.current = setInterval(() => {
      if (vol >= 1) {
        clearFadeIn();
        return;
      }
      vol = Math.min(vol + 0.05, 1);
      intro.volume = Math.max(0, Math.min(1, vol));
    }, 30);

    window.setTimeout(() => {
      fadeOut(intro, FADE_OUT_MS);
      window.setTimeout(() => {
        if (mode === 'text') {
          setPhase('message');
          textBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          finishIntro();
        }
      }, HANDOFF_MS);
    }, INTRO_MS);
  }, [previewUrl, resetGuestMedia, finishIntro, mode]);

  const handlePlay = () => {
    if (phase === 'intro' || previewLoading) return;
    if (!previewUrl) {
      setPhase('message');
      startGuestMessage();
      return;
    }
    runIntroThenMessage();
  };

  useEffect(() => {
    swipeReadyFiredRef.current = false;
  }, [videoSrc, guestAudioSrc, textContent, mode]);

  /** Text soundtrack: message is readable immediately — enable Keep/Delete after a short read window (no song required). */
  useEffect(() => {
    if (!onSwipeReady || mode !== 'text') return;
    const t = window.setTimeout(() => fireSwipeReadyOnce(), 1800);
    return () => clearTimeout(t);
  }, [mode, onSwipeReady, fireSwipeReadyOnce, textContent]);

  useEffect(() => {
    if (!onSwipeReady || phase !== 'message') return;
    if (mode !== 'video' && mode !== 'audio') return;
    const el = mode === 'video' ? videoRef.current : guestAudioRef.current;
    if (!el) return;
    const onEnded = () => fireSwipeReadyOnce();
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, [phase, mode, onSwipeReady, fireSwipeReadyOnce, videoSrc, guestAudioSrc]);

  useEffect(() => {
    if (phase !== 'message') return;
    if (mode === 'video') {
      const v = videoRef.current;
      if (!v) return;
      const sync = () => setGuestMediaPaused(v.paused);
      v.addEventListener('play', sync);
      v.addEventListener('pause', sync);
      sync();
      return () => {
        v.removeEventListener('play', sync);
        v.removeEventListener('pause', sync);
      };
    }
    if (mode === 'audio') {
      const a = guestAudioRef.current;
      if (!a) return;
      const sync = () => setGuestMediaPaused(a.paused);
      a.addEventListener('play', sync);
      a.addEventListener('pause', sync);
      sync();
      return () => {
        a.removeEventListener('play', sync);
        a.removeEventListener('pause', sync);
      };
    }
    return;
  }, [phase, mode, videoSrc, guestAudioSrc]);

  const showOverlay = phase !== 'message';
  const shellClass = `${styles.shell}${swipe ? ` ${styles.shellSwipe}` : ''}`;
  const mediaWrapClass = `${styles.mediaWrap}${swipe ? ` ${styles.mediaWrapSwipe}` : ''}`;
  const overlayClass = `${styles.overlay}${swipe ? ` ${styles.overlaySwipe}` : ''}`;
  const overlayCardClass = (base: string) => `${base}${swipe ? ` ${styles.overlayCardSwipe}` : ''}`;
  const textShellClass = `${styles.textShell} ${styles.textShellTextMode}${swipe ? ` ${styles.textShellTextSwipe}` : ''}`;

  const buttonLabel = previewLoading
    ? 'Loading…'
    : phase === 'intro'
      ? 'Song intro…'
      : previewUrl
        ? '▶ Play song + message'
        : '▶ Play message';

  const shell = (
    <>
      <audio ref={introAudioRef} src={previewUrl ?? undefined} preload="auto" />
      <div className={shellClass}>
        {mode === 'video' && videoSrc ? (
          <>
            <div className={mediaWrapClass}>
              <VideoFit
                src={videoSrc}
                variant="modal"
                videoRef={videoRef}
                controls={phase === 'message'}
              />
              {showOverlay ? (
                <div className={overlayClass} aria-hidden={false}>
                  <div className={overlayCardClass(styles.overlayCard)}>
                    <img src={albumArtUrl} alt="" className={styles.art} />
                    <div className={styles.meta}>
                      <div className={styles.trackTitle}>{title}</div>
                      <div className={styles.trackArtist}>{artist}</div>
                    </div>
                    <button
                      type="button"
                      className={styles.playBtn}
                      onClick={handlePlay}
                      disabled={previewLoading || phase === 'intro'}
                    >
                      {buttonLabel}
                    </button>
                    <a
                      className={styles.spotify}
                      href={spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Listen on Spotify
                    </a>
                    <p className={styles.hint}>
                      One playback: song clip first (fades in/out), then their message.
                    </p>
                  </div>
                </div>
              ) : null}
              {phase === 'message' && mode === 'video' ? (
                <div className={styles.messageBar}>
                  <button
                    type="button"
                    className={styles.messageBarBtn}
                    onClick={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      if (v.paused) void v.play();
                      else v.pause();
                    }}
                  >
                    {guestMediaPaused ? 'Play' : 'Pause'}
                  </button>
                  <span className={styles.messageBarHint}>or use the video controls</span>
                </div>
              ) : null}
            </div>
          </>
        ) : mode === 'audio' && guestAudioSrc ? (
          <div className={mediaWrapClass}>
            <audio
              ref={guestAudioRef}
              src={guestAudioSrc}
              preload="metadata"
              className={styles.guestAudio}
              controls={phase === 'message'}
            />
            {showOverlay ? (
              <div className={overlayClass}>
                <div className={overlayCardClass(styles.overlayCard)}>
                  <img src={albumArtUrl} alt="" className={styles.art} />
                  <div className={styles.meta}>
                    <div className={styles.trackTitle}>{title}</div>
                    <div className={styles.trackArtist}>{artist}</div>
                  </div>
                  <button
                    type="button"
                    className={styles.playBtn}
                    onClick={handlePlay}
                    disabled={previewLoading || phase === 'intro'}
                  >
                    {buttonLabel}
                  </button>
                  <a
                    className={styles.spotify}
                    href={spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Listen on Spotify
                  </a>
                  <p className={styles.hint}>Song intro, then their voice note.</p>
                </div>
              </div>
            ) : null}
            {phase === 'message' && mode === 'audio' ? (
              <div className={styles.messageBar}>
                <button
                  type="button"
                  className={styles.messageBarBtn}
                  onClick={() => {
                    const a = guestAudioRef.current;
                    if (!a) return;
                    if (a.paused) void a.play();
                    else a.pause();
                  }}
                >
                  {guestMediaPaused ? 'Play' : 'Pause'}
                </button>
                <span className={styles.messageBarHint}>or use the audio controls</span>
              </div>
            ) : null}
          </div>
        ) : mode === 'text' ? (
          <div className={textShellClass}>
            <div className={`${styles.textSongRow} ${swipe ? styles.textSongRowSwipe : ''}`}>
              <img src={albumArtUrl} alt="" className={styles.textSongArt} />
              <div className={styles.textSongMeta}>
                <div className={styles.textSongTitle}>{title}</div>
                <div className={styles.textSongArtist}>{artist}</div>
              </div>
              <div className={styles.textSongActions}>
                {previewUrl ? (
                  <button
                    type="button"
                    className={styles.textSongPlayBtn}
                    onClick={handlePlay}
                    disabled={previewLoading || phase === 'intro'}
                  >
                    {previewLoading
                      ? 'Loading…'
                      : phase === 'intro'
                        ? 'Playing…'
                        : '▶ Play song clip'}
                  </button>
                ) : null}
                <a
                  className={styles.spotify}
                  href={spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Spotify
                </a>
              </div>
            </div>
            <p className={styles.textSongHint}>Read the message anytime — the song is optional.</p>
            <div
              ref={textBlockRef}
              className={styles.textBody}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {textContent}
            </div>
          </div>
        ) : (
          <p className={styles.fallback}>No media.</p>
        )}
        {swipe && phase === 'message' && mode !== 'text' ? (
          <div className={styles.swipeSpotifyFooter}>
            <a className={styles.spotify} href={spotifyUrl} target="_blank" rel="noopener noreferrer">
              Open in Spotify
            </a>
          </div>
        ) : null}
      </div>
    </>
  );

  return shell;
}

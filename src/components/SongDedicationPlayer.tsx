'use client';

import { useRef, useState } from 'react';
import styles from './SongDedicationPlayer.module.css';

export type SongDedicationPlayerProps = {
  title: string;
  artist: string;
  albumArt: string;
  spotifyUrl: string;
  previewUrl: string | null;
  /** `host` = inbox (recipient hears intro → message). `default` = guest search / generic. */
  variant?: 'default' | 'host';
  /** Pause/reset the message (video/audio) before the intro plays. */
  onPreviewStart?: () => void;
  /** After intro fade — play the guest’s video, voice note, or scroll to text. */
  onFadeComplete?: () => void;
};

export default function SongDedicationPlayer({
  title,
  artist,
  albumArt,
  spotifyUrl,
  previewUrl,
  variant = 'default',
  onPreviewStart,
  onFadeComplete,
}: SongDedicationPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fadeOutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeInIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [previewStarted, setPreviewStarted] = useState(false);

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

  const fadeOut = (audio: HTMLAudioElement, duration = 800) => {
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

  const handlePlayPreview = () => {
    const audio = audioRef.current;
    if (!audio) return;

    onPreviewStart?.();
    setPreviewStarted(true);
    audio.volume = 0;
    void audio.play().catch(() => {});

    clearFadeIn();
    let vol = 0;
    fadeInIntervalRef.current = setInterval(() => {
      if (vol >= 1) {
        clearFadeIn();
        return;
      }
      vol = Math.min(vol + 0.05, 1);
      audio.volume = Math.max(0, Math.min(1, vol));
    }, 30);

    window.setTimeout(() => {
      fadeOut(audio, 800);
      window.setTimeout(() => {
        onFadeComplete?.();
      }, 400);
    }, 10000);
  };

  const handleSkipToVideo = () => {
    const audio = audioRef.current;
    if (audio) {
      clearFadeIn();
      clearFadeOut();
      audio.pause();
      audio.volume = 1;
    }
    onPreviewStart?.();
    onFadeComplete?.();
  };

  const isHost = variant === 'host';
  const playLabel = isHost ? '▶ Play intro → their message' : '▶ Play preview';
  const playingLabel = isHost ? 'Intro playing…' : 'Preview playing…';
  const skipLabel = isHost ? 'Skip to their message' : 'Play my video message';

  return (
    <div className={styles.wrap}>
      <img src={albumArt} alt={title} className={styles.art} />
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <p className={styles.artist}>{artist}</p>
      </div>

      {isHost ? (
        <p className={styles.playbackHint}>
          The song fades in, then fades out — their Blirt message plays next. If the message
          doesn&apos;t start (especially on iPhone), tap play on the video or audio below.
        </p>
      ) : null}

      {previewUrl ? (
        <>
          <audio ref={audioRef} src={previewUrl} preload="auto" />
          <button
            type="button"
            onClick={handlePlayPreview}
            className={styles.playButton}
            disabled={previewStarted}
          >
            {previewStarted ? playingLabel : playLabel}
          </button>
        </>
      ) : (
        <button type="button" onClick={handleSkipToVideo} className={styles.continueButton}>
          {skipLabel}
        </button>
      )}

      <a
        href={spotifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.spotifyLink}
      >
        Listen on Spotify
      </a>
    </div>
  );
}

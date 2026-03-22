'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { supabase } from '../../lib/supabaseClient';
import { submitGuestMediaBlirt } from '../../lib/submitGuestBlirt';
import { GUEST_MAX_PROMPT_SKIPS } from '../../lib/promptLibrary';
import { VideoFit } from '../../components/VideoFit';
import {
  AUDIO_CONSTRAINTS,
  blobToAudioFile,
  blobToVideoFile,
  cameraFailureMessage,
  canUseInPageRecording,
  getCameraStreamPortraitFirst,
  MAX_RECORDING_SECONDS,
  startAudioRecordingFromStream,
  startVideoRecordingFromStream,
  type LiveRecording,
} from '../../lib/guestMediaCapture';

type Mode = 'video' | 'audio' | 'text';

function pickInitialTemplate(pool: string[], useRandom: boolean): string {
  if (!pool.length) return '';
  return useRandom ? pool[Math.floor(Math.random() * pool.length)] : pool[0];
}

/** Pick a different template so skips feel fresh (host may have many prompts). */
function pickNextTemplate(pool: string[], current: string): string {
  if (pool.length <= 1) return current;
  const others = pool.filter((t) => t !== current);
  if (!others.length) return current;
  return others[Math.floor(Math.random() * others.length)];
}

const fallbackDemoCouple = { a: 'Avery', b: 'Jordan' };
const fallbackDemoPrompt = 'Give them one piece of marriage advice';

function formatRecordingClock(elapsedSec: number, maxSeconds: number): string {
  const e = Math.max(0, Math.min(elapsedSec, maxSeconds));
  const em = Math.floor(e / 60);
  const es = e % 60;
  const mm = Math.floor(maxSeconds / 60);
  const ms = maxSeconds % 60;
  return `${em}:${es.toString().padStart(2, '0')} / ${mm}:${ms.toString().padStart(2, '0')}`;
}

function fillPrompt(template: string, partner1: string, partner2: string) {
  const p1 = partner1.trim();
  const p2 = partner2.trim();
  const primaryName = p1 || p2;
  const chosen = p1 && p2 ? (Math.random() < 0.5 ? p1 : p2) : primaryName;
  return template
    .replaceAll('[Name]', primaryName)
    .replaceAll('[name]', chosen)
    .replaceAll('[Partner 1]', p1 || primaryName)
    .replaceAll('[Partner 2]', p2 || primaryName)
    .replaceAll('{partner_1}', p1 || primaryName)
    .replaceAll('{partner_2}', p2 || primaryName)
    .replaceAll('{a}', p1 || primaryName)
    .replaceAll('{b}', p2 || primaryName);
}

export default function GuestPage() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get('event') ?? 'demo';

  const [couple, setCouple] = useState<{
    a: string;
    b: string;
    prompt: string;
    /** Filled optional host greeting, e.g. "Happy birthday, Ashley!" */
    celebrationLine: string | null;
  }>(() =>
    eventId === 'demo'
      ? {
          a: fallbackDemoCouple.a,
          b: fallbackDemoCouple.b,
          prompt: fallbackDemoPrompt,
          celebrationLine: null,
        }
      : {
          a: '',
          b: '',
          prompt: '',
          celebrationLine: null,
        },
  );

  const [loadingEvent, setLoadingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [mode, setMode] = useState<Mode>('video');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [guestName, setGuestName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveRecordingRef = useRef<LiveRecording | null>(null);
  const countdownStreamRef = useRef<MediaStream | null>(null);
  const countdownModeRef = useRef<'video' | 'audio' | null>(null);
  /** Avoid React Strict Mode double-firing the "countdown hit 0" effect. */
  const countdownZeroHandledRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  /** 3 → 2 → 1 → 0 (then recording starts). null = not counting. */
  const [countdown, setCountdown] = useState<number | null>(null);
  /** Camera stream for live preview — must attach after <video> mounts (fixes black box). */
  const [liveStreamForPreview, setLiveStreamForPreview] = useState<MediaStream | null>(null);
  const [recordHint, setRecordHint] = useState<string | null>(null);
  /** Seconds since recording started (for max-length UI). */
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  /** Front vs back lens — only applied when opening / swapping the camera stream. */
  const [videoFacing, setVideoFacing] = useState<'user' | 'environment'>('user');
  const [cameraFlipBusy, setCameraFlipBusy] = useState(false);

  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const hasSecondName = couple.b.trim().length > 0;

  /** Raw templates from host (for swaps). */
  const [promptTemplates, setPromptTemplates] = useState<string[]>([]);
  const [activeTemplate, setActiveTemplate] = useState('');
  const [promptRandomize, setPromptRandomize] = useState(true);
  const [skipCount, setSkipCount] = useState(0);

  const skipsLeft = GUEST_MAX_PROMPT_SKIPS - skipCount;
  const canSwapPrompt =
    eventId !== 'demo' && promptTemplates.length > 1 && skipCount < GUEST_MAX_PROMPT_SKIPS;

  function cancelCountdown() {
    if (countdownStreamRef.current) {
      countdownStreamRef.current.getTracks().forEach((t) => t.stop());
      countdownStreamRef.current = null;
    }
    countdownModeRef.current = null;
    setCountdown(null);
    setLiveStreamForPreview(null);
    setVideoFacing('user');
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    if (eventId !== 'demo') return;
    setCouple({
      a: fallbackDemoCouple.a,
      b: fallbackDemoCouple.b,
      prompt: fallbackDemoPrompt,
      celebrationLine: fillPrompt(
        'Happy birthday, [name]!',
        fallbackDemoCouple.a,
        fallbackDemoCouple.b,
      ),
    });
  }, [eventId]);

  useEffect(() => {
    if (eventId === 'demo') return;
    if (!supabase) {
      setEventError('Supabase is not configured yet (missing env vars).');
      return;
    }
    setLoadingEvent(true);
    setEventError(null);

    (async () => {
      let data:
        | {
            partner_1: string | null;
            partner_2: string | null;
            celebration_message?: string | null;
            prompts: unknown;
            prompt_randomize: boolean | null;
          }
        | null = null;

      const full = await supabase
        .from('events')
        .select('partner_1, partner_2, celebration_message, prompts, prompt_randomize')
        .eq('id', eventId)
        .single();

      if (full.error) {
        const msg = full.error.message ?? '';
        if (/celebration_message|schema cache|column/i.test(msg)) {
          const slim = await supabase
            .from('events')
            .select('partner_1, partner_2, prompts, prompt_randomize')
            .eq('id', eventId)
            .single();
          if (slim.error) {
            setEventError(slim.error.message);
            setLoadingEvent(false);
            return;
          }
          data = { ...slim.data, celebration_message: null };
        } else {
          setEventError(msg);
          setLoadingEvent(false);
          return;
        }
      } else {
        data = full.data;
      }

      if (!data) {
        setLoadingEvent(false);
        return;
      }

      const partner1 = data.partner_1 ?? '';
      const partner2 = data.partner_2 ?? '';
      const rawCelebration = String(data.celebration_message ?? '').trim();
      const celebrationLine = rawCelebration
        ? fillPrompt(rawCelebration, partner1, partner2)
        : null;

      const list = (Array.isArray(data.prompts) ? data.prompts : [])
        .map((p) => String(p).trim())
        .filter(Boolean);
      const useRandom = data.prompt_randomize !== false;
      const initial = pickInitialTemplate(list, useRandom);

      setPromptTemplates(list);
      setPromptRandomize(useRandom);
      setSkipCount(0);
      setActiveTemplate(initial);
      setCouple({
        a: partner1,
        b: partner2,
        prompt: initial ? fillPrompt(initial, partner1, partner2) : fallbackDemoPrompt,
        celebrationLine,
      });
      setLoadingEvent(false);
    })();
  }, [eventId]);

  function handleNewPrompt() {
    if (!canSwapPrompt) return;
    const next = pickNextTemplate(promptTemplates, activeTemplate);
    setActiveTemplate(next);
    setSkipCount((c) => c + 1);
    setCouple((c) => ({
      ...c,
      prompt: fillPrompt(next, c.a, c.b),
    }));
  }

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  useEffect(() => {
    if (!audioFile) {
      setAudioPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  useEffect(() => {
    // Stop any in-progress camera/mic capture when switching modes.
    if (countdownStreamRef.current) {
      countdownStreamRef.current.getTracks().forEach((t) => t.stop());
      countdownStreamRef.current = null;
    }
    countdownModeRef.current = null;
    setCountdown(null);
    const live = liveRecordingRef.current;
    if (live) {
      live.abort();
      liveRecordingRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setIsRecording(false);
    setLiveStreamForPreview(null);
    setRecordHint(null);
    setVideoFacing('user');
    // Clear the previous input.
    setVideoFile(null);
    setAudioFile(null);
    setMessage('');
    setGuestName('');
    setSubmitted(false);
  }, [mode]);

  useEffect(() => {
    return () => {
      const live = liveRecordingRef.current;
      if (live) live.abort();
      liveRecordingRef.current = null;
    };
  }, []);

  /** Live camera preview while counting down or recording. */
  useLayoutEffect(() => {
    if (!liveStreamForPreview) return;
    const needPreview =
      isRecording || (countdown !== null && countdown > 0);
    if (!needPreview) return;
    const el = liveVideoRef.current;
    if (!el) return;
    el.srcObject = liveStreamForPreview;
    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    const play = () => void el.play().catch(() => {});
    play();
    const t = window.setTimeout(play, 80);
    return () => clearTimeout(t);
  }, [liveStreamForPreview, isRecording, countdown]);

  /** 3 → 2 → 1, then 0 triggers recording start. */
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = window.setTimeout(() => {
      setCountdown((c) => (c === null || c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  /** After "1", start MediaRecorder on the stream we already opened. */
  useEffect(() => {
    if (countdown !== 0) {
      countdownZeroHandledRef.current = false;
      return;
    }
    if (countdownZeroHandledRef.current) return;
    countdownZeroHandledRef.current = true;
    const stream = countdownStreamRef.current;
    countdownStreamRef.current = null;
    const kind = countdownModeRef.current;
    countdownModeRef.current = null;
    if (!stream) {
      setCountdown(null);
      return;
    }
    if (kind === 'video') {
      try {
        const live = startVideoRecordingFromStream(stream);
        liveRecordingRef.current = live;
        setIsRecording(true);
        setLiveStreamForPreview(stream);
        setCountdown(null);
      } catch {
        stream.getTracks().forEach((tr) => tr.stop());
        if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
        setLiveStreamForPreview(null);
        setIsRecording(false);
        setCountdown(null);
        setRecordHint(cameraFailureMessage());
      }
      return;
    }
    if (kind === 'audio') {
      try {
        const live = startAudioRecordingFromStream(stream);
        liveRecordingRef.current = live;
        setIsRecording(true);
        setCountdown(null);
      } catch {
        stream.getTracks().forEach((tr) => tr.stop());
        setIsRecording(false);
        setCountdown(null);
        setRecordHint(
          'Could not start voice recording in this browser. Try Safari or Chrome, or use “pick an audio file”.',
        );
      }
      return;
    }
    stream.getTracks().forEach((tr) => tr.stop());
    setCountdown(null);
  }, [countdown]);

  const canSubmit = useMemo(() => {
    if (mode === 'text') return message.trim().length > 0;
    if (mode === 'video') return Boolean(videoFile);
    return Boolean(audioFile);
  }, [audioFile, message, mode, videoFile]);

  const bigButtonLabel = useMemo(() => {
    if (submitted) return 'Sent!';
    if (isSubmitting) {
      return mode === 'text' ? 'Sending…' : 'Uploading…';
    }
    if (mode === 'text') return 'Submit';
    if (countdown !== null) return 'Cancel';
    if (mode === 'video') {
      if (isRecording) return 'Stop';
      return videoFile ? 'Submit' : 'Record';
    }
    if (isRecording) return 'Stop';
    return audioFile ? 'Submit' : 'Record';
  }, [audioFile, countdown, isRecording, isSubmitting, mode, submitted, videoFile]);

  const stopVideoRecording = useCallback(async () => {
    const live = liveRecordingRef.current;
    if (!live) {
      setIsRecording(false);
      return;
    }
    try {
      const blob = await live.stop();
      liveRecordingRef.current = null;
      setLiveStreamForPreview(null);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = null;
      }
      setIsRecording(false);
      if (blob.size < 80) {
        setRecordHint('That clip was too short — try recording a bit longer.');
        return;
      }
      setVideoFile(blobToVideoFile(blob));
      setRecordHint(null);
    } catch {
      liveRecordingRef.current = null;
      setLiveStreamForPreview(null);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = null;
      }
      setIsRecording(false);
      setRecordHint(cameraFailureMessage());
    }
  }, []);

  const stopAudioRecording = useCallback(async () => {
    const live = liveRecordingRef.current;
    if (!live) {
      setIsRecording(false);
      return;
    }
    try {
      const blob = await live.stop();
      liveRecordingRef.current = null;
      setIsRecording(false);
      if (blob.size < 80) {
        setRecordHint('That voice note was too short — try again.');
        return;
      }
      setAudioFile(blobToAudioFile(blob));
      setRecordHint(null);
    } catch (e) {
      liveRecordingRef.current = null;
      setIsRecording(false);
      setRecordHint(
        e instanceof Error ? e.message : 'Could not finish recording. Try again.',
      );
    }
  }, []);

  /** Swap front ↔ back during countdown only (recording is locked to one stream). */
  const flipCameraDuringCountdown = useCallback(async () => {
    if (cameraFlipBusy || isRecording) return;
    if (countdown === null || countdown <= 0) return;
    const next = videoFacing === 'user' ? 'environment' : 'user';
    setCameraFlipBusy(true);
    setRecordHint(null);
    try {
      const stream = await getCameraStreamPortraitFirst(next);
      countdownStreamRef.current?.getTracks().forEach((t) => t.stop());
      countdownStreamRef.current = stream;
      setVideoFacing(next);
      setLiveStreamForPreview(stream);
    } catch {
      setRecordHint(cameraFailureMessage());
    } finally {
      setCameraFlipBusy(false);
    }
  }, [cameraFlipBusy, isRecording, countdown, videoFacing]);

  /** Tick every second while recording; auto-stop at MAX_RECORDING_SECONDS. */
  useEffect(() => {
    if (!isRecording) {
      setRecordingElapsedSec(0);
      return;
    }
    setRecordingElapsedSec(0);
    const tick = window.setInterval(() => {
      setRecordingElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(tick);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    const t = window.setTimeout(() => {
      if (mode === 'video') void stopVideoRecording();
      else if (mode === 'audio') void stopAudioRecording();
    }, MAX_RECORDING_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [isRecording, mode, stopAudioRecording, stopVideoRecording]);

  /** Full-screen camera layer (countdown + record) so the page doesn’t scroll/jump each second. */
  const showVideoFullscreen = useMemo(
    () =>
      mode === 'video' &&
      (isRecording || (countdown !== null && countdown > 0)),
    [mode, isRecording, countdown],
  );

  useEffect(() => {
    if (!showVideoFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showVideoFullscreen]);

  const showSubmitBlocking = isSubmitting && !submitted;

  useEffect(() => {
    if (!showSubmitBlocking) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showSubmitBlocking]);

  useEffect(() => {
    if (!showSubmitBlocking) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [showSubmitBlocking]);

  const handleBigButtonClick = async () => {
    if (submitted) return;

    if (isSubmitting) return;

    if (countdown !== null) {
      cancelCountdown();
      return;
    }

    if (mode === 'text') {
      if (!canSubmit) return;

      if (eventId === 'demo') {
        setSubmitted(true);
        return;
      }

      if (!supabase) {
        setEventError('Supabase is not configured yet (missing env vars).');
        return;
      }

      setIsSubmitting(true);
      try {
        const { error } = await supabase.from('blirts').insert({
          event_id: eventId,
          guest_name: guestName.trim() || null,
          type: 'text',
          content: message.trim(),
          status: 'pending',
          prompt_snapshot: couple.prompt.trim() || null,
        });

        if (error) {
          setEventError(error.message);
          return;
        }

        setSubmitted(true);
      } catch (e) {
        setEventError(e instanceof Error ? e.message : 'Failed to submit');
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    if (mode === 'video') {
      if (isRecording) {
        await stopVideoRecording();
        return;
      }
      if (!videoFile) {
        if (!canUseInPageRecording()) {
          setRecordHint(cameraFailureMessage());
          return;
        }
        try {
          setRecordHint(null);
          const stream = await getCameraStreamPortraitFirst(videoFacing);
          countdownStreamRef.current = stream;
          countdownModeRef.current = 'video';
          setLiveStreamForPreview(stream);
          setCountdown(3);
        } catch {
          setRecordHint(cameraFailureMessage());
        }
        return;
      }
      if (eventId === 'demo') {
        setSubmitted(true);
        return;
      }
      if (!supabase) {
        setEventError('Supabase is not configured yet (missing env vars).');
        return;
      }
      setIsSubmitting(true);
      setEventError(null);
      try {
        const { error: mediaErr } = await submitGuestMediaBlirt(supabase, {
          eventId,
          file: videoFile,
          type: 'video',
          guestName: guestName.trim() || null,
          promptSnapshot: couple.prompt.trim() || null,
        });
        if (mediaErr) {
          setEventError(mediaErr);
          return;
        }
        setSubmitted(true);
      } catch (e) {
        setEventError(e instanceof Error ? e.message : 'Failed to upload video');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // audio
    if (isRecording) {
      await stopAudioRecording();
      return;
    }
    if (!audioFile) {
      if (!canUseInPageRecording()) {
        audioInputRef.current?.click();
        setRecordHint(
          'Your browser will ask you to pick an audio file — or try Chrome / Safari on your phone.',
        );
        return;
      }
      try {
        setRecordHint(null);
        const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
        countdownStreamRef.current = stream;
        countdownModeRef.current = 'audio';
        setCountdown(3);
      } catch (e) {
        setRecordHint(
          e instanceof Error
            ? e.message
            : 'Could not use the microphone. You can pick a file below.',
        );
        audioInputRef.current?.click();
      }
      return;
    }
    if (eventId === 'demo') {
      setSubmitted(true);
      return;
    }
    if (!supabase) {
      setEventError('Supabase is not configured yet (missing env vars).');
      return;
    }
    setIsSubmitting(true);
    setEventError(null);
    try {
      const { error: mediaErr } = await submitGuestMediaBlirt(supabase, {
        eventId,
        file: audioFile,
        type: 'audio',
        guestName: guestName.trim() || null,
        promptSnapshot: couple.prompt.trim() || null,
      });
      if (mediaErr) {
        setEventError(mediaErr);
        return;
      }
      setSubmitted(true);
    } catch (e) {
      setEventError(e instanceof Error ? e.message : 'Failed to upload audio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelActiveVideoRecording = () => {
    cancelCountdown();
    const live = liveRecordingRef.current;
    if (live) {
      live.abort();
      liveRecordingRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setLiveStreamForPreview(null);
    setIsRecording(false);
    setRecordHint(null);
  };

  const discardVideoClip = () => {
    cancelActiveVideoRecording();
    setVideoFile(null);
  };

  const handleReset = () => {
    cancelCountdown();
    const live = liveRecordingRef.current;
    if (live) {
      live.abort();
      liveRecordingRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setIsRecording(false);
    setLiveStreamForPreview(null);
    setRecordHint(null);
    setVideoFacing('user');
    setMode('video');
    setVideoFile(null);
    setAudioFile(null);
    setMessage('');
    setGuestName('');
    setSubmitted(false);
    setEventError(null);
    setSkipCount(0);
    if (eventId !== 'demo' && promptTemplates.length > 0) {
      const next = pickInitialTemplate(promptTemplates, promptRandomize);
      setActiveTemplate(next);
      setCouple((c) => ({
        ...c,
        prompt: next ? fillPrompt(next, c.a, c.b) : fallbackDemoPrompt,
        // celebrationLine unchanged on reset
      }));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        {!(eventId !== 'demo' && loadingEvent) && (
          <>
            {couple.celebrationLine ? (
              <div className={styles.celebrationHero} role="status" aria-label="Greeting">
                {couple.celebrationLine}
              </div>
            ) : (
              <div className={styles.coupleNames} aria-label="Couple names">
                <span className={styles.coupleName}>{couple.a}</span>
                {hasSecondName && <span className={styles.amp}>&</span>}
                {hasSecondName && <span className={styles.coupleName}>{couple.b}</span>}
              </div>
            )}

            <div className={styles.promptWrap}>
          <div className={styles.promptHeadRow}>
            <div className={styles.promptLabel}>Prompt</div>
            {eventId !== 'demo' && promptTemplates.length > 1 && (
              <div className={styles.promptActions}>
                {canSwapPrompt ? (
                  <button
                    type="button"
                    className={styles.skipPromptButton}
                    onClick={handleNewPrompt}
                  >
                    New prompt ({skipsLeft} left)
                  </button>
                ) : (
                  <span className={styles.skipPromptMuted}>No more new prompts</span>
                )}
              </div>
            )}
          </div>
          <p className={styles.prompt}>&ldquo;{couple.prompt}&rdquo;</p>
        </div>
          </>
        )}
      </div>

      <div className={styles.options} role="group" aria-label="Message type">
        <button
          type="button"
          className={`${styles.optionCard} ${
            mode === 'video' ? styles.optionCardActive : ''
          }`}
          onClick={() => setMode('video')}
        >
          <div className={styles.optionIcon}>🎥</div>
          <div className={styles.optionTitle}>Record a video</div>
        </button>

        <button
          type="button"
          className={`${styles.optionCard} ${
            mode === 'audio' ? styles.optionCardActive : ''
          }`}
          onClick={() => setMode('audio')}
        >
          <div className={styles.optionIcon}>🎙️</div>
          <div className={styles.optionTitle}>Leave a voice note</div>
          <div className={styles.optionHint}>Short and sweet works.</div>
        </button>

        <button
          type="button"
          className={`${styles.optionCard} ${
            mode === 'text' ? styles.optionCardActive : ''
          }`}
          onClick={() => {
            setMode('text');
            // The textarea shows below; this improves the flow on mobile.
            setTimeout(() => messageRef.current?.focus(), 0);
          }}
        >
          <div className={styles.optionIcon}>✍️</div>
          <div className={styles.optionTitle}>Write a message</div>
          <div className={styles.optionHint}>No pressure. Just you.</div>
        </button>
      </div>

      {eventId === 'demo' && (
        <div className={styles.demoBanner} role="status">
          <strong>Practice mode:</strong> this page is not tied to a real event, so nothing is
          saved to Supabase. Add <code className={styles.demoCode}>?event=YOUR_EVENT_ID</code> to
          the URL to save real Blirts.
        </div>
      )}

      {eventId !== 'demo' && eventError && (
        <div className={styles.errorBox} role="alert">
          {eventError}
        </div>
      )}

      {eventId !== 'demo' && loadingEvent && (
        <div className={styles.loadingBox}>Loading your event…</div>
      )}

      {!showVideoFullscreen && (
        <div className={styles.guestNameWrap}>
          <label className={styles.guestNameLabel} htmlFor="guest-from">
            This message is from <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id="guest-from"
            className={styles.guestNameInput}
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Your name"
            maxLength={80}
            autoComplete="name"
          />
        </div>
      )}

      <div
        className={`${styles.composer} ${showVideoFullscreen ? styles.composerHidden : ''}`}
        aria-label="Composer"
        aria-hidden={showVideoFullscreen}
      >
        {mode === 'video' && (
          <>
            {!showVideoFullscreen && videoPreviewUrl ? (
              <>
                <div className={styles.preview}>
                  <VideoFit src={videoPreviewUrl} />
                </div>
                <div className={styles.retakeRow}>
                  <button
                    type="button"
                    className={styles.retakeButton}
                    onClick={discardVideoClip}
                  >
                    Retake / delete
                  </button>
                  <span className={styles.retakeHint}>
                    Not happy? Record again. When you&apos;re ready, tap Submit below.
                  </span>
                </div>
              </>
            ) : null}
            {!showVideoFullscreen && !videoPreviewUrl ? (
              <div className={styles.helpBox}>
                Tap <strong>Record</strong> (up to {MAX_RECORDING_SECONDS} seconds).
                <br />
                <br />
                If recording won&apos;t start, open <strong>Settings</strong> → <strong>Safari</strong> or{' '}
                <strong>Chrome</strong> → allow Camera and Microphone for this browser.
              </div>
            ) : null}
          </>
        )}

        {mode === 'audio' && (
          <>
            <input
              ref={audioInputRef}
              className={styles.hiddenInput}
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const input = e.target;
                const f = input.files?.[0] ?? null;
                input.value = '';
                if (!f) return;
                void (async () => {
                  const url = URL.createObjectURL(f);
                  const dur = await new Promise<number | null>((resolve) => {
                    const el = document.createElement('audio');
                    el.preload = 'metadata';
                    el.src = url;
                    el.onloadedmetadata = () => {
                      URL.revokeObjectURL(url);
                      const d = el.duration;
                      resolve(Number.isFinite(d) ? d : null);
                    };
                    el.onerror = () => {
                      URL.revokeObjectURL(url);
                      resolve(null);
                    };
                  });
                  if (dur != null && dur > MAX_RECORDING_SECONDS + 0.25) {
                    setRecordHint(
                      `That file is about ${Math.ceil(dur)}s. Please use a voice note under ${MAX_RECORDING_SECONDS} seconds.`,
                    );
                    return;
                  }
                  setAudioFile(f);
                  setRecordHint(null);
                })();
              }}
            />

            {countdown !== null && countdown > 0 && !isRecording ? (
              <div className={styles.countdownAudioBox} role="status" aria-live="polite">
                <div className={styles.countdownNumber}>{countdown}</div>
                <p className={styles.countdownAudioHint}>
                  Voice note starts right after — get ready.
                </p>
                <button
                  type="button"
                  className={styles.cancelRecordingLink}
                  onClick={cancelCountdown}
                >
                  Cancel
                </button>
              </div>
            ) : isRecording ? (
              <div className={styles.audioRecordingBox} role="status">
                <span className={styles.recDot} aria-hidden />
                <p className={styles.audioRecordingText}>
                  Recording your voice — {formatRecordingClock(recordingElapsedSec, MAX_RECORDING_SECONDS)}.
                  Tap <strong>Stop</strong> when you&apos;re done (max {MAX_RECORDING_SECONDS}s).
                </p>
              </div>
            ) : audioPreviewUrl ? (
              <div className={styles.preview}>
                <audio src={audioPreviewUrl} controls className={styles.previewMedia} />
              </div>
            ) : (
              <>
                <div className={styles.helpBox}>
                  Tap <strong>Record</strong> to use your microphone for a voice note (up to{' '}
                  {MAX_RECORDING_SECONDS}s — not the photo library).
                </div>
                <button
                  type="button"
                  className={styles.fallbackLink}
                  onClick={() => audioInputRef.current?.click()}
                >
                  Or pick an audio file from your library
                </button>
              </>
            )}
          </>
        )}

        {mode === 'text' && (
          <>
            <textarea
              ref={messageRef}
              className={styles.textarea}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your Blirt…"
              rows={5}
              maxLength={600}
            />
            <div className={styles.textMeta}>
              <span>
                {message.trim().length ? `${message.trim().length} characters` : ' '}
              </span>
              <span className={styles.muted}>
                Max 600
              </span>
            </div>
          </>
        )}
      </div>

      {showVideoFullscreen ? (
        <>
          <div
            className={styles.videoFullScreenShell}
            role="dialog"
            aria-modal="true"
            aria-label="Camera"
          >
            <div className={styles.videoFullScreenInner}>
              <div className={styles.liveVideoShell}>
                <video
                  ref={liveVideoRef}
                  className={`${styles.liveVideo} ${
                    videoFacing === 'user' ? styles.liveVideoMirror : ''
                  } ${styles.liveVideoFullscreen}`}
                  playsInline
                  muted
                  autoPlay
                />
                {!isRecording && countdown !== null && countdown > 0 ? (
                  <button
                    type="button"
                    className={styles.flipCameraButton}
                    onClick={() => void flipCameraDuringCountdown()}
                    disabled={cameraFlipBusy}
                    aria-label={
                      videoFacing === 'user'
                        ? 'Switch to camera on the back of the phone'
                        : 'Switch to selfie camera'
                    }
                  >
                    {cameraFlipBusy ? '…' : 'Flip'}
                  </button>
                ) : null}
                {!isRecording && countdown !== null && countdown > 0 ? (
                  <div className={styles.countdownOverlay} aria-live="polite">
                    <span className={styles.countdownNumber}>{countdown}</span>
                  </div>
                ) : null}
              </div>
              <p className={styles.liveCaptionOnDark}>
                {isRecording ? (
                  <>
                    Recording {formatRecordingClock(recordingElapsedSec, MAX_RECORDING_SECONDS)} — tap{' '}
                    <strong>Stop</strong> below, or recording stops automatically at{' '}
                    {MAX_RECORDING_SECONDS}s.
                  </>
                ) : (
                  <>
                    Get ready… Allow <strong>Camera</strong> and <strong>Microphone</strong> when your phone
                    asks.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className={styles.videoStageBottomBar}>
            {recordHint ? (
              <div className={styles.recordHint} role="status">
                {recordHint}
              </div>
            ) : null}
            <button
              type="button"
              className={styles.bigCta}
              onClick={handleBigButtonClick}
              disabled={
                isSubmitting ||
                (mode === 'text' && !message.trim() && !submitted)
              }
              aria-disabled={
                isSubmitting ||
                (mode === 'text' && !message.trim() && !submitted)
              }
            >
              {bigButtonLabel}
            </button>
          </div>
        </>
      ) : (
        <>
          {recordHint ? (
            <div className={styles.recordHint} role="status">
              {recordHint}
            </div>
          ) : null}

          <button
            type="button"
            className={styles.bigCta}
            onClick={handleBigButtonClick}
            disabled={
              isSubmitting ||
              (mode === 'text' && !message.trim() && !submitted)
            }
            aria-disabled={
              isSubmitting ||
              (mode === 'text' && !message.trim() && !submitted)
            }
          >
            {bigButtonLabel}
          </button>
        </>
      )}

      {submitted && (
        <div className={styles.success}>
          <div className={styles.successTitle}>Your Blirt is in.</div>
          <div className={styles.successBody}>
            Couple will review it before it hits their collection.
          </div>
          <button type="button" className={styles.secondaryButton} onClick={handleReset}>
            Leave another Blirt
          </button>
        </div>
      )}

      {showSubmitBlocking ? (
        <div
          className={styles.submitBlockingOverlay}
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          aria-busy="true"
          aria-label={mode === 'text' ? 'Sending message' : 'Uploading media'}
        >
          <div className={styles.submitBlockingSpinner} aria-hidden />
          <p className={styles.submitBlockingTitle}>
            {mode === 'text' ? 'Sending your message…' : 'Uploading your clip…'}
          </p>
          <p className={styles.submitBlockingSub}>
            Please wait and keep this page open until you see &ldquo;Your Blirt is in.&rdquo; Closing the page too
            early can stop the upload.
          </p>
        </div>
      ) : null}

      <div className={styles.bottomWordmark} aria-hidden="true">
        Blirt
      </div>
    </div>
  );
}


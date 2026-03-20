'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { supabase } from '../../lib/supabaseClient';
import { submitGuestMediaBlirt } from '../../lib/submitGuestBlirt';
import { GUEST_MAX_PROMPT_SKIPS } from '../../lib/promptLibrary';
import {
  blobToAudioFile,
  blobToVideoFile,
  canUseInPageRecording,
  startAudioRecording,
  startVideoRecording,
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
  }>(() => ({
    a: fallbackDemoCouple.a,
    b: fallbackDemoCouple.b,
    prompt: fallbackDemoPrompt,
    celebrationLine: null,
  }));

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

  const [isRecording, setIsRecording] = useState(false);
  /** Camera stream for live preview — must attach after <video> mounts (fixes black box). */
  const [liveStreamForPreview, setLiveStreamForPreview] = useState<MediaStream | null>(null);
  const [recordHint, setRecordHint] = useState<string | null>(null);

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

  /** Attach camera stream after <video> is in the DOM — ref was null when we only set state after getUserMedia (black preview). */
  useLayoutEffect(() => {
    if (!liveStreamForPreview || !isRecording) return;
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
  }, [liveStreamForPreview, isRecording]);

  const canSubmit = useMemo(() => {
    if (mode === 'text') return message.trim().length > 0;
    if (mode === 'video') return Boolean(videoFile);
    return Boolean(audioFile);
  }, [audioFile, message, mode, videoFile]);

  const bigButtonLabel = useMemo(() => {
    if (submitted) return 'Sent!';
    if (mode === 'text') return 'Submit';
    if (mode === 'video') {
      if (isRecording) return 'Stop';
      return videoFile ? 'Submit' : 'Record';
    }
    if (isRecording) return 'Stop';
    return audioFile ? 'Submit' : 'Record';
  }, [audioFile, isRecording, mode, submitted, videoFile]);

  const handleBigButtonClick = async () => {
    if (submitted) return;

    if (isSubmitting) return;

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
        } catch (e) {
          liveRecordingRef.current = null;
          setLiveStreamForPreview(null);
          if (liveVideoRef.current) {
            liveVideoRef.current.srcObject = null;
          }
          setIsRecording(false);
          setRecordHint(
            e instanceof Error ? e.message : 'Could not finish recording. Try again.',
          );
        }
        return;
      }
      if (!videoFile) {
        if (!canUseInPageRecording()) {
          setRecordHint(
            'Recording in the browser isn’t supported here. Please open this page in Safari or Chrome on your phone.',
          );
          return;
        }
        try {
          setRecordHint(null);
          const live = await startVideoRecording();
          liveRecordingRef.current = live;
          setLiveStreamForPreview(live.stream);
          setIsRecording(true);
        } catch (e) {
          setRecordHint(
            e instanceof Error
              ? e.message
              : 'Could not use the camera. Check permissions and try again.',
          );
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
        const live = await startAudioRecording();
        liveRecordingRef.current = live;
        setIsRecording(true);
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
          <div className={styles.optionHint}>Real video, from your phone.</div>
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

      <div className={styles.composer} aria-label="Composer">
        {mode === 'video' && (
          <>
            {isRecording ? (
              <div className={styles.liveWrap}>
                <video
                  ref={liveVideoRef}
                  className={`${styles.liveVideo} ${styles.liveVideoMirror}`}
                  playsInline
                  muted
                  autoPlay
                />
                <p className={styles.liveCaption}>
                  Recording — tap <strong>Stop</strong> when you&apos;re finished.
                </p>
                <button
                  type="button"
                  className={styles.cancelRecordingLink}
                  onClick={cancelActiveVideoRecording}
                >
                  Cancel recording
                </button>
              </div>
            ) : videoPreviewUrl ? (
              <>
                <div className={styles.preview}>
                  <video
                    src={videoPreviewUrl}
                    controls
                    playsInline
                    className={styles.previewMedia}
                  />
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
            ) : (
              <div className={styles.helpBox}>
                Tap <strong>Record</strong> to open your camera and film here. You can retake before
                you send.
              </div>
            )}
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
                const f = e.target.files?.[0] ?? null;
                setAudioFile(f);
                setRecordHint(null);
              }}
            />

            {isRecording ? (
              <div className={styles.audioRecordingBox} role="status">
                <span className={styles.recDot} aria-hidden />
                <p className={styles.audioRecordingText}>
                  Recording your voice — tap <strong>Stop</strong> when you&apos;re done.
                </p>
              </div>
            ) : audioPreviewUrl ? (
              <div className={styles.preview}>
                <audio src={audioPreviewUrl} controls className={styles.previewMedia} />
              </div>
            ) : (
              <>
                <div className={styles.helpBox}>
                  Tap <strong>Record</strong> to use your microphone for a voice note (not the photo
                  library).
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

      {recordHint ? (
        <div className={styles.recordHint} role="status">
          {recordHint}
        </div>
      ) : null}

      <button
        type="button"
        className={styles.bigCta}
        onClick={handleBigButtonClick}
        // Video/audio: first tap opens camera/mic — do not disable until file exists.
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

      <div className={styles.bottomWordmark} aria-hidden="true">
        Blirt
      </div>
    </div>
  );
}


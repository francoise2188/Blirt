'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import confetti from 'canvas-confetti';
import styles from './page.module.css';
import { supabase } from '../../lib/supabaseClient';
import { submitGuestMediaBlirt, submitGuestSoundtrackMediaBlirt } from '../../lib/submitGuestBlirt';
import { GUEST_MAX_PROMPT_SKIPS } from '../../lib/promptLibrary';
import { VideoFit } from '../../components/VideoFit';
import { getProxiedDeezerPreviewUrl } from '../../lib/songDedication';
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

type Mode = 'video' | 'audio' | 'text' | 'soundtrack';
type MessageMode = 'video' | 'audio' | 'text';

type SpotifySearchResult = {
  id: string;
  name: string;
  artist_name: string;
  album_name: string;
  album_art_url: string | null;
  preview_url: string | null;
};

const SOUNDTRACK_PROMPT = 'This song reminds me of you because...';

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

/** Matches globals.css --bg (warm) and --accent (chartreuse) */
const CONFETTI_COLORS = [
  '#faf8f4',
  '#f5f2eb',
  '#fffef9',
  '#b5cc2e',
  '#c8d94a',
  '#a3b92a',
];

const SUBMIT_CONFETTI_OPTS = {
  particleCount: 160,
  spread: 78,
  startVelocity: 36,
  origin: { y: 0.66 },
  colors: CONFETTI_COLORS,
  ticks: 280,
  disableForReducedMotion: false,
};

function fireBurst(api: ReturnType<typeof confetti.create> | null | undefined): void {
  if (api) {
    void api(SUBMIT_CONFETTI_OPTS);
    return;
  }
  /** Fallback if custom canvas instance is not ready yet. */
  void confetti({ ...SUBMIT_CONFETTI_OPTS, zIndex: 2147483000 });
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

export default function GuestRecordingPage({ eventId }: { eventId: string }) {

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
  const [soundtrackStep, setSoundtrackStep] = useState<1 | 2>(1);
  const [soundtrackMessageType, setSoundtrackMessageType] = useState<MessageMode>('video');
  const [spotifyQuery, setSpotifyQuery] = useState('');
  const [spotifySearching, setSpotifySearching] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [spotifyResults, setSpotifyResults] = useState<SpotifySearchResult[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<SpotifySearchResult | null>(null);
  const browsePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  /** Step 1 search results: listen before choosing a song. */
  const [browsePreview, setBrowsePreview] = useState<{
    trackId: string | null;
    phase: 'idle' | 'loading' | 'playing' | 'error';
  }>({ trackId: null, phase: 'idle' });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [guestName, setGuestName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const markSubmitted = useCallback(() => {
    setSubmitted(true);
  }, []);

  /**
   * Default `canvas-confetti` uses a Web Worker; that can fail silently on some mobile
   * browsers. A fixed full-screen canvas + `create(..., { resize: true })` draws on the
   * main thread and stays above all guest UI.
   */
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiApiRef = useRef<ReturnType<typeof confetti.create> | null>(null);

  useLayoutEffect(() => {
    const canvas = confettiCanvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    const api = confetti.create(canvas, { resize: true });
    confettiApiRef.current = api;
    return () => {
      try {
        api.reset();
      } catch {
        /* ignore */
      }
      confettiApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!submitted) return;
    const id = window.setTimeout(() => {
      fireBurst(confettiApiRef.current);
    }, 200);
    return () => window.clearTimeout(id);
  }, [submitted]);

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
  /** Permission / troubleshooting copy hidden until guest taps "Having trouble recording?" */
  const [recordingTroubleshootOpen, setRecordingTroubleshootOpen] = useState(false);
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

  /** Typewriter display for the prompt line */
  const [promptTyped, setPromptTyped] = useState('');

  const activePrompt = useMemo(() => {
    if (mode === 'soundtrack') return SOUNDTRACK_PROMPT;
    return couple.prompt;
  }, [mode, couple.prompt]);

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
    const target = activePrompt;
    setPromptTyped('');
    if (!target) return undefined;
    let i = 0;
    const stepMs = 22;
    const id = window.setInterval(() => {
      i += 1;
      setPromptTyped(target.slice(0, i));
      if (i >= target.length) {
        clearInterval(id);
      }
    }, stepMs);
    return () => clearInterval(id);
  }, [activePrompt]);

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
    setSoundtrackStep(1);
    setSoundtrackMessageType('video');
    setSpotifyQuery('');
    setSpotifySearching(false);
    setSpotifyError(null);
    setSpotifyResults([]);
    setSelectedTrack(null);
  }, [mode]);

  // Inside soundtrack mode, switching memory type should behave like switching modes (but keep the chosen song).
  useEffect(() => {
    if (mode !== 'soundtrack') return;
    if (!selectedTrack) return;

    // Stop any in-progress camera/mic capture when switching memory type.
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
    setVideoFile(null);
    setAudioFile(null);
    setMessage('');
    setSubmitted(false);
    setEventError(null);
  }, [mode, selectedTrack, soundtrackMessageType]);

  const activeMessageMode: MessageMode | null = useMemo(() => {
    if (mode === 'soundtrack') {
      if (!selectedTrack) return null;
      return soundtrackMessageType;
    }
    return mode;
  }, [mode, selectedTrack, soundtrackMessageType]);

  // Spotify search (debounced 400ms) while on Step 1.
  useEffect(() => {
    if (mode !== 'soundtrack') return;
    if (soundtrackStep !== 1) return;
    if (selectedTrack) return;
    const q = spotifyQuery.trim();
    setSpotifyError(null);
    if (!q) {
      setSpotifySearching(false);
      setSpotifyResults([]);
      return;
    }
    const ctrl = new AbortController();
    setSpotifySearching(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`, {
            signal: ctrl.signal,
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error || `Search failed (${res.status})`);
          }
          const body = (await res.json()) as { results?: SpotifySearchResult[] };
          if (!ctrl.signal.aborted) {
            setSpotifyResults(Array.isArray(body.results) ? body.results : []);
            setSpotifySearching(false);
          }
        } catch (e) {
          if (ctrl.signal.aborted) return;
          setSpotifySearching(false);
          setSpotifyResults([]);
          setSpotifyError(e instanceof Error ? e.message : 'Search failed');
        }
      })();
    }, 400);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [mode, soundtrackStep, selectedTrack, spotifyQuery]);

  useEffect(() => {
    if (mode !== 'soundtrack' || selectedTrack) {
      const a = browsePreviewAudioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute('src');
        a.load();
      }
      setBrowsePreview({ trackId: null, phase: 'idle' });
    }
  }, [mode, selectedTrack]);

  useEffect(() => {
    const a = browsePreviewAudioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    setBrowsePreview({ trackId: null, phase: 'idle' });
  }, [spotifyResults]);

  const handleBrowsePreviewClick = useCallback(async (r: SpotifySearchResult, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const audio = browsePreviewAudioRef.current;
    const playingThis = browsePreview.trackId === r.id && browsePreview.phase === 'playing';
    if (playingThis && audio) {
      audio.pause();
      setBrowsePreview({ trackId: null, phase: 'idle' });
      return;
    }
    if (browsePreview.trackId === r.id && browsePreview.phase === 'loading') return;

    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setBrowsePreview({ trackId: r.id, phase: 'loading' });
    try {
      const url = await getProxiedDeezerPreviewUrl(r.name, r.artist_name);
      const el = browsePreviewAudioRef.current;
      if (!el) {
        setBrowsePreview({ trackId: null, phase: 'idle' });
        return;
      }
      if (!url) {
        setBrowsePreview({ trackId: r.id, phase: 'error' });
        window.setTimeout(() => setBrowsePreview({ trackId: null, phase: 'idle' }), 2200);
        return;
      }
      el.src = url;
      el.volume = 1;
      await el.play();
      setBrowsePreview({ trackId: r.id, phase: 'playing' });
    } catch {
      setBrowsePreview({ trackId: r.id, phase: 'error' });
      window.setTimeout(() => setBrowsePreview({ trackId: null, phase: 'idle' }), 2200);
    }
  }, [browsePreview.phase, browsePreview.trackId]);

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
    if (!activeMessageMode) return false;
    if (activeMessageMode === 'text') return message.trim().length > 0;
    if (activeMessageMode === 'video') return Boolean(videoFile);
    return Boolean(audioFile);
  }, [activeMessageMode, audioFile, message, videoFile]);

  const bigButtonLabel = useMemo(() => {
    if (submitted) return 'Sent!';
    if (isSubmitting) {
      return activeMessageMode === 'text' ? 'Sending…' : 'Uploading…';
    }
    if (mode === 'soundtrack' && (!selectedTrack || soundtrackStep === 1)) return 'Select a song';
    if (!activeMessageMode) return 'Continue';
    if (activeMessageMode === 'text') return 'Submit';
    if (countdown !== null) return 'Cancel';
    if (activeMessageMode === 'video') {
      if (isRecording) return 'Stop';
      return videoFile ? 'Submit' : 'Record';
    }
    if (isRecording) return 'Stop';
    return audioFile ? 'Submit' : 'Record';
  }, [
    activeMessageMode,
    audioFile,
    countdown,
    isRecording,
    isSubmitting,
    mode,
    selectedTrack,
    soundtrackStep,
    submitted,
    videoFile,
  ]);

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
      if (activeMessageMode === 'video') void stopVideoRecording();
      else if (activeMessageMode === 'audio') void stopAudioRecording();
    }, MAX_RECORDING_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [isRecording, activeMessageMode, stopAudioRecording, stopVideoRecording]);

  /** Full-screen camera layer (countdown + record) so the page doesn’t scroll/jump each second. */
  const showVideoFullscreen = useMemo(
    () =>
      activeMessageMode === 'video' &&
      (isRecording || (countdown !== null && countdown > 0)),
    [activeMessageMode, isRecording, countdown],
  );

  useEffect(() => {
    if (!showVideoFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showVideoFullscreen]);

  useEffect(() => {
    setRecordingTroubleshootOpen(false);
  }, [activeMessageMode]);

  const showSubmitBlocking = isSubmitting && !submitted;

  /** Idle media: no big dashed instruction box — hints sit above the Record button instead. */
  const composerMediaIdle =
    !submitted &&
    ((activeMessageMode === 'video' && !videoPreviewUrl && !showVideoFullscreen) ||
      (activeMessageMode === 'audio' && countdown === null && !isRecording && !audioPreviewUrl));

  const showIdleRecordingHints =
    !submitted &&
    !showVideoFullscreen &&
    ((activeMessageMode === 'video' && !videoPreviewUrl) ||
      (activeMessageMode === 'audio' && !audioPreviewUrl && !isRecording && countdown === null));

  const showAudioIdleFallback =
    !submitted &&
    activeMessageMode === 'audio' &&
    !audioPreviewUrl &&
    !isRecording &&
    countdown === null &&
    !showVideoFullscreen;

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

    if (mode === 'soundtrack' && (!selectedTrack || soundtrackStep === 1)) return;

    if (countdown !== null) {
      cancelCountdown();
      return;
    }

    if (activeMessageMode === 'text') {
      if (!canSubmit) return;

      if (eventId === 'demo') {
        markSubmitted();
        return;
      }

      if (!supabase) {
        setEventError('Supabase is not configured yet (missing env vars).');
        return;
      }

      setIsSubmitting(true);
      try {
        if (mode === 'soundtrack') {
          if (!selectedTrack) return;
          console.log('[Soundtrack guest] submitting text blirt selectedTrack.preview_url =', selectedTrack.preview_url);
          const { error } = await supabase.from('blirts').insert({
            event_id: eventId,
            guest_name: guestName.trim() || null,
            type: 'soundtrack',
            content: message.trim(),
            status: 'pending',
            prompt_snapshot: SOUNDTRACK_PROMPT,
            soundtrack_message_type: 'text',
            spotify_track_id: selectedTrack.id,
            spotify_track_name: selectedTrack.name,
            spotify_artist_name: selectedTrack.artist_name,
            spotify_album_name: selectedTrack.album_name,
            spotify_album_art_url: selectedTrack.album_art_url,
            spotify_preview_url: selectedTrack.preview_url,
          });

          if (error) {
            setEventError(error.message);
            return;
          }
        } else {
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
        }

        markSubmitted();
      } catch (e) {
        setEventError(e instanceof Error ? e.message : 'Failed to submit');
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    if (activeMessageMode === 'video') {
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
        markSubmitted();
        return;
      }
      if (!supabase) {
        setEventError('Supabase is not configured yet (missing env vars).');
        return;
      }
      setIsSubmitting(true);
      setEventError(null);
      try {
        const { error: mediaErr } =
          mode === 'soundtrack'
            ? await (async () => {
                if (!selectedTrack) return { error: 'Pick a song first.' };
                return await submitGuestSoundtrackMediaBlirt(supabase, {
                  eventId,
                  file: videoFile,
                  soundtrackMessageType: 'video',
                  guestName: guestName.trim() || null,
                  promptSnapshot: SOUNDTRACK_PROMPT,
                  spotify: {
                    track_id: selectedTrack.id,
                    track_name: selectedTrack.name,
                    artist_name: selectedTrack.artist_name,
                    album_name: selectedTrack.album_name,
                    album_art_url: selectedTrack.album_art_url,
                    preview_url: selectedTrack.preview_url,
                  },
                });
              })()
            : await submitGuestMediaBlirt(supabase, {
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
        markSubmitted();
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
      markSubmitted();
      return;
    }
    if (!supabase) {
      setEventError('Supabase is not configured yet (missing env vars).');
      return;
    }
    setIsSubmitting(true);
    setEventError(null);
    try {
      const { error: mediaErr } =
        mode === 'soundtrack'
          ? await (async () => {
              if (!selectedTrack) return { error: 'Pick a song first.' };
              return await submitGuestSoundtrackMediaBlirt(supabase, {
                eventId,
                file: audioFile,
                soundtrackMessageType: 'audio',
                guestName: guestName.trim() || null,
                promptSnapshot: SOUNDTRACK_PROMPT,
                spotify: {
                  track_id: selectedTrack.id,
                  track_name: selectedTrack.name,
                  artist_name: selectedTrack.artist_name,
                  album_name: selectedTrack.album_name,
                  album_art_url: selectedTrack.album_art_url,
                  preview_url: selectedTrack.preview_url,
                },
              });
            })()
          : await submitGuestMediaBlirt(supabase, {
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
      markSubmitted();
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
    try {
      confettiApiRef.current?.reset();
    } catch {
      /* ignore */
    }
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
                {mode !== 'soundtrack' && canSwapPrompt ? (
                  <button
                    type="button"
                    className={styles.skipPromptButton}
                    onClick={handleNewPrompt}
                  >
                    New prompt ({skipsLeft} left)
                  </button>
                ) : mode !== 'soundtrack' ? (
                  <span className={styles.skipPromptMuted}>No more new prompts</span>
                ) : null}
              </div>
            )}
          </div>
          <p className={styles.prompt} aria-live="polite">
            &ldquo;{promptTyped}
            {promptTyped.length < activePrompt.length ? (
              <span className={styles.promptCaret} aria-hidden>
                |
              </span>
            ) : null}
            &rdquo;
          </p>
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

        <button
          type="button"
          className={`${styles.optionCard} ${
            mode === 'soundtrack' ? styles.optionCardActive : ''
          }`}
          onClick={() => setMode('soundtrack')}
        >
          <div className={styles.optionIcon}>🎵</div>
          <div className={styles.optionTitle}>Dedicate a song</div>
          <div className={styles.optionHint}>Pick a song and tell them why</div>
        </button>
      </div>

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
        className={`${styles.composer} ${showVideoFullscreen ? styles.composerHidden : ''} ${
          composerMediaIdle ? styles.composerMediaIdle : ''
        }`}
        aria-label="Composer"
        aria-hidden={showVideoFullscreen}
      >
        {mode === 'soundtrack' && !selectedTrack && (
          <div className={styles.soundtrackWrap} aria-label="Song search">
            <div className={styles.soundtrackHead}>
              <div className={styles.soundtrackTitle}>Step 1 — Pick a song</div>
            </div>
            <p className={styles.soundtrackBrowseHint}>
              Tap <strong>Preview</strong> to hear a short clip, then tap the song row to choose it.
            </p>
            <audio
              ref={browsePreviewAudioRef}
              className={styles.soundtrackBrowseAudio}
              preload="none"
              onEnded={() => setBrowsePreview({ trackId: null, phase: 'idle' })}
            />
            <input
              className={styles.soundtrackSearchInput}
              value={spotifyQuery}
              onChange={(e) => setSpotifyQuery(e.target.value)}
              placeholder="Search for a song..."
              autoComplete="off"
              spellCheck={false}
            />
            {spotifyError ? (
              <div className={styles.soundtrackError} role="alert">
                {spotifyError}
              </div>
            ) : null}
            {spotifySearching ? (
              <div className={styles.soundtrackMuted} role="status">
                Searching…
              </div>
            ) : null}
            <div className={styles.soundtrackResults} role="list" aria-label="Search results">
              {spotifyResults.map((r) => (
                <div key={r.id} className={styles.soundtrackResultRow} role="listitem">
                  <button
                    type="button"
                    className={styles.soundtrackResultSelect}
                    onClick={() => {
                    setSelectedTrack(r);
                    setSoundtrackStep(2);
                  }}
                  >
                    {r.album_art_url ? (
                      <img
                        src={r.album_art_url}
                        alt=""
                        className={styles.soundtrackThumb}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className={styles.soundtrackThumbFallback} aria-hidden />
                    )}
                    <div className={styles.soundtrackResultText}>
                      <div className={styles.soundtrackTrackName}>{r.name}</div>
                      <div className={styles.soundtrackArtistName}>{r.artist_name}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`${styles.soundtrackPreviewBtn} ${
                      browsePreview.trackId === r.id && browsePreview.phase === 'playing'
                        ? styles.soundtrackPreviewBtnActive
                        : ''
                    }`}
                    disabled={
                      browsePreview.trackId === r.id && browsePreview.phase === 'loading'
                    }
                    onClick={(ev) => void handleBrowsePreviewClick(r, ev)}
                    aria-label={
                      browsePreview.trackId === r.id && browsePreview.phase === 'playing'
                        ? 'Stop preview'
                        : 'Play a short preview before choosing this song'
                    }
                  >
                    {browsePreview.trackId === r.id && browsePreview.phase === 'loading'
                      ? '…'
                      : browsePreview.trackId === r.id && browsePreview.phase === 'playing'
                        ? 'Stop'
                        : browsePreview.trackId === r.id && browsePreview.phase === 'error'
                          ? 'No clip'
                          : 'Preview'}
                  </button>
                </div>
              ))}
              {!spotifySearching && spotifyQuery.trim() && spotifyResults.length === 0 && !spotifyError ? (
                <div className={styles.soundtrackMuted} role="status">
                  No results yet — try another search.
                </div>
              ) : null}
            </div>
          </div>
        )}

        {mode === 'soundtrack' && selectedTrack && (
          <div className={styles.soundtrackWrap} aria-label="Selected song">
            <div className={styles.soundtrackSelectedCard}>
              <div className={styles.soundtrackSelectedLeft}>
                <span className={styles.soundtrackCheck} aria-hidden>
                  ✓
                </span>
                {selectedTrack.album_art_url ? (
                  <img
                    src={selectedTrack.album_art_url}
                    alt=""
                    className={styles.soundtrackThumb}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className={styles.soundtrackThumbFallback} aria-hidden />
                )}
                <div className={styles.soundtrackResultText}>
                  <div className={styles.soundtrackTrackName}>{selectedTrack.name}</div>
                  <div className={styles.soundtrackArtistName}>{selectedTrack.artist_name}</div>
                </div>
              </div>
              <button
                type="button"
                className={styles.soundtrackChangeLink}
                onClick={() => {
                  setSelectedTrack(null);
                  setSoundtrackStep(1);
                }}
              >
                Change song
              </button>
            </div>

            <div className={styles.soundtrackPrompt} role="status">
              Now tell them why — how does this song remind you of them?
            </div>

            <div className={styles.soundtrackMemoryOptions} role="group" aria-label="Memory type">
              <button
                type="button"
                className={`${styles.optionCard} ${
                  soundtrackMessageType === 'video' ? styles.optionCardActive : ''
                }`}
                onClick={() => setSoundtrackMessageType('video')}
              >
                <div className={styles.optionIcon}>🎥</div>
                <div className={styles.optionTitle}>Record a video</div>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${
                  soundtrackMessageType === 'audio' ? styles.optionCardActive : ''
                }`}
                onClick={() => setSoundtrackMessageType('audio')}
              >
                <div className={styles.optionIcon}>🎙️</div>
                <div className={styles.optionTitle}>Leave a voice note</div>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${
                  soundtrackMessageType === 'text' ? styles.optionCardActive : ''
                }`}
                onClick={() => {
                  setSoundtrackMessageType('text');
                  setTimeout(() => messageRef.current?.focus(), 0);
                }}
              >
                <div className={styles.optionIcon}>✍️</div>
                <div className={styles.optionTitle}>Write a message</div>
              </button>
            </div>
          </div>
        )}

        {activeMessageMode === 'video' && (
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
          </>
        )}

        {activeMessageMode === 'audio' && (
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
            ) : null}
          </>
        )}

        {activeMessageMode === 'text' && (
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
            <button
              type="button"
              className={`${styles.bigCta} ${styles.videoFullscreenBigCta}`}
              onClick={handleBigButtonClick}
              disabled={
                isSubmitting ||
                (mode === 'soundtrack' && (!selectedTrack || !activeMessageMode)) ||
                (activeMessageMode === 'text' && !message.trim() && !submitted)
              }
              aria-disabled={
                isSubmitting ||
                (mode === 'soundtrack' && (!selectedTrack || !activeMessageMode)) ||
                (activeMessageMode === 'text' && !message.trim() && !submitted)
              }
            >
              {bigButtonLabel}
            </button>
            {isRecording ? (
              <p className={styles.liveCaptionOnDark}>
                Recording {formatRecordingClock(recordingElapsedSec, MAX_RECORDING_SECONDS)} — tap{' '}
                <strong>Stop</strong> above, or recording stops automatically at {MAX_RECORDING_SECONDS}s.
              </p>
            ) : (
              <p className={styles.liveCaptionOnDark}>
                Get ready… Allow <strong>Camera</strong> and <strong>Microphone</strong> when your phone asks.
              </p>
            )}
            {recordHint ? (
              <div className={styles.recordHint} role="status">
                {recordHint}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={styles.recordCtaStack}>
          {recordHint ? (
            <div className={styles.recordHint} role="status">
              {recordHint}
            </div>
          ) : null}

          {showIdleRecordingHints ? (
            <>
              <p className={styles.recordPrimaryHint}>
                Tap <strong>Record</strong> (up to {MAX_RECORDING_SECONDS} seconds).
              </p>
              <div className={styles.recordingTroubleWrap}>
                <button
                  type="button"
                  className={styles.recordingTroubleLink}
                  aria-expanded={recordingTroubleshootOpen}
                  aria-controls="guest-recording-trouble-panel"
                  id="guest-recording-trouble-toggle"
                  onClick={() => setRecordingTroubleshootOpen((o) => !o)}
                >
                  Having trouble recording?
                </button>
                {recordingTroubleshootOpen ? (
                  <div
                    className={styles.recordingTroublePanel}
                    id="guest-recording-trouble-panel"
                    role="region"
                    aria-labelledby="guest-recording-trouble-toggle"
                  >
                    If recording won&apos;t start, open <strong>Settings</strong> → <strong>Safari</strong> or{' '}
                    <strong>Chrome</strong> → allow Camera and Microphone for this browser.
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {showAudioIdleFallback ? (
            <button
              type="button"
              className={styles.fallbackLink}
              onClick={() => audioInputRef.current?.click()}
            >
              Or pick an audio file from your library
            </button>
          ) : null}

          <button
            type="button"
            className={styles.bigCta}
            onClick={handleBigButtonClick}
            disabled={
              isSubmitting ||
              (mode === 'soundtrack' && (!selectedTrack || !activeMessageMode)) ||
              (activeMessageMode === 'text' && !message.trim() && !submitted)
            }
            aria-disabled={
              isSubmitting ||
              (mode === 'soundtrack' && (!selectedTrack || !activeMessageMode)) ||
              (activeMessageMode === 'text' && !message.trim() && !submitted)
            }
          >
            {bigButtonLabel}
          </button>
        </div>
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

      <div className={styles.pageFooter}>
        {eventId === 'demo' ? (
          <p className={styles.demoNote} role="status">
            ✨ You&apos;re in demo mode — this is just a preview. Scan a real event QR code to leave a Blirt that
            counts.
          </p>
        ) : null}
        <div className={styles.bottomWordmark} aria-hidden="true">
          Blirt
        </div>
      </div>

      <canvas ref={confettiCanvasRef} className={styles.confettiCanvas} aria-hidden />
    </div>
  );
}


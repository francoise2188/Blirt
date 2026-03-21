/**
 * Guest page: record video/audio with the device camera & mic (better quality than
 * relying on the OS file picker). Video errors use {@link CAMERA_BLOCKED_MESSAGE} from here.
 *
 * Why not a npm “recording library”? Most (RecordRTC, etc.) still use the same browser
 * APIs underneath (getUserMedia + MediaRecorder). They add helpers and fallbacks, not
 * higher camera resolution — quality is capped by the phone/browser. We set strong
 * defaults (HD-friendly constraints + bitrate) here without extra bundle weight.
 */

/** Max length for in-page video/voice recording (seconds). */
export const MAX_RECORDING_SECONDS = 30;

const AUDIO_FOR_VIDEO: MediaStreamConstraints['audio'] = {
  echoCancellation: true,
  noiseSuppression: true,
  channelCount: 1,
};

/**
 * Portrait-first. Mixing width + height + aspectRatio together confuses some mobile
 * browsers and can yield rotated/sideways encodes. We try simple constraints first.
 */
const VIDEO_PORTRAIT_ASPECT_ONLY: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    aspectRatio: { ideal: 9 / 16 },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: AUDIO_FOR_VIDEO,
};

/** Explicit portrait pixels (height > width). */
const VIDEO_PORTRAIT_EXPLICIT: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 720, min: 360 },
    height: { ideal: 1280, min: 640 },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: AUDIO_FOR_VIDEO,
};

/** 1080×1920 style portrait (tall). */
const VIDEO_PORTRAIT_HD: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 1080, max: 1080 },
    height: { ideal: 1920, min: 720 },
    aspectRatio: { ideal: 9 / 16 },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: AUDIO_FOR_VIDEO,
};

/** Narrow aspect range ≈ phone portrait (width/height between ~0.5 and 0.65). */
const VIDEO_PORTRAIT_ASPECT_RANGE: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    aspectRatio: { min: 0.5, max: 0.65 },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: AUDIO_FOR_VIDEO,
};

/** Minimal — many phones default to portrait for the selfie camera. */
const VIDEO_PORTRAIT_MINIMAL: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
  },
  audio: AUDIO_FOR_VIDEO,
};

/** Legacy export — aspect + explicit dimensions (kept for any external use). */
export const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 1080, min: 480 },
    height: { ideal: 1920, min: 720 },
    aspectRatio: { ideal: 9 / 16 },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: AUDIO_FOR_VIDEO,
};

/** Desktop webcam last resort (landscape). Avoid on phones so clips stay portrait. */
export const VIDEO_CONSTRAINTS_FALLBACK: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 1920, min: 640 },
    height: { ideal: 1080, min: 480 },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: AUDIO_FOR_VIDEO,
};

function isLikelyPhoneOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/**
 * Prefer portrait (phone upright). We no longer fall back to landscape HD on phones —
 * that was forcing wide video. Desktop can still use landscape if nothing else works.
 */
export async function getFrontCameraStreamPortraitFirst(): Promise<MediaStream> {
  const portraitTries: MediaStreamConstraints[] = [
    VIDEO_PORTRAIT_ASPECT_ONLY,
    VIDEO_PORTRAIT_EXPLICIT,
    VIDEO_PORTRAIT_HD,
    VIDEO_CONSTRAINTS,
    VIDEO_PORTRAIT_ASPECT_RANGE,
    VIDEO_PORTRAIT_MINIMAL,
  ];

  let lastErr: unknown;
  for (const c of portraitTries) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      lastErr = e;
    }
  }

  if (!isLikelyPhoneOrTablet()) {
    try {
      return await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS_FALLBACK);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    channelCount: 1,
  },
};

function supportedMime(candidates: string[]): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

/** Safari / iOS records reliably with MP4; WebM often fails or is unsupported for encoding. */
function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function pickVideoMimeType(): string {
  const webmFirst = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
    'video/mp4;codecs=avc1',
  ];
  const mp4First = [
    'video/mp4',
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return supportedMime(isIOSDevice() ? mp4First : webmFirst);
}

export function pickAudioMimeType(): string {
  return supportedMime([
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mp4;codecs=aac',
    'audio/aac',
  ]);
}

export function canUseInPageRecording(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    window.isSecureContext &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}

/** Single guest-facing line when video recording can’t start or finish (any technical cause). */
export const CAMERA_BLOCKED_MESSAGE =
  'Permission blocked — Allow in the prompt; fix camera Settings for Safari/Chrome; avoid in-app browsers; open in Safari/Chrome.';

export function cameraFailureMessage(): string {
  return CAMERA_BLOCKED_MESSAGE;
}

export function blobToVideoFile(blob: Blob): File {
  const type = blob.type || 'video/webm';
  const ext = type.includes('mp4') ? 'mp4' : type.includes('quicktime') ? 'mov' : 'webm';
  return new File([blob], `blirt-video-${Date.now()}.${ext}`, { type });
}

export function blobToAudioFile(blob: Blob): File {
  const type = blob.type || 'audio/webm';
  const ext =
    type.includes('mp4') || type.includes('mpeg') || type.includes('aac')
      ? 'm4a'
      : type.includes('webm')
        ? 'webm'
        : 'webm';
  return new File([blob], `blirt-audio-${Date.now()}.${ext}`, { type });
}

export type LiveRecording = {
  stream: MediaStream;
  /** Call when user taps Stop — returns recorded blob. */
  stop: () => Promise<Blob>;
  /** Abort without producing a blob (permission denied cleanup, etc.). */
  abort: () => void;
};

function createRecorderSession(stream: MediaStream, kind: 'video' | 'audio'): LiveRecording {
  const mime =
    kind === 'video' ? pickVideoMimeType() : pickAudioMimeType();
  const opts: MediaRecorderOptions = {};
  if (mime) opts.mimeType = mime;
  if (kind === 'video') {
    // iOS Safari often rejects very high video bitrates; let defaults work if omitted.
    if (!isIOSDevice()) {
      opts.videoBitsPerSecond = 8_000_000;
    }
    opts.audioBitsPerSecond = 128_000;
  } else {
    opts.audioBitsPerSecond = 128_000;
  }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, opts);
  } catch {
    try {
      const fallback: MediaRecorderOptions = mime ? { mimeType: mime } : {};
      recorder = new MediaRecorder(stream, fallback);
    } catch (e2) {
      stream.getTracks().forEach((t) => t.stop());
      throw e2 instanceof Error ? e2 : new Error('MediaRecorder not supported');
    }
  }

  const chunks: BlobPart[] = [];
  let aborted = false;

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const abort = () => {
    aborted = true;
    stream.getTracks().forEach((t) => t.stop());
  };

  const stop = () =>
    new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        if (aborted) return;
        const outType =
          recorder.mimeType ||
          mime ||
          (kind === 'video' ? 'video/webm' : 'audio/webm');
        const blob = new Blob(chunks, { type: outType });
        stream.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      recorder.onerror = () => {
        if (aborted) return;
        stream.getTracks().forEach((t) => t.stop());
        reject(new Error('Recording failed'));
      };
      try {
        if (recorder.state === 'inactive') {
          if (!aborted) stream.getTracks().forEach((t) => t.stop());
          reject(new Error('Recorder was not active'));
          return;
        }
        recorder.stop();
      } catch (e) {
        if (!aborted) stream.getTracks().forEach((t) => t.stop());
        reject(e instanceof Error ? e : new Error('Stop failed'));
      }
    });

  try {
    recorder.start(250);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e instanceof Error ? e : new Error('Could not start recording');
  }

  return { stream, stop, abort };
}

/** Start recording on a stream you already opened (e.g. after a countdown). */
export function startVideoRecordingFromStream(stream: MediaStream): LiveRecording {
  return createRecorderSession(stream, 'video');
}

/** Start recording on a mic stream you already opened (e.g. after a countdown). */
export function startAudioRecordingFromStream(stream: MediaStream): LiveRecording {
  return createRecorderSession(stream, 'audio');
}

export async function startVideoRecording(): Promise<LiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
  try {
    return createRecorderSession(stream, 'video');
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export async function startAudioRecording(): Promise<LiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
  try {
    return createRecorderSession(stream, 'audio');
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e instanceof Error ? e : new Error(String(e));
  }
}

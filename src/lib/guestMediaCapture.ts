/**
 * Guest page: record video/audio with the device camera & mic (better quality than
 * relying on the OS file picker). Falls back to file upload if APIs aren't available.
 *
 * Why not a npm “recording library”? Most (RecordRTC, etc.) still use the same browser
 * APIs underneath (getUserMedia + MediaRecorder). They add helpers and fallbacks, not
 * higher camera resolution — quality is capped by the phone/browser. We set strong
 * defaults (HD-friendly constraints + bitrate) here without extra bundle weight.
 */

/** Ask for HD when the device can do it; browser picks actual supported size. */
export const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 1920, min: 640 },
    height: { ideal: 1080, min: 480 },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    channelCount: 1,
  },
};

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

export function pickVideoMimeType(): string {
  return supportedMime([
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
    'video/mp4;codecs=avc1',
  ]);
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
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
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
    opts.videoBitsPerSecond = 8_000_000;
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

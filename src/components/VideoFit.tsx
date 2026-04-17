'use client';

import type { Ref } from 'react';
import styles from './VideoFit.module.css';

type Props = {
  src: string;
  /** guest = max-width box, intrinsic aspect from the file (rotation-aware in most browsers); modal = scroll-friendly */
  variant?: 'guest' | 'modal';
  className?: string;
  /** When set, attached to the underlying video element (guest variant only). */
  videoRef?: Ref<HTMLVideoElement>;
  /** Hide native controls until you’re ready (e.g. song intro first). Default true. */
  controls?: boolean;
};

/**
 * Playback: let the browser lay out the video from its intrinsic dimensions + rotation
 * metadata. Avoids wrong aspect-ratio boxes from raw videoWidth/height (often landscape
 * pixels for portrait clips), which made playback look “zoomed” vs the live camera.
 */
export function VideoFit({
  src,
  variant = 'guest',
  className,
  videoRef,
  controls = true,
}: Props) {
  if (variant === 'modal') {
    return (
      <div className={[styles.modalWrap, className ?? ''].filter(Boolean).join(' ')}>
        <video
          ref={videoRef}
          src={src}
          controls={controls}
          playsInline
          preload="metadata"
          className={styles.modalVideo}
        />
      </div>
    );
  }

  return (
      <div className={[styles.wrap, styles.guestRounded, className ?? ''].filter(Boolean).join(' ')}>
      <video
        ref={videoRef}
        src={src}
        controls={controls}
        playsInline
        preload="metadata"
        className={styles.video}
      />
    </div>
  );
}

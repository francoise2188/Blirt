'use client';

import styles from './VideoFit.module.css';

type Props = {
  src: string;
  /** guest = max-width box, intrinsic aspect from the file (rotation-aware in most browsers); modal = scroll-friendly */
  variant?: 'guest' | 'modal';
  className?: string;
};

/**
 * Playback: let the browser lay out the video from its intrinsic dimensions + rotation
 * metadata. Avoids wrong aspect-ratio boxes from raw videoWidth/height (often landscape
 * pixels for portrait clips), which made playback look “zoomed” vs the live camera.
 */
export function VideoFit({ src, variant = 'guest', className }: Props) {
  if (variant === 'modal') {
    return (
      <div className={[styles.modalWrap, className ?? ''].filter(Boolean).join(' ')}>
        <video
          src={src}
          controls
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
        src={src}
        controls
        playsInline
        preload="metadata"
        className={styles.video}
      />
    </div>
  );
}

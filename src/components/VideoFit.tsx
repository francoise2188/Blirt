'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './VideoFit.module.css';

type Props = {
  src: string;
  /** guest = aspect-ratio box; modal = simple auto height (fits modal scroll) */
  variant?: 'guest' | 'modal';
  className?: string;
};

/**
 * Guest: sizes the container from intrinsic width/height so clips aren’t squashed.
 * Modal: width 100%, height auto, max-height — avoids fighting the modal panel.
 */
export function VideoFit({ src, variant = 'guest', className }: Props) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setDims(null);
  }, [src]);

  const onLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setDims({ w: v.videoWidth, h: v.videoHeight });
    }
  }, []);

  if (variant === 'modal') {
    return (
      <div className={[styles.modalWrap, className ?? ''].filter(Boolean).join(' ')}>
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          className={styles.modalVideo}
          onLoadedMetadata={onLoadedMetadata}
        />
      </div>
    );
  }

  return (
    <div
      className={[
        styles.wrap,
        styles.guestRounded,
        !dims ? styles.wrapPending : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        dims
          ? {
              aspectRatio: `${dims.w} / ${dims.h}`,
            }
          : undefined
      }
    >
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className={styles.video}
        onLoadedMetadata={onLoadedMetadata}
      />
    </div>
  );
}

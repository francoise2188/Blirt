'use client';

import { useEffect, useState } from 'react';
import styles from './TextBlirtEnvelopeCard.module.css';

type BlirtLike = {
  id: string;
  content: string;
  status: string | null;
  created_at: string | null;
  guest_name: string | null;
  prompt_snapshot?: string | null;
};

export type EnvelopeVariant = 'sealed' | 'open-animated' | 'open-instant';

const PAPER = '#FFFFFF';
const EDGE = '#E0DDD8';

/** 56×44 sealed envelope — identical for every text Blirt in the inbox row. */
function SealedEnvelopeGraphic() {
  return (
    <svg
      width="56"
      height="44"
      viewBox="0 0 56 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="2"
        y="8"
        width="52"
        height="32"
        rx="3"
        fill={PAPER}
        stroke={EDGE}
        strokeWidth="1.2"
      />
      <path
        d="M3 10 L28 26 L53 10"
        stroke={EDGE}
        strokeOpacity="0.85"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M2 10 L28 28 L54 10"
        fill={PAPER}
        stroke={EDGE}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <text
        x="28"
        y="22"
        textAnchor="middle"
        fill="#B5CC2E"
        fontSize="12"
        fontWeight="600"
        fontStyle="italic"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        B
      </text>
    </svg>
  );
}

export type TextBlirtEnvelopeCardProps = {
  blirt: BlirtLike;
  variant: EnvelopeVariant;
  /** When true, shows a small “viewed” label — envelope art is unchanged. */
  hasBeenViewed: boolean;
  onToggle: () => void;
};

const FOOTER_DELAY_MS = 1080;

export function TextBlirtEnvelopeCard({
  blirt,
  variant,
  hasBeenViewed,
  onToggle,
}: TextBlirtEnvelopeCardProps) {
  const guest = (blirt.guest_name ?? '').trim();
  const promptLine = (blirt.prompt_snapshot ?? '').trim();
  const st = (blirt.status ?? '').trim().toLowerCase();
  const reviewed = st === 'kept' || st === 'skipped';

  const [footerReady, setFooterReady] = useState(variant === 'open-instant');
  const [flapBehind, setFlapBehind] = useState(variant === 'open-instant');

  useEffect(() => {
    if (variant === 'open-instant') {
      setFooterReady(true);
      setFlapBehind(true);
      return;
    }
    if (variant === 'open-animated') {
      setFooterReady(false);
      setFlapBehind(false);
      const tFlap = window.setTimeout(() => setFlapBehind(true), 740);
      const tFooter = window.setTimeout(() => setFooterReady(true), FOOTER_DELAY_MS);
      return () => {
        window.clearTimeout(tFlap);
        window.clearTimeout(tFooter);
      };
    }
    setFooterReady(false);
    setFlapBehind(false);
  }, [variant]);

  const timeLabel = blirt.created_at
    ? new Date(blirt.created_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  const sceneClass = [
    styles.scene,
    variant === 'open-instant' ? styles.sceneInstant : '',
    variant === 'open-animated' ? styles.scenePlay : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (variant === 'sealed') {
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.sealedButton}
          onClick={onToggle}
          aria-expanded={false}
        >
          <div className={styles.iconWrap}>
            <SealedEnvelopeGraphic />
          </div>
          <div className={styles.meta}>
            <strong>{guest || 'A friend'}</strong>
            {hasBeenViewed ? <span className={styles.viewedLabel}>viewed</span> : null}
            {timeLabel ? <time dateTime={blirt.created_at ?? undefined}>{timeLabel}</time> : null}
          </div>
          <span className={styles.hint}>Tap to open</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.openRoot}>
        <div className={sceneClass}>
          <div className={styles.pocket}>
            <div
              className={[styles.flap, flapBehind ? styles.flapBehind : ''].filter(Boolean).join(' ')}
              aria-hidden
            >
              <div className={styles.flapInner} />
              <div className={styles.flapShade} />
            </div>
            <div className={styles.letterSurface}>
              <div className={styles.letterMeta}>
                <span className={styles.letterMetaGuest}>{guest || 'A friend'}</span>
                {timeLabel ? (
                  <time className={styles.letterMetaTime} dateTime={blirt.created_at ?? undefined}>
                    {timeLabel}
                  </time>
                ) : null}
                {reviewed ? (
                  <span className={styles.statusPill}>{st === 'kept' ? 'Kept' : 'Skipped'}</span>
                ) : null}
              </div>
              {promptLine ? (
                <p className={styles.prompt}>
                  <span className={styles.promptLabel}>Prompt</span>
                  <span className={styles.promptEm}> — </span>
                  <span className={styles.promptText}>{promptLine}</span>
                </p>
              ) : null}
              <p className={styles.body}>{blirt.content}</p>
            </div>
          </div>
        </div>
        {footerReady ? (
          <div className={styles.footer}>
            <button type="button" className={styles.foldBackLink} onClick={onToggle}>
              Fold back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

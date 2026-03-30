import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';

const PRICING_FEATURES = [
  'Unlimited guest Blirts',
  'Video, voice, and text messages',
  'Spotify song dedications',
  'Private host dashboard',
  'Swipe or envelope inbox view',
  'Keepsake PDF collection',
  'Your QR code, ready in minutes',
  'No app download for guests',
] as const;

const CELEBRATION_EVENTS = [
  { emoji: '💍', label: 'Wedding' },
  { emoji: '🎂', label: 'Birthday' },
  { emoji: '🥂', label: 'Anniversary' },
  { emoji: '👰', label: 'Bachelorette' },
  { emoji: '🍾', label: 'Rehearsal Dinner' },
  { emoji: '👶', label: 'Baby Shower' },
  { emoji: '🎓', label: 'Graduation' },
  { emoji: '🎉', label: 'Any celebration' },
] as const;

export const metadata: Metadata = {
  title: 'Blirt — The realest part of any celebration',
  description:
    'Guests leave private video, voice, or text messages from their phones — straight to you. No app. No booth.',
};

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={`${styles.hero} ${styles.grainBand}`} aria-labelledby="landing-headline">
        <div className={styles.heroContent}>
          <p className={styles.wordmark}>Blirt</p>

          <h1 id="landing-headline" className={styles.headline}>
            The realest part of any celebration.
          </h1>

          <p className={styles.subhead}>
            Guests leave private video, voice, or text messages from their phones — straight to you.
            <br />
            No app. No booth. Just the good stuff.
          </p>

          <div className={styles.ctaRow}>
            <Link href="/guest" className={styles.btnPrimary}>
              Try it — leave a demo Blirt
            </Link>
            <Link href="/login" className={styles.btnSecondary}>
              Create your event
            </Link>
          </div>
        </div>

        <div className={styles.phoneStage} aria-hidden="true">
          <div className={styles.phoneFrame}>
            <div className={styles.phoneNotch} />
            <div className={styles.phoneScreen}>
              <div className={styles.phoneImageWrap}>
                <Image
                  src="/landing-guest-phone.png"
                  alt=""
                  fill
                  className={styles.phoneImage}
                  sizes="220px"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.howItWorks} aria-labelledby="how-heading">
        <div className={styles.howCard}>
          <h2 id="how-heading" className={styles.howEyebrow}>
            How it works
          </h2>
          <ol className={styles.howSteps}>
            <li className={styles.howStep}>
              <span className={styles.howEmoji} aria-hidden>
                ✨
              </span>
              <h3 className={styles.howStepTitle}>Set it up in 2 minutes</h3>
              <p className={styles.howStepBody}>
                Pick your prompts, choose your event type, and get your QR code. Done.
              </p>
            </li>
            <li className={styles.howStep}>
              <span className={styles.howEmoji} aria-hidden>
                📲
              </span>
              <h3 className={styles.howStepTitle}>Guests leave a Blirt</h3>
              <p className={styles.howStepBody}>
                They scan, tap record or write, and send. No app download. No account. Just 20 seconds of their
                time.
              </p>
            </li>
            <li className={styles.howStep}>
              <span className={styles.howEmoji} aria-hidden>
                💛
              </span>
              <h3 className={styles.howStepTitle}>Keep what you love</h3>
              <p className={styles.howStepBody}>
                Review privately, keep the ones that matter, skip the rest. Yours forever.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className={`${styles.whatsBlirt} ${styles.grainBand}`} aria-labelledby="whats-blirt-heading">
        <div className={styles.whatsBlirtInner}>
          <h2 id="whats-blirt-heading" className={styles.whatsBlirtTitle}>
            What&apos;s a Blirt, exactly?
          </h2>
          <p className={styles.whatsBlirtBody}>
            It&apos;s what happens when you give someone a quiet moment, a good prompt, and their own phone.
            Forget the designated booth. Forget performing for a crowd. A Blirt is the thing your best friend
            says when she sneaks away from the dance floor at 10pm and just... tells you how she really feels.
          </p>

          <div className={styles.promptScrollWrap}>
            <ul className={styles.promptScroll} aria-label="Example prompts">
              <li className={styles.promptCard}>
                What&apos;s one thing you&apos;ve always wanted to say to them?
              </li>
              <li className={styles.promptCard}>
                Give us your best twerk. Commit to it. 😂
              </li>
              <li className={styles.promptCard}>
                Sing a song that reminds you of them. Any song. Go.
              </li>
            </ul>
            <div className={styles.promptScrollHint} aria-hidden="true">
              <span className={styles.promptScrollArrow}>→</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.celebrations} ${styles.grainBand}`} aria-labelledby="celebrations-heading">
        <div className={styles.celebrationsInner}>
          <h2 id="celebrations-heading" className={styles.celebrationsTitle}>
            Whatever you&apos;re celebrating.
          </h2>
          <p className={styles.celebrationsSub}>
            Blirt works for any event where people love each other and have things to say.
          </p>
          <ul className={styles.eventPills} role="list">
            {CELEBRATION_EVENTS.map(({ emoji, label }) => (
              <li key={label} className={styles.eventPill}>
                <span className={styles.eventPillEmoji} aria-hidden>
                  {emoji}
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${styles.pricing} ${styles.grainBand}`} aria-labelledby="pricing-heading">
        <div className={styles.pricingInner}>
          <div className={styles.pricingCard}>
            <h2 id="pricing-heading" className={styles.pricingEyebrow}>
              Pricing
            </h2>
            <div className={styles.pricingAmount}>
              <p className={styles.pricingLaunchCopy}>
                <strong>Launching soon.</strong> Early events get free access while we grow — sign up to be
                first in line.
              </p>
            </div>
            <ul className={styles.pricingFeatures}>
              {PRICING_FEATURES.map((line) => (
                <li key={line} className={styles.pricingFeature}>
                  <span className={styles.pricingCheck} aria-hidden>
                    ✓
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <Link href="/login" className={styles.pricingCta}>
              Create your event
            </Link>
          </div>
        </div>
      </section>

      <footer className={styles.landingFooter}>
        <p className={styles.footerWordmark}>Blirt</p>
        <p className={styles.footerDomain}>blirt-it.com</p>
        <p className={styles.footerSocial}>
          <a
            href="https://www.instagram.com/blirt_it/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.footerSocialLink}
          >
            @blirt_it
          </a>
          {' on Instagram & '}
          <a
            href="https://www.tiktok.com/@blirtit?is_from_webapp=1&sender_device=pc"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.footerSocialLink}
          >
            @blirtit
          </a>
          {' on TikTok'}
        </p>
        <p className={styles.footerMade}>Made with 💛 in Austin, TX</p>
      </footer>
    </div>
  );
}

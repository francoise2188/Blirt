import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { sanitizePdfText } from '../../lib/sanitizePdfText';
import { formatLetterDate } from '../../lib/textBlirtLetterFormat';

export type KeepsakePdfBlirt = {
  id: string;
  type: string;
  content: string;
  created_at: string | null;
  guest_name: string | null;
  prompt_snapshot?: string | null;
  soundtrack_message_type?: string | null;
  spotify_track_name?: string | null;
  spotify_artist_name?: string | null;
};

const TOKENS = {
  headerBg: '#1a1a2e',
  accentGold: '#c8a96e',
  bodyBg: '#fdfaf7',
  cardBg: '#ffffff',
  cardBorder: '#e8e0d5',
  bodyText: '#2a2420',
  muted: '#b0a090',
  white: '#ffffff',
  whiteMuted: 'rgba(255,255,255,0.72)',
  whiteItalic: 'rgba(255,255,255,0.88)',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'KeepsakeSans',
    backgroundColor: TOKENS.bodyBg,
    paddingBottom: 56,
  },
  header: {
    backgroundColor: TOKENS.headerBg,
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: TOKENS.accentGold,
    opacity: 0.85,
    marginRight: 5,
  },
  dotLast: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: TOKENS.accentGold,
    opacity: 0.85,
  },
  kicker: {
    fontSize: 9,
    letterSpacing: 3.2,
    color: TOKENS.accentGold,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  coupleName: {
    fontFamily: 'KeepsakeSerif',
    fontSize: 26,
    color: TOKENS.white,
    textAlign: 'center',
    marginBottom: 6,
  },
  eventType: {
    fontSize: 9,
    letterSpacing: 2.4,
    color: TOKENS.accentGold,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  eventDate: {
    fontSize: 11,
    color: TOKENS.white,
    opacity: 0.4,
    marginBottom: 14,
  },
  ornament: {
    fontSize: 14,
    color: TOKENS.accentGold,
  },
  body: {
    paddingHorizontal: 32,
    paddingTop: 28,
    flexGrow: 1,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 2.8,
    color: TOKENS.accentGold,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  messageCard: {
    backgroundColor: TOKENS.cardBg,
    borderWidth: 1,
    borderColor: TOKENS.cardBorder,
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  fromLine: {
    fontSize: 8,
    letterSpacing: 1.8,
    color: TOKENS.muted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  messageBody: {
    fontFamily: 'KeepsakeSerif',
    fontSize: 14,
    lineHeight: 1.55,
    color: TOKENS.bodyText,
    marginBottom: 10,
  },
  promptLine: {
    fontFamily: 'KeepsakeSerif',
    fontSize: 12,
    fontStyle: 'italic',
    color: TOKENS.muted,
    marginBottom: 8,
  },
  sentLine: {
    fontSize: 8,
    color: TOKENS.accentGold,
    textAlign: 'right',
    letterSpacing: 0.3,
  },
  songCard: {
    backgroundColor: TOKENS.headerBg,
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  songTitle: {
    fontFamily: 'KeepsakeSerif',
    fontSize: 16,
    color: TOKENS.white,
    marginBottom: 4,
  },
  songArtist: {
    fontSize: 11,
    color: TOKENS.whiteMuted,
    marginBottom: 10,
  },
  songReason: {
    fontFamily: 'KeepsakeSerif',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 1.5,
    color: TOKENS.whiteItalic,
  },
  songMeta: {
    fontSize: 8,
    color: TOKENS.accentGold,
    textAlign: 'right',
    marginTop: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: TOKENS.cardBorder,
    paddingTop: 12,
    alignItems: 'center',
  },
  footerBrand: {
    fontSize: 11,
    letterSpacing: 4,
    color: TOKENS.accentGold,
    marginBottom: 4,
  },
  footerSub: {
    fontSize: 8,
    color: TOKENS.muted,
  },
});

function displayCoupleName(partner1: string | null, partner2: string | null): string {
  const a = sanitizePdfText((partner1 ?? '').trim());
  const b = sanitizePdfText((partner2 ?? '').trim());
  if (a && b) return `${a} & ${b}`;
  return a || b || 'Your celebration';
}

function guestLabel(name: string | null | undefined): string {
  const t = sanitizePdfText((name ?? '').trim());
  return t ? t.toUpperCase() : 'A FRIEND';
}

function messageBodyForBlirt(b: KeepsakePdfBlirt): string {
  const t = (b.type || '').toLowerCase();
  if (t === 'text') return sanitizePdfText((b.content ?? '').trim());
  if (t === 'video') return 'Video message — open your file export for the recording.';
  if (t === 'audio') return 'Voice message — open your file export for the recording.';
  return sanitizePdfText((b.content ?? '').trim());
}

function songReasonText(b: KeepsakePdfBlirt): string {
  const mt = (b.soundtrack_message_type ?? 'text').toLowerCase();
  if (mt === 'text') return sanitizePdfText((b.content ?? '').trim()) || '—';
  return 'This dedication includes a recorded video or voice message. Download your ZIP for the full file.';
}

export function KeepsakePdfDocument({
  partner1,
  partner2,
  eventType,
  eventDate,
  blirts,
}: {
  partner1: string | null;
  partner2: string | null;
  eventType: string | null;
  eventDate: string | null;
  blirts: KeepsakePdfBlirt[];
}) {
  const couple = displayCoupleName(partner1, partner2);
  const typeLine = sanitizePdfText((eventType ?? '').trim()) || 'Celebration';
  const dateLine = eventDate ? sanitizePdfText(formatLetterDate(eventDate)) : '';

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} wrap={false}>
          <View style={styles.dotsRow}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dotLast} />
          </View>
          <Text style={styles.kicker}>A BLIRT KEEPSAKE</Text>
          <Text style={styles.coupleName}>{couple}</Text>
          <Text style={styles.eventType}>{typeLine}</Text>
          {dateLine ? <Text style={styles.eventDate}>{dateLine}</Text> : <View style={{ height: 4 }} />}
          {/* Latin-subset fonts omit many symbols (e.g. ✦); keep ornament in basic Unicode. */}
          <Text style={styles.ornament}>· · ·</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>MESSAGES FROM YOUR PEOPLE</Text>
          {blirts.map((b) => {
            const t = (b.type || '').toLowerCase();
            if (t === 'soundtrack') {
              const title = sanitizePdfText((b.spotify_track_name ?? '').trim()) || 'Song';
              const artist = sanitizePdfText((b.spotify_artist_name ?? '').trim()) || 'Artist';
              return (
                <View key={b.id} style={styles.songCard} wrap={false}>
                  <Text style={styles.songTitle}>{title}</Text>
                  <Text style={styles.songArtist}>{artist}</Text>
                  <Text style={styles.songReason}>{songReasonText(b)}</Text>
                  <Text style={styles.songMeta}>
                    From {guestLabel(b.guest_name)} · {formatLetterDate(b.created_at)}
                  </Text>
                </View>
              );
            }
            const prompt = sanitizePdfText((b.prompt_snapshot ?? '').trim());
            const body = messageBodyForBlirt(b);
            return (
              <View key={b.id} style={styles.messageCard} wrap={false}>
                <Text style={styles.fromLine}>FROM {guestLabel(b.guest_name)}</Text>
                {prompt ? <Text style={styles.promptLine}>{prompt}</Text> : null}
                <Text style={styles.messageBody}>{body}</Text>
                <Text style={styles.sentLine}>Sent via Blirt · {formatLetterDate(b.created_at)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerBrand}>blirt</Text>
          <Text style={styles.footerSub}>Collected at your event · blirt-it.com</Text>
        </View>
      </Page>
    </Document>
  );
}

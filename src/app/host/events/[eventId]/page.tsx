'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../../../lib/supabaseClient';
import { getExperiencePageUrl } from '../../../../lib/experienceUrl';
import { getGuestPageUrl } from '../../../../lib/guestUrl';
import {
  defaultGuestSlug,
  isReservedGuestSlug,
  normalizeGuestSlugInput,
} from '../../../../lib/guestSlug';
import {
  downloadPngDataUrl,
  openQrPrintSheet,
  svgQrToPngDataUrl,
} from '../../../../lib/qrExport';
import { downloadPrintCard, downloadQRCodeAsPng } from '../../../../lib/blirtQrDownloads';
import { collectionPdfFilename } from '../../../../lib/exportBlirtsCollectionPdf';
import { buildBlirtsZip } from '../../../../lib/exportBlirtsZip';
import {
  friendlyBlirtStorageError,
  normalizeBlirtMediaStoragePath,
} from '../../../../lib/blirtsStoragePath';
import { VideoFit } from '../../../../components/VideoFit';
import HostSoundtrackInboxPlayback from '../../../../components/HostSoundtrackInboxPlayback';
import {
  getProxiedDeezerPreviewUrl,
  SONG_DEDICATION_PLACEHOLDER_ART,
} from '../../../../lib/songDedication';
import { HostBlirtSwipeDeck } from '../../../../components/HostBlirtSwipeDeck';
import {
  HostSoundtrackTab,
  formatPlaylistEventDate,
} from '../../../../components/HostSoundtrackTab';
import {
  TextBlirtEnvelopeCard,
  type EnvelopeVariant,
} from '../../../../components/TextBlirtEnvelopeCard';
import { getPromptLibraryForEventType } from '../../../../lib/promptLibrary';
import styles from '../../host.module.css';

const SOUNDTRACK_PROMPT = 'This song reminds me of you because...';

type Tab = 'blirts' | 'share' | 'prompts' | 'soundtrack';

type EventRow = {
  id: string;
  partner_1: string | null;
  partner_2: string | null;
  /** Pretty guest path: /ashley-birthday */
  guest_slug?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  prompts: string[] | null;
  prompt_randomize: boolean | null;
  /** Legacy / alternate host column */
  owner_id?: string | null;
  /** Common Supabase name for the creating user */
  user_id?: string | null;
};

function isEventOwner(ev: EventRow, uid: string) {
  const byUser = ev.user_id && ev.user_id === uid;
  const byOwner = ev.owner_id && ev.owner_id === uid;
  return Boolean(byUser || byOwner);
}

type BlirtRow = {
  id: string;
  event_id: string;
  type: string;
  content: string;
  status: string | null;
  created_at: string | null;
  guest_name: string | null;
  prompt_snapshot?: string | null;
  soundtrack_message_type?: 'video' | 'audio' | 'text' | null;
  spotify_track_id?: string | null;
  spotify_track_name?: string | null;
  spotify_artist_name?: string | null;
  spotify_album_name?: string | null;
  spotify_album_art_url?: string | null;
  spotify_preview_url?: string | null;
};

function escapeCsv(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function displayEventNames(a: string | null, b: string | null) {
  const first = (a ?? '').trim();
  const second = (b ?? '').trim();
  if (first && second) return `${first} & ${second}`;
  if (first) return first;
  if (second) return second;
  return 'Untitled event';
}

const ENVELOPE_OPEN_STORAGE = 'blirt-env-opened-v1';

/** Host inbox: envelopes list vs swipe deck — persisted in the browser. */
const HOST_INBOX_VIEW_KEY = 'blirt-host-inbox-view';

function loadEnvelopeOpenedIds(eventId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(`${ENVELOPE_OPEN_STORAGE}:${eventId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveEnvelopeOpenedIds(eventId: string, ids: Set<string>) {
  try {
    localStorage.setItem(`${ENVELOPE_OPEN_STORAGE}:${eventId}`, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

const TEXT_VIEWED_STORAGE = 'blirt-text-viewed-v1';

function loadTextViewedIds(eventId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(`${TEXT_VIEWED_STORAGE}:${eventId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveTextViewedIds(eventId: string, ids: Set<string>) {
  try {
    localStorage.setItem(`${TEXT_VIEWED_STORAGE}:${eventId}`, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function textBlirtHasBeenViewed(b: BlirtRow, viewedIds: Set<string>): boolean {
  const st = (b.status ?? '').toLowerCase();
  if (st === 'kept' || st === 'skipped') return true;
  return viewedIds.has(b.id);
}

function envelopeVariantFor(
  b: BlirtRow,
  openIds: Set<string>,
  playId: string | null,
  collapsedIds: Set<string>,
): EnvelopeVariant {
  const t = (b.type || '').toLowerCase();
  if (t !== 'text') return 'sealed';
  if (collapsedIds.has(b.id)) return 'sealed';
  const st = (b.status ?? '').toLowerCase();
  const open = openIds.has(b.id) || st === 'kept' || st === 'skipped';
  if (!open) return 'sealed';
  if (playId === b.id) return 'open-animated';
  return 'open-instant';
}

export default function HostEventManagePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('blirts');

  const [event, setEvent] = useState<EventRow | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);

  const [blirts, setBlirts] = useState<BlirtRow[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  /** When signed URL fails (e.g. Storage RLS), we show the error instead of endless "Loading…". */
  const [mediaUrlErrors, setMediaUrlErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Inbox: export/delete/help hidden until "Download collection" is opened. */
  const [collectionToolsOpen, setCollectionToolsOpen] = useState(false);
  const [inboxView, setInboxView] = useState<'envelopes' | 'swipe'>('envelopes');
  const [viewerBlirt, setViewerBlirt] = useState<BlirtRow | null>(null);
  /** Deezer proxy URL for inbox intro (same as guest search). */
  const [hostInboxDeezerPreviewUrl, setHostInboxDeezerPreviewUrl] = useState<string | null>(null);
  const [hostInboxPreviewLoading, setHostInboxPreviewLoading] = useState(false);
  const [openEnvelopeIds, setOpenEnvelopeIds] = useState<Set<string>>(() => new Set());
  const [envelopeCollapsedIds, setEnvelopeCollapsedIds] = useState<Set<string>>(() => new Set());
  const [envelopePlayId, setEnvelopePlayId] = useState<string | null>(null);
  const [viewedTextEnvelopeIds, setViewedTextEnvelopeIds] = useState<Set<string>>(() => new Set());

  /** All selected prompt lines saved to events.prompts */
  const [promptPool, setPromptPool] = useState<string[]>([]);
  const [promptRandom, setPromptRandom] = useState(true);
  const [promptStatus, setPromptStatus] = useState<string | null>(null);
  const [savingPrompts, setSavingPrompts] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [zipExporting, setZipExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement | null>(null);
  const experienceQrWrapRef = useRef<HTMLDivElement | null>(null);

  const [slugDraft, setSlugDraft] = useState('');
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugStatus, setSlugStatus] = useState<string | null>(null);

  const guestUrl = useMemo(
    () => getGuestPageUrl(eventId, { guestSlug: event?.guest_slug ?? null }),
    [eventId, event?.guest_slug],
  );
  /** Full URL for QR (keepsake web experience — kept soundtrack Blirts). */
  const experienceUrl = useMemo(() => getExperiencePageUrl(eventId), [eventId]);
  const eventTitleForFiles = useMemo(
    () => displayEventNames(event?.partner_1 ?? null, event?.partner_2 ?? null),
    [event?.partner_1, event?.partner_2],
  );

  const hasAnySoundtrackBlirt = useMemo(
    () => blirts.some((b) => (b.type || '').toLowerCase() === 'soundtrack'),
    [blirts],
  );

  const keptSoundtrackBlirts = useMemo(() => {
    return blirts
      .filter(
        (b) =>
          (b.type || '').toLowerCase() === 'soundtrack' &&
          (b.status ?? '').toLowerCase() === 'kept',
      )
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      });
  }, [blirts]);

  const playlistEventDateLine = useMemo(
    () => formatPlaylistEventDate(event?.event_date ?? null),
    [event?.event_date],
  );

  const loadBlirts = useCallback(async () => {
    if (!supabase || !eventId) return;
    const { data, error } = await supabase
      .from('blirts')
      .select(
        'id, event_id, type, content, status, created_at, guest_name, prompt_snapshot, soundtrack_message_type, spotify_track_id, spotify_track_name, spotify_artist_name, spotify_album_name, spotify_album_art_url, spotify_preview_url',
      )
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) return;
    setBlirts((data ?? []) as BlirtRow[]);
  }, [eventId]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (!session?.user) router.replace('/login');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) router.replace('/login');
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!supabase || !user || !eventId) return;
    (async () => {
      const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (error || !data) {
        setEventError(error?.message ?? 'Event not found.');
        return;
      }
      const ev = data as EventRow;
      if (!isEventOwner(ev, user.id)) {
        setEventError('You do not have access to this event.');
        return;
      }
      setEvent(ev);
      setSlugDraft((ev.guest_slug ?? '').trim());
      setSlugStatus(null);
      const existing = (Array.isArray(ev.prompts) ? ev.prompts : [])
        .map((s) => String(s).trim())
        .filter(Boolean);
      setPromptPool(existing);
      setPromptRandom(ev.prompt_randomize !== false);
    })();
  }, [user, eventId]);

  useEffect(() => {
    loadBlirts();
  }, [loadBlirts]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(HOST_INBOX_VIEW_KEY);
      if (v === 'swipe' || v === 'envelopes') setInboxView(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HOST_INBOX_VIEW_KEY, inboxView);
    } catch {
      /* ignore */
    }
  }, [inboxView]);

  useEffect(() => {
    if (tab === 'soundtrack' && !hasAnySoundtrackBlirt) setTab('blirts');
  }, [tab, hasAnySoundtrackBlirt]);

  useEffect(() => {
    if (!eventId) return;
    setOpenEnvelopeIds(loadEnvelopeOpenedIds(eventId));
    const opened = loadEnvelopeOpenedIds(eventId);
    const viewed = loadTextViewedIds(eventId);
    const merged = new Set<string>([...viewed, ...opened]);
    setViewedTextEnvelopeIds(merged);
    if (merged.size > viewed.size) {
      saveTextViewedIds(eventId, merged);
    }
  }, [eventId]);

  useEffect(() => {
    setOpenEnvelopeIds((prev) => {
      const next = new Set(prev);
      for (const b of blirts) {
        const t = (b.type || '').toLowerCase();
        const st = (b.status ?? '').toLowerCase();
        if (t === 'text' && (st === 'kept' || st === 'skipped')) {
          next.add(b.id);
        }
      }
      return next;
    });
  }, [blirts]);

  useEffect(() => {
    if (!eventId) return;
    setViewedTextEnvelopeIds((prev) => {
      const next = new Set(prev);
      for (const b of blirts) {
        const t = (b.type || '').toLowerCase();
        const st = (b.status ?? '').toLowerCase();
        if (t === 'text' && (st === 'kept' || st === 'skipped')) {
          next.add(b.id);
        }
      }
      if (next.size !== prev.size) {
        saveTextViewedIds(eventId, next);
      }
      return next;
    });
  }, [blirts, eventId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewerBlirt(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const vb = viewerBlirt;
    if (!vb || (vb.type || '').toLowerCase() !== 'soundtrack') {
      setHostInboxDeezerPreviewUrl(null);
      setHostInboxPreviewLoading(false);
      return;
    }
    const name = (vb.spotify_track_name ?? '').trim();
    const artist = (vb.spotify_artist_name ?? '').trim();
    if (!name || !artist) {
      setHostInboxDeezerPreviewUrl(null);
      setHostInboxPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setHostInboxPreviewLoading(true);
    setHostInboxDeezerPreviewUrl(null);
    void getProxiedDeezerPreviewUrl(name, artist).then((url) => {
      if (!cancelled) {
        setHostInboxDeezerPreviewUrl(url);
        setHostInboxPreviewLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [viewerBlirt]);

  useEffect(() => {
    if (!supabase || !blirts.length) {
      setMediaUrls({});
      setMediaUrlErrors({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      const nextErr: Record<string, string> = {};
      for (const b of blirts) {
        const t = (b.type || '').toLowerCase();
        const mediaPath = normalizeBlirtMediaStoragePath(b.content);
        const soundtrackKind = (b.soundtrack_message_type || '').toLowerCase();
        const needsSigned =
          (t === 'video' || t === 'audio') ||
          (t === 'soundtrack' && (soundtrackKind === 'video' || soundtrackKind === 'audio'));
        if (needsSigned && mediaPath.includes('/')) {
          const { data, error } = await supabase.storage
            .from('blirts-media')
            .createSignedUrl(mediaPath, 7200);
          if (error) {
            nextErr[b.id] = error.message;
          } else if (data?.signedUrl) {
            next[b.id] = data.signedUrl;
          } else {
            nextErr[b.id] = 'No download link returned.';
          }
        }
      }
      if (!cancelled) {
        setMediaUrls(next);
        setMediaUrlErrors(nextErr);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blirts]);

  function toggleTextEnvelope(b: BlirtRow) {
    const t = (b.type || '').toLowerCase();
    if (t !== 'text') return;
    const st = (b.status ?? '').toLowerCase();
    const pending = st === 'pending' || !st || st === '';
    const expanded =
      !envelopeCollapsedIds.has(b.id) &&
      (openEnvelopeIds.has(b.id) || st === 'kept' || st === 'skipped');

    if (expanded) {
      if (pending) {
        setOpenEnvelopeIds((prev) => {
          const next = new Set(prev);
          next.delete(b.id);
          if (eventId) saveEnvelopeOpenedIds(eventId, next);
          return next;
        });
      } else {
        setEnvelopeCollapsedIds((prev) => {
          const next = new Set(prev);
          next.add(b.id);
          return next;
        });
      }
      return;
    }

    setEnvelopeCollapsedIds((prev) => {
      if (!prev.has(b.id)) return prev;
      const next = new Set(prev);
      next.delete(b.id);
      return next;
    });
    setEnvelopePlayId(b.id);
    setOpenEnvelopeIds((prev) => {
      const next = new Set(prev);
      next.add(b.id);
      if (eventId) saveEnvelopeOpenedIds(eventId, next);
      return next;
    });
    setViewedTextEnvelopeIds((prev) => {
      const next = new Set(prev);
      next.add(b.id);
      if (eventId) saveTextViewedIds(eventId, next);
      return next;
    });
    window.setTimeout(() => {
      setEnvelopePlayId((cur) => (cur === b.id ? null : cur));
    }, 1120);
  }

  async function keepBlirt(b: BlirtRow): Promise<boolean> {
    if (!supabase) return false;
    const st = (b.status ?? '').toLowerCase();
    if (st === 'kept') return true;
    setBusyId(b.id);
    const { error } = await supabase.from('blirts').update({ status: 'kept' }).eq('id', b.id);
    setBusyId(null);
    if (error) {
      window.alert(error.message);
      return false;
    }
    await loadBlirts();
    return true;
  }

  async function deleteBlirt(b: BlirtRow, opts?: { confirmMessage?: string; skipConfirm?: boolean }) {
    if (!supabase || bulkDeleting) return;
    if (!opts?.skipConfirm) {
      const ok = window.confirm(opts?.confirmMessage ?? 'Delete this Blirt permanently?');
      if (!ok) return;
    }
    setBusyId(b.id);
    const t = (b.type || '').toLowerCase();
    const mediaPath = normalizeBlirtMediaStoragePath(b.content);
    if ((t === 'video' || t === 'audio') && mediaPath.includes('/')) {
      await supabase.storage.from('blirts-media').remove([mediaPath]);
    }
    await supabase.from('blirts').delete().eq('id', b.id);
    setBusyId(null);
    setViewerBlirt((prev) => (prev?.id === b.id ? null : prev));
    setSelectedIds((prev) => prev.filter((id) => id !== b.id));
    setOpenEnvelopeIds((prev) => {
      const next = new Set(prev);
      next.delete(b.id);
      if (eventId) saveEnvelopeOpenedIds(eventId, next);
      return next;
    });
    setEnvelopeCollapsedIds((prev) => {
      const next = new Set(prev);
      next.delete(b.id);
      return next;
    });
    setViewedTextEnvelopeIds((prev) => {
      const next = new Set(prev);
      next.delete(b.id);
      if (eventId) saveTextViewedIds(eventId, next);
      return next;
    });
    loadBlirts();
  }

  async function deleteBlirtsBulk(items: BlirtRow[]) {
    if (!supabase || !items.length || bulkDeleting) return;
    const n = items.length;
    const ok = window.confirm(
      n === 1
        ? 'Delete this Blirt permanently? This cannot be undone.'
        : `Delete ${n} Blirts permanently? This cannot be undone.`,
    );
    if (!ok) return;
    setBulkDeleting(true);
    try {
      const ids = items.map((b) => b.id);
      const paths: string[] = [];
      for (const b of items) {
        const t = (b.type || '').toLowerCase();
        const mediaPath = normalizeBlirtMediaStoragePath(b.content);
        if ((t === 'video' || t === 'audio') && mediaPath.includes('/')) {
          paths.push(mediaPath);
        }
      }
      if (paths.length) {
        const { error: stoErr } = await supabase.storage.from('blirts-media').remove(paths);
        if (stoErr) {
          window.alert(`Could not remove all files from storage: ${stoErr.message}`);
          return;
        }
      }
      const { error } = await supabase.from('blirts').delete().in('id', ids);
      if (error) {
        window.alert(error.message);
        return;
      }
      setViewerBlirt((prev) => (prev && ids.includes(prev.id) ? null : prev));
      setSelectedIds([]);
      setOpenEnvelopeIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        if (eventId) saveEnvelopeOpenedIds(eventId, next);
        return next;
      });
      setEnvelopeCollapsedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setViewedTextEnvelopeIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        if (eventId) saveTextViewedIds(eventId, next);
        return next;
      });
      loadBlirts();
    } finally {
      setBulkDeleting(false);
    }
  }

  const allSelected = blirts.length > 0 && selectedIds.length === blirts.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(blirts.map((b) => b.id));
  }

  function qrDownloadSlug(): string {
    return eventTitleForFiles
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  async function downloadQrPng() {
    setQrBusy(true);
    try {
      const slug = qrDownloadSlug();
      await downloadQRCodeAsPng(guestUrl, {
        width: 1200,
        filename: `blirt-qr-${slug || eventId}.png`,
      });
    } catch {
      window.alert('Could not build the image. Try another browser or update your browser.');
    } finally {
      setQrBusy(false);
    }
  }

  async function downloadExperienceQrPng() {
    setQrBusy(true);
    try {
      const slug = qrDownloadSlug();
      await downloadQRCodeAsPng(experienceUrl, {
        width: 1200,
        filename: `blirt-experience-qr-${slug || eventId.slice(0, 8)}.png`,
      });
    } catch {
      window.alert('Could not build the image. Try another browser or update your browser.');
    } finally {
      setQrBusy(false);
    }
  }

  async function downloadBlirtPrintCardPdf() {
    setQrBusy(true);
    try {
      const slug = qrDownloadSlug();
      await downloadPrintCard(guestUrl, eventTitleForFiles, {
        filename: `blirt-print-card-${slug || eventId.slice(0, 8)}.pdf`,
      });
    } catch {
      window.alert('Could not build the print card. Try another browser or update your browser.');
    } finally {
      setQrBusy(false);
    }
  }

  async function printQrSheet() {
    const svg = qrWrapRef.current?.querySelector('svg');
    if (!svg) {
      window.alert('QR code is not ready yet.');
      return;
    }
    setQrBusy(true);
    try {
      const png = await svgQrToPngDataUrl(svg, 1200);
      openQrPrintSheet({
        documentTitle: `Blirt QR — ${eventTitleForFiles}`,
        headline: eventTitleForFiles,
        guestUrl,
        pngDataUrl: png,
      });
    } catch {
      window.alert('Could not prepare print. Try Download QR instead.');
    } finally {
      setQrBusy(false);
    }
  }

  async function printExperienceQrSheet() {
    const svg = experienceQrWrapRef.current?.querySelector('svg');
    if (!svg) {
      window.alert('QR code is not ready yet.');
      return;
    }
    setQrBusy(true);
    try {
      const png = await svgQrToPngDataUrl(svg, 1200);
      openQrPrintSheet({
        documentTitle: `Blirt experience — ${eventTitleForFiles}`,
        headline: `${eventTitleForFiles} — relive messages & songs`,
        guestUrl: experienceUrl,
        pngDataUrl: png,
      });
    } catch {
      window.alert('Could not prepare print. Try Download QR instead.');
    } finally {
      setQrBusy(false);
    }
  }

  async function exportCsvForBlirts(items: BlirtRow[], fileSuffix: string) {
    if (!supabase) return;
    if (!items.length) {
      window.alert('Nothing to export.');
      return;
    }
    setExporting(true);
    try {
      const rows = [
        [
          'id',
          'type',
          'guest_name',
          'prompt_snapshot',
          'status',
          'created_at',
          'message_text_or_storage_path',
          'media_download_link_24h',
          'link_error_if_any',
        ],
      ];
      for (const b of items) {
        const t = (b.type || '').toLowerCase();
        let signed = '';
        let linkErr = '';
        const mediaPath = normalizeBlirtMediaStoragePath(b.content);
        if ((t === 'video' || t === 'audio') && mediaPath.includes('/')) {
          const { data, error } = await supabase.storage
            .from('blirts-media')
            .createSignedUrl(mediaPath, 86400);
          if (error) linkErr = error.message;
          signed = data?.signedUrl ?? '';
        }
        rows.push([
          b.id,
          b.type,
          b.guest_name ?? '',
          (b.prompt_snapshot ?? '').trim(),
          b.status ?? '',
          b.created_at ?? '',
          b.content,
          signed,
          linkErr,
        ]);
      }
      const csvBody = rows.map((r) => r.map((c) => escapeCsv(String(c))).join(',')).join('\n');
      const csv = `\ufeff${csvBody}`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `blirts-${eventId.slice(0, 8)}${fileSuffix}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  async function exportCsvAll() {
    await exportCsvForBlirts(blirts, '-all');
  }

  async function exportCsvSelected() {
    const items = blirts.filter((b) => selectedIds.includes(b.id));
    await exportCsvForBlirts(items, '-selected');
  }

  async function exportZipForBlirts(items: BlirtRow[], fileSuffix: string) {
    if (!supabase) return;
    if (!items.length) {
      window.alert('Nothing to export.');
      return;
    }
    setZipExporting(true);
    try {
      const { blob, skipped } = await buildBlirtsZip({
        supabase,
        items,
        eventId,
        eventDisplayName: event
          ? displayEventNames(event.partner_1, event.partner_2)
          : 'Your event',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `blirts-media-${eventId.slice(0, 8)}${fileSuffix}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      if (skipped.length) {
        window.alert(
          `ZIP created. Some files could not be downloaded (${skipped.length}). Check any MISSING-*.txt files inside the ZIP.`,
        );
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not build ZIP.');
    } finally {
      setZipExporting(false);
    }
  }

  async function exportZipAll() {
    await exportZipForBlirts(blirts, '-all');
  }

  async function exportZipSelected() {
    const items = blirts.filter((b) => selectedIds.includes(b.id));
    await exportZipForBlirts(items, '-selected');
  }

  async function exportCollectionPdf() {
    if (!event) {
      window.alert('Still loading this event — try again in a moment.');
      return;
    }
    if (!supabase) {
      window.alert(
        'Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). PDF export needs a working connection.',
      );
      return;
    }
    if (!blirts.length) {
      window.alert('Nothing to export yet — add some Blirts first, or check that you opened the right event.');
      return;
    }
    setPdfExporting(true);
    await new Promise((r) => setTimeout(r, 50));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        window.alert('Please sign in again to download your keepsake PDF.');
        return;
      }
      const res = await fetch(`/api/keepsake-pdf?eventId=${encodeURIComponent(eventId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || res.statusText || 'Could not build PDF.');
      }
      const blob = await res.blob();
      const name = collectionPdfFilename(displayEventNames(event.partner_1, event.partner_2));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error('Keepsake PDF export failed', e);
      window.alert(
        e instanceof Error ? e.message : 'Could not build PDF. If this keeps happening, try a different browser.',
      );
    } finally {
      setPdfExporting(false);
    }
  }

  async function saveGuestSlug() {
    if (!supabase || !eventId || !event) return;
    setSlugStatus(null);
    const normalized = normalizeGuestSlugInput(slugDraft);
    if (!normalized) {
      setSlugStatus('Enter a short URL name (letters and numbers).');
      return;
    }
    if (isReservedGuestSlug(normalized)) {
      setSlugStatus('That URL is reserved. Pick another.');
      return;
    }
    setSlugSaving(true);
    try {
      const { data: clash, error: clashErr } = await supabase
        .from('events')
        .select('id')
        .eq('guest_slug', normalized)
        .maybeSingle();
      if (clashErr) {
        setSlugStatus(clashErr.message);
        return;
      }
      if (clash?.id && clash.id !== eventId) {
        setSlugStatus('That URL is already taken by another event.');
        return;
      }
      const { error } = await supabase
        .from('events')
        .update({ guest_slug: normalized })
        .eq('id', eventId);
      if (error) {
        setSlugStatus(error.message);
        return;
      }
      setEvent((prev) => (prev ? { ...prev, guest_slug: normalized } : prev));
      setSlugStatus('Saved!');
    } finally {
      setSlugSaving(false);
    }
  }

  async function savePrompts() {
    if (!supabase || !eventId) return;
    setPromptStatus(null);
    const lines = promptPool.map((l) => l.trim()).filter(Boolean);
    if (!lines.length) {
      setPromptStatus('Pick at least one prompt.');
      return;
    }
    setSavingPrompts(true);
    const { error } = await supabase
      .from('events')
      .update({
        prompts: lines,
        prompt_randomize: promptRandom,
      })
      .eq('id', eventId);
    setSavingPrompts(false);
    if (error) setPromptStatus(error.message);
    else setPromptStatus('Saved!');
  }

  const promptLibrary = useMemo(
    () => (event ? getPromptLibraryForEventType(event.event_type) : null),
    [event]
  );

  const viewerUrl = viewerBlirt ? mediaUrls[viewerBlirt.id] : undefined;
  const viewerMediaError = viewerBlirt ? mediaUrlErrors[viewerBlirt.id] : undefined;

  function togglePoolPrompt(text: string) {
    setPromptStatus(null);
    setPromptPool((prev) => {
      if (prev.includes(text)) return prev.filter((t) => t !== text);
      return [...prev, text];
    });
  }

  function previewPromptForHost(template: string) {
    if (!event) return template;
    const p1 = (event.partner_1 ?? '').trim();
    const p2 = (event.partner_2 ?? '').trim();
    const primary = p1 || p2 || 'Name';
    const chosen = p1 && p2 ? p1 : primary;
    return template
      .replaceAll('[Name]', primary)
      .replaceAll('[name]', chosen)
      .replaceAll('[Partner 1]', p1 || primary)
      .replaceAll('[Partner 2]', p2 || primary)
      .replaceAll('{partner_1}', p1 || primary)
      .replaceAll('{partner_2}', p2 || primary)
      .replaceAll('{a}', p1 || primary)
      .replaceAll('{b}', p2 || primary);
  }

  if (authLoading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.muted}>Loading…</p>
      </div>
    );
  }
  if (!user) return null;

  if (eventError || !event) {
    return (
      <div className={styles.wrap}>
        <div className={styles.error}>{eventError ?? 'Loading event…'}</div>
        <Link href="/host" className={styles.link}>
          ← Back to events
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <div className={styles.brand}>Blirt</div>
        <div className={styles.links}>
          <Link href="/host" className={styles.link}>
            All events
          </Link>
        </div>
      </div>

      <h1 className={styles.h1}>{displayEventNames(event.partner_1, event.partner_2)}</h1>
      <p className={styles.muted} style={{ marginBottom: 16 }}>
        Host tools for this event
        {event.event_type ? ` • ${event.event_type}` : ''}
      </p>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'blirts' ? styles.tabActive : ''}`}
          onClick={() => setTab('blirts')}
        >
          Inbox &amp; media
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'share' ? styles.tabActive : ''}`}
          onClick={() => setTab('share')}
        >
          Guest link &amp; QR
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'prompts' ? styles.tabActive : ''}`}
          onClick={() => setTab('prompts')}
        >
          Prompts &amp; themes
        </button>
        {hasAnySoundtrackBlirt ? (
          <button
            type="button"
            className={`${styles.tab} ${tab === 'soundtrack' ? styles.tabActive : ''}`}
            onClick={() => setTab('soundtrack')}
          >
            🎵 Soundtrack ({keptSoundtrackBlirts.length})
          </button>
        ) : null}
      </div>

      {tab === 'blirts' && (
        <div className={styles.card}>
          <div className={styles.blirtsInboxHeader}>
            <h2 className={styles.blirtsInboxTitle}>Blirts ({blirts.length})</h2>
            <button
              type="button"
              className={styles.collectionManageToggle}
              aria-expanded={collectionToolsOpen}
              aria-controls="host-collection-tools"
              id="host-collection-tools-toggle"
              onClick={() => setCollectionToolsOpen((o) => !o)}
            >
              Download collection {collectionToolsOpen ? '▴' : '▾'}
            </button>
          </div>
          <div className={styles.inboxViewToggle} role="tablist" aria-label="Inbox layout">
            <button
              type="button"
              role="tab"
              aria-selected={inboxView === 'envelopes'}
              className={`${styles.inboxViewToggleOpt} ${
                inboxView === 'envelopes' ? styles.inboxViewToggleActive : ''
              }`}
              onClick={() => setInboxView('envelopes')}
            >
              💌 Envelopes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inboxView === 'swipe'}
              className={`${styles.inboxViewToggleOpt} ${
                inboxView === 'swipe' ? styles.inboxViewToggleActive : ''
              }`}
              onClick={() => setInboxView('swipe')}
            >
              📱 Swipe
            </button>
          </div>
          {collectionToolsOpen ? (
            <div
              className={styles.collectionManagePanel}
              id="host-collection-tools"
              role="region"
              aria-labelledby="host-collection-tools-toggle"
            >
              <div className={styles.keepsakePanel}>
                <p className={styles.keepsakeLead}>
                  Save your Blirts as a keepsake: a beautiful PDF, your original files, or a spreadsheet. Use the
                  checkboxes on each row to limit CSV and ZIP to specific messages — otherwise they include
                  everything.
                </p>
                {Object.keys(mediaUrlErrors).length > 0 ? (
                  <p className={styles.muted} role="status" style={{ marginBottom: 14 }}>
                    A few messages couldn&apos;t load their recording — usually the file never finished uploading. You can
                    delete those rows if you don&apos;t need them. The Keepsake PDF does not include embedded video, voice,
                    or song audio; to get those files, open the <strong>Soundtrack</strong> tab or download{' '}
                    <strong>Original files</strong> (ZIP) in the buttons below.
                  </p>
                ) : null}
                {blirts.length > 0 ? (
                  <label className={styles.keepsakeSelectAll}>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    <span>Select all rows</span>
                  </label>
                ) : null}

                <div className={styles.keepsakeGrid}>
                  <button
                    type="button"
                    className={styles.keepsakeCard}
                    onClick={() => void exportCollectionPdf()}
                    disabled={pdfExporting || exporting || zipExporting || bulkDeleting || blirts.length === 0}
                    title={blirts.length === 0 ? 'Add Blirts first' : undefined}
                  >
                    <span className={styles.keepsakeCardKicker}>Keepsake</span>
                    <span className={styles.keepsakeCardTitle}>
                      {pdfExporting ? 'Creating…' : 'Keepsake PDF'}
                    </span>
                    <span className={styles.keepsakeCardDesc}>
                      Messages and media links in one readable document — perfect to save or print.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.keepsakeCard}
                    onClick={() =>
                      void (selectedIds.length > 0 ? exportCsvSelected() : exportCsvAll())
                    }
                    disabled={exporting || zipExporting || pdfExporting || bulkDeleting || blirts.length === 0}
                  >
                    <span className={styles.keepsakeCardKicker}>Data</span>
                    <span className={styles.keepsakeCardTitle}>
                      {exporting ? 'Working…' : 'Spreadsheet'}
                    </span>
                    <span className={styles.keepsakeCardDesc}>
                      {selectedIds.length > 0
                        ? `CSV · ${selectedIds.length} selected row${selectedIds.length === 1 ? '' : 's'}`
                        : 'CSV · entire collection (pick rows above to narrow)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.keepsakeCard}
                    onClick={() =>
                      void (selectedIds.length > 0 ? exportZipSelected() : exportZipAll())
                    }
                    disabled={zipExporting || exporting || pdfExporting || bulkDeleting || blirts.length === 0}
                  >
                    <span className={styles.keepsakeCardKicker}>Files</span>
                    <span className={styles.keepsakeCardTitle}>
                      {zipExporting ? 'Zipping…' : 'Original files'}
                    </span>
                    <span className={styles.keepsakeCardDesc}>
                      {selectedIds.length > 0
                        ? `ZIP · ${selectedIds.length} selected row${selectedIds.length === 1 ? '' : 's'}`
                        : 'ZIP · entire collection (pick rows above to narrow)'}
                    </span>
                  </button>
                </div>

                <div className={styles.keepsakeDanger}>
                  <span className={styles.keepsakeDangerLabel}>Remove from inbox</span>
                  <div className={styles.keepsakeDangerActions}>
                    <button
                      type="button"
                      className={styles.keepsakeDangerBtn}
                      onClick={() => {
                        const items = blirts.filter((b) => selectedIds.includes(b.id));
                        void deleteBlirtsBulk(items);
                      }}
                      disabled={
                        bulkDeleting ||
                        exporting ||
                        zipExporting ||
                        pdfExporting ||
                        selectedIds.length === 0 ||
                        blirts.length === 0
                      }
                    >
                      {bulkDeleting ? 'Deleting…' : `Delete selected (${selectedIds.length})`}
                    </button>
                    <button
                      type="button"
                      className={styles.keepsakeDangerBtn}
                      onClick={() => void deleteBlirtsBulk(blirts)}
                      disabled={bulkDeleting || exporting || zipExporting || pdfExporting || blirts.length === 0}
                    >
                      {bulkDeleting ? 'Deleting…' : `Delete all (${blirts.length})`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {inboxView === 'envelopes' ? (
            blirts.length === 0 ? (
              <p className={styles.muted}>Nothing yet—share your guest link.</p>
            ) : (
              blirts.map((b) => {
              const t = (b.type || '').toLowerCase();
              const url = mediaUrls[b.id];
              const guest = (b.guest_name ?? '').trim();
              const promptLine = (b.prompt_snapshot ?? '').trim();
              const openSpotifyUrl =
                t === 'soundtrack' && (b.spotify_track_id ?? '').trim()
                  ? `https://open.spotify.com/track/${(b.spotify_track_id ?? '').trim()}`
                  : null;
              return (
                <div key={b.id} className={styles.blirtRow}>
                  <input
                    type="checkbox"
                    className={styles.rowCheckbox}
                    checked={selectedIds.includes(b.id)}
                    onChange={() => toggleSelect(b.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Select for export"
                  />
                  {t === 'text' ? (
                    <div className={`${styles.blirtRowMain} ${styles.blirtRowMainEnvelopeHost}`}>
                      <div className={styles.blirtMeta}>
                        <strong>{b.type}</strong>
                        {guest ? ` · From: ${guest}` : ' · From: a friend'} · {b.status ?? '—'} ·{' '}
                        {b.created_at ? new Date(b.created_at).toLocaleString() : ''}
                      </div>
                      <div className={styles.blirtRowTextBody}>
                        <TextBlirtEnvelopeCard
                          blirt={b}
                          hasBeenViewed={textBlirtHasBeenViewed(b, viewedTextEnvelopeIds)}
                          variant={envelopeVariantFor(
                            b,
                            openEnvelopeIds,
                            envelopePlayId,
                            envelopeCollapsedIds,
                          )}
                          onToggle={() => toggleTextEnvelope(b)}
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.blirtRowMain}
                      onClick={() => setViewerBlirt(b)}
                    >
                      <div className={styles.blirtMeta}>
                        <strong>{b.type}</strong>
                        {guest ? ` · From: ${guest}` : ' · From: a friend'} · {b.status ?? '—'} ·{' '}
                        {b.created_at ? new Date(b.created_at).toLocaleString() : ''}
                      </div>
                      {promptLine ? (
                        <div className={styles.blirtPreviewPrompt}>
                          <span className={styles.blirtPromptLabel}>Prompt</span> {promptLine}
                        </div>
                      ) : null}
                      {t === 'video' && (
                        <div
                          className={
                            mediaUrlErrors[b.id] ? styles.mediaErrorHint : styles.blirtPreviewHint
                          }
                        >
                          {mediaUrlErrors[b.id]
                            ? `Can't load: ${friendlyBlirtStorageError(mediaUrlErrors[b.id])}`
                            : url
                              ? 'Video — tap to play'
                              : 'Loading…'}
                        </div>
                      )}
                      {t === 'audio' && (
                        <div
                          className={
                            mediaUrlErrors[b.id] ? styles.mediaErrorHint : styles.blirtPreviewHint
                          }
                        >
                          {mediaUrlErrors[b.id]
                            ? `Can't load: ${friendlyBlirtStorageError(mediaUrlErrors[b.id])}`
                            : url
                              ? 'Voice note — tap to play'
                            : 'Loading…'}
                        </div>
                      )}
                      {t === 'soundtrack' && (
                        <div className={styles.blirtPreviewHint}>
                          🎵 Soundtrack — tap to view
                          {openSpotifyUrl ? (
                            <>
                              {' '}
                              ·{' '}
                              <a
                                className={styles.link}
                                href={openSpotifyUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Open in Spotify
                              </a>
                            </>
                          ) : null}
                        </div>
                      )}
                    </button>
                  )}
                  <div className={styles.blirtRowActions}>
                    {(t === 'video' || t === 'audio') && url && !mediaUrlErrors[b.id] && (
                      <a
                        className={styles.link}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                      </a>
                    )}
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonDanger}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBlirt(b);
                      }}
                      disabled={busyId === b.id || bulkDeleting}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
            )
          ) : (
            <HostBlirtSwipeDeck
              blirts={blirts}
              mediaUrls={mediaUrls}
              mediaUrlErrors={mediaUrlErrors}
              busyId={busyId}
              onKeep={keepBlirt}
              onDelete={async (b) => {
                await deleteBlirt(b, { skipConfirm: true });
              }}
              onBackToEnvelopes={() => setInboxView('envelopes')}
            />
          )}
        </div>
      )}

      {viewerBlirt && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Blirt viewer"
          onClick={() => setViewerBlirt(null)}
        >
          <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setViewerBlirt(null)}
              aria-label="Close"
            >
              ×
            </button>
            {(viewerBlirt.type || '').toLowerCase() === 'soundtrack' ? (
              (() => {
                const vb = viewerBlirt;
                const soundtrackKind = (vb.soundtrack_message_type ?? '').toLowerCase();
                const artUrl = (vb.spotify_album_art_url ?? '').trim();
                const trackName = (vb.spotify_track_name ?? '').trim() || 'Song';
                const artistName = (vb.spotify_artist_name ?? '').trim() || 'Artist';
                const albumName = (vb.spotify_album_name ?? '').trim() || '—';
                const guestLabel = (vb.guest_name ?? '').trim() || 'Guest';
                const tid = (vb.spotify_track_id ?? '').trim();
                const openSpotifyUrl = tid
                  ? `https://open.spotify.com/track/${tid}`
                  : `https://open.spotify.com/search/${encodeURIComponent(`${trackName} ${artistName}`)}`;
                const nonTextMem = soundtrackKind !== 'text';
                const showFileLink = Boolean(viewerUrl && nonTextMem && !viewerMediaError);

                return (
                  <>
                    <p className={styles.modalSoundtrackDedicated}>
                      Dedicated by {guestLabel}
                      {albumName && albumName !== '—' ? (
                        <span className={styles.modalSoundtrackAlbumMeta}> · {albumName}</span>
                      ) : null}
                    </p>

                    <p className={styles.modalPrompt}>
                      <span className={styles.blirtPromptLabel}>Prompt</span>{' '}
                      {SOUNDTRACK_PROMPT}
                    </p>

                    {viewerMediaError ? (
                      <p className={styles.mediaErrorHint}>
                        {friendlyBlirtStorageError(viewerMediaError)}
                      </p>
                    ) : soundtrackKind === 'text' ? (
                      <HostSoundtrackInboxPlayback
                        key={vb.id}
                        mode="text"
                        textContent={vb.content}
                        previewUrl={hostInboxDeezerPreviewUrl}
                        previewLoading={hostInboxPreviewLoading}
                        albumArtUrl={artUrl || SONG_DEDICATION_PLACEHOLDER_ART}
                        title={trackName}
                        artist={artistName}
                        spotifyUrl={openSpotifyUrl}
                      />
                    ) : soundtrackKind === 'video' && viewerUrl ? (
                      <HostSoundtrackInboxPlayback
                        key={vb.id}
                        mode="video"
                        videoSrc={viewerUrl}
                        previewUrl={hostInboxDeezerPreviewUrl}
                        previewLoading={hostInboxPreviewLoading}
                        albumArtUrl={artUrl || SONG_DEDICATION_PLACEHOLDER_ART}
                        title={trackName}
                        artist={artistName}
                        spotifyUrl={openSpotifyUrl}
                      />
                    ) : soundtrackKind === 'audio' && viewerUrl ? (
                      <HostSoundtrackInboxPlayback
                        key={vb.id}
                        mode="audio"
                        guestAudioSrc={viewerUrl}
                        previewUrl={hostInboxDeezerPreviewUrl}
                        previewLoading={hostInboxPreviewLoading}
                        albumArtUrl={artUrl || SONG_DEDICATION_PLACEHOLDER_ART}
                        title={trackName}
                        artist={artistName}
                        spotifyUrl={openSpotifyUrl}
                      />
                    ) : (
                      <p className={styles.muted}>Loading media…</p>
                    )}

                    <div className={styles.modalSoundtrackLinkStack}>
                      {showFileLink ? (
                        <a
                          className={styles.modalSoundtrackLinkLine}
                          href={viewerUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open / download file
                        </a>
                      ) : null}
                      {openSpotifyUrl ? (
                        <a
                          className={styles.modalSoundtrackLinkLine}
                          href={openSpotifyUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Spotify →
                        </a>
                      ) : null}
                    </div>

                    <div className={styles.modalFooter}>
                      {(vb.status ?? '').toLowerCase() !== 'kept' ? (
                        <button
                          type="button"
                          className={styles.button}
                          onClick={async () => {
                            const ok = await keepBlirt(vb);
                            if (ok) setViewerBlirt(null);
                          }}
                          disabled={busyId === vb.id || bulkDeleting}
                        >
                          Keep
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonDanger}`}
                        onClick={() => {
                          deleteBlirt(vb);
                        }}
                        disabled={busyId === vb.id || bulkDeleting}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                );
              })()
            ) : (
              <>
                <div className={styles.modalMeta}>
                  <strong>{viewerBlirt.type}</strong>
                  {(viewerBlirt.guest_name ?? '').trim()
                    ? ` · From: ${(viewerBlirt.guest_name ?? '').trim()}`
                    : ' · From: a friend'}
                  <br />
                  · {viewerBlirt.status ?? '—'} ·{' '}
                  {viewerBlirt.created_at
                    ? new Date(viewerBlirt.created_at).toLocaleString()
                    : ''}
                </div>
                {(viewerBlirt.prompt_snapshot ?? '').trim() ? (
                  <p className={styles.modalPrompt}>
                    <span className={styles.blirtPromptLabel}>Prompt</span>{' '}
                    {(viewerBlirt.prompt_snapshot ?? '').trim()}
                  </p>
                ) : null}
                {(() => {
                  const vt = (viewerBlirt.type || '').toLowerCase();
                  if (vt === 'text') {
                    return (
                      <div className={styles.modalBodyText} style={{ whiteSpace: 'pre-wrap' }}>
                        {viewerBlirt.content}
                      </div>
                    );
                  }
                  if (viewerMediaError) {
                    return (
                      <p className={styles.mediaErrorHint}>
                        {friendlyBlirtStorageError(viewerMediaError)}
                      </p>
                    );
                  }
                  if (vt === 'video' && viewerUrl) {
                    return <VideoFit src={viewerUrl} variant="modal" />;
                  }
                  if (vt === 'audio' && viewerUrl) {
                    return <audio src={viewerUrl} controls autoPlay className={styles.modalAudio} />;
                  }
                  return <p className={styles.muted}>Loading media…</p>;
                })()}
                {(() => {
                  const vt = (viewerBlirt.type || '').toLowerCase();
                  const nonText = vt !== 'text';
                  if (!viewerUrl || !nonText || viewerMediaError) return null;
                  return (
                    <a
                      className={styles.link}
                      href={viewerUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-block', marginTop: 12 }}
                    >
                      Open / download file
                    </a>
                  );
                })()}
                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonDanger}`}
                    onClick={() => {
                      deleteBlirt(viewerBlirt);
                    }}
                    disabled={busyId === viewerBlirt.id || bulkDeleting}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'share' && (
        <div className={styles.card}>
          <div className={styles.h2}>Stable guest link</div>
          <p className={styles.muted}>
            Guests use this exact URL. For phone cameras on Wi‑Fi, use your computer&apos;s LAN address
            (same as you used for testing) or your production domain.
          </p>
          <p className={styles.muted} style={{ marginTop: 12 }}>
            <strong>Pretty link</strong> — set a short path (like{' '}
            <code className={styles.inlineCode}>ashley-birthday</code>) so the address is easy to read
            and share. Run the SQL in <code className={styles.inlineCode}>supabase/events_guest_slug.sql</code>{' '}
            once if you haven&apos;t yet.
          </p>
          <label className={styles.label} htmlFor="guest-slug">
            Guest URL path
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              id="guest-slug"
              className={styles.input}
              style={{ maxWidth: 320, flex: '1 1 200px' }}
              value={slugDraft}
              onChange={(e) => {
                setSlugDraft(e.target.value);
                setSlugStatus(null);
              }}
              placeholder={defaultGuestSlug(
                event.partner_1 ?? '',
                event.partner_2 ?? '',
                event.event_type ?? 'event',
              )}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className={`${styles.button} ${styles.buttonGhost}`}
              onClick={() => {
                setSlugDraft(
                  defaultGuestSlug(
                    event.partner_1 ?? '',
                    event.partner_2 ?? '',
                    event.event_type ?? 'event',
                  ),
                );
                setSlugStatus(null);
              }}
            >
              Suggest from names
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => void saveGuestSlug()}
              disabled={slugSaving}
            >
              {slugSaving ? 'Saving…' : 'Save path'}
            </button>
          </div>
          {slugStatus ? (
            <div
              className={slugStatus.startsWith('Saved') ? styles.success : styles.error}
              style={{ marginTop: 8 }}
            >
              {slugStatus}
            </div>
          ) : null}
          <div className={styles.h2} style={{ marginTop: 24 }}>
            Full link &amp; QR
          </div>
          <div className={styles.urlMono}>{guestUrl}</div>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            onClick={() => {
              void navigator.clipboard?.writeText(guestUrl);
            }}
            style={{ marginTop: 8 }}
          >
            Copy link
          </button>

          <div className={styles.qrBox} style={{ marginTop: 24 }}>
            <div className={styles.h2}>QR code</div>
            <div
              ref={qrWrapRef}
              style={{ padding: 16, background: 'white', borderRadius: 12 }}
            >
              <QRCode value={guestUrl} size={256} />
            </div>
            <div className={styles.qrActions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={() => void downloadQrPng()}
                disabled={qrBusy}
              >
                {qrBusy ? 'Working…' : 'Download QR (PNG)'}
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={() => void downloadBlirtPrintCardPdf()}
                disabled={qrBusy}
              >
                {qrBusy ? 'Working…' : 'Download print card (PDF)'}
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={() => void printQrSheet()}
                disabled={qrBusy}
              >
                Print QR sheet
              </button>
            </div>
            <p className={styles.muted} style={{ margin: 0 }}>
              Download a high-resolution PNG for signs, a ready-to-print 4×6&Prime; card (PDF), or print a
              sheet with the link and QR. One code per event — it always opens this guest page.
            </p>
          </div>

          <div id="keepsake-experience" style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
            <div className={styles.h2}>Keepsake experience (QR for after the event)</div>
            <p className={styles.muted}>
              This page is for <strong>you</strong> and your guests to relive saved soundtrack messages: song
              previews, Spotify links, and kept video or voice notes. It only lists Blirts you marked{' '}
              <strong>Keep</strong> in the inbox. Export videos stay music-free; this web page is where the
              licensed preview audio plays.
            </p>
            <div className={styles.urlMono} style={{ marginTop: 12 }}>
              {experienceUrl}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={() => {
                  void navigator.clipboard?.writeText(experienceUrl);
                }}
              >
                Copy experience link
              </button>
              <a
                className={`${styles.button} ${styles.buttonGhost}`}
                href={experienceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                Open experience
              </a>
            </div>
            {keptSoundtrackBlirts.length === 0 ? (
              <p className={styles.muted} style={{ marginTop: 12 }}>
                No kept soundtrack Blirts yet — mark some as Keep in <strong>Envelopes</strong> to see them
                here.
              </p>
            ) : (
              <p className={styles.muted} style={{ marginTop: 12 }}>
                {keptSoundtrackBlirts.length} kept soundtrack {keptSoundtrackBlirts.length === 1 ? 'message' : 'messages'} will appear on this page.
              </p>
            )}

            <div className={styles.qrBox} style={{ marginTop: 20 }}>
              <div className={styles.h2}>Experience QR code</div>
              <div
                ref={experienceQrWrapRef}
                style={{ padding: 16, background: 'white', borderRadius: 12 }}
              >
                <QRCode value={experienceUrl} size={256} />
              </div>
              <div className={styles.qrActions}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonGhost}`}
                  onClick={() => void downloadExperienceQrPng()}
                  disabled={qrBusy}
                >
                  {qrBusy ? 'Working…' : 'Download experience QR (PNG)'}
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonGhost}`}
                  onClick={() => void printExperienceQrSheet()}
                  disabled={qrBusy}
                >
                  {qrBusy ? 'Working…' : 'Print experience sheet'}
                </button>
              </div>
              <p className={styles.muted} style={{ margin: 0 }}>
                Put this on a closing slide, thank-you card, or email — different from the guest QR above.
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'prompts' && promptLibrary && (
        <div className={styles.card}>
          <div className={styles.h2}>Prompt library</div>
          <p className={styles.muted}>
            Categories match your event type (<strong>{promptLibrary.eventLabel}</strong>). Select as many
            prompts as you like — guests only see one at a time, and can skip a few times to pull another
            from your list. Placeholders use the names you entered ([Name], [Partner 1], etc.).
          </p>

          <div className={styles.checkRow}>
            <input
              id="rand"
              type="checkbox"
              checked={promptRandom}
              onChange={(e) => setPromptRandom(e.target.checked)}
            />
            <label htmlFor="rand">
              <strong>Randomize</strong> — each guest visit picks one prompt from your selected list.{' '}
              <span className={styles.muted}>
                Off = guests always see the first selected prompt (good when you only pick one).
              </span>
            </label>
          </div>

          <p className={styles.muted} style={{ marginBottom: 10 }}>
            Selected prompts: <strong>{promptPool.length}</strong>
          </p>

          {promptPool.length > 0 && (
            <div className={styles.chips} style={{ marginBottom: 16 }}>
              {promptPool.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={styles.chip}
                  onClick={() => togglePoolPrompt(p)}
                  title="Click to remove"
                >
                  {previewPromptForHost(p).slice(0, 72)}
                  {previewPromptForHost(p).length > 72 ? '…' : ''} ✕
                </button>
              ))}
            </div>
          )}

          {promptLibrary.categories.map((cat) => (
            <div key={cat.id} style={{ marginBottom: 20 }}>
              <div className={styles.h2} style={{ marginBottom: 6 }}>
                {cat.label}
              </div>
              {cat.description && (
                <p className={styles.muted} style={{ marginTop: 0, marginBottom: 10 }}>
                  {cat.description}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cat.prompts.map((p) => {
                  const checked = promptPool.includes(p);
                  return (
                    <label
                      key={p}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePoolPrompt(p)}
                      />
                      <span style={{ fontSize: 14, lineHeight: 1.45, fontWeight: 650 }}>
                        {previewPromptForHost(p)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <label className={styles.label} htmlFor="customPrompts">
            Or paste your own (one prompt per line)
          </label>
          <textarea
            id="customPrompts"
            className={styles.textarea}
            value={promptPool.join('\n')}
            onChange={(e) => {
              const next = e.target.value
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
              setPromptPool(next);
              setPromptStatus(null);
            }}
            rows={4}
            spellCheck
          />

          {promptStatus && (
            <div className={promptStatus.startsWith('Saved') ? styles.success : styles.error}>
              {promptStatus}
            </div>
          )}

          <button type="button" className={styles.button} onClick={savePrompts} disabled={savingPrompts}>
            {savingPrompts ? 'Saving…' : 'Save prompts'}
          </button>
        </div>
      )}

      {tab === 'soundtrack' && hasAnySoundtrackBlirt ? (
        <HostSoundtrackTab
          eventTitle={eventTitleForFiles}
          eventDateLine={playlistEventDateLine}
          keptSoundtracks={keptSoundtrackBlirts}
          hasAnySoundtrackSubmission={hasAnySoundtrackBlirt}
          mediaUrls={mediaUrls}
          mediaUrlErrors={mediaUrlErrors}
          onGoToExperienceShare={() => {
            setTab('share');
            window.setTimeout(() => {
              document.getElementById('keepsake-experience')?.scrollIntoView({ behavior: 'smooth' });
            }, 150);
          }}
        />
      ) : null}
    </div>
  );
}

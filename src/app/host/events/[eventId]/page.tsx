'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../../../lib/supabaseClient';
import { getGuestPageUrl } from '../../../../lib/guestUrl';
import {
  downloadPngDataUrl,
  openQrPrintSheet,
  svgQrToPngDataUrl,
} from '../../../../lib/qrExport';
import { buildBlirtsZip } from '../../../../lib/exportBlirtsZip';
import { VideoFit } from '../../../../components/VideoFit';
import { getPromptLibraryForEventType } from '../../../../lib/promptLibrary';
import styles from '../../host.module.css';

type Tab = 'blirts' | 'share' | 'prompts';

type EventRow = {
  id: string;
  partner_1: string | null;
  partner_2: string | null;
  event_type?: string | null;
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewerBlirt, setViewerBlirt] = useState<BlirtRow | null>(null);

  /** All selected prompt lines saved to events.prompts */
  const [promptPool, setPromptPool] = useState<string[]>([]);
  const [promptRandom, setPromptRandom] = useState(true);
  const [promptStatus, setPromptStatus] = useState<string | null>(null);
  const [savingPrompts, setSavingPrompts] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [zipExporting, setZipExporting] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement | null>(null);

  const guestUrl = useMemo(() => getGuestPageUrl(eventId), [eventId]);
  const eventTitleForFiles = useMemo(
    () => displayEventNames(event?.partner_1 ?? null, event?.partner_2 ?? null),
    [event?.partner_1, event?.partner_2],
  );

  const loadBlirts = useCallback(async () => {
    if (!supabase || !eventId) return;
    const { data, error } = await supabase
      .from('blirts')
      .select('id, event_id, type, content, status, created_at, guest_name, prompt_snapshot')
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
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewerBlirt(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!supabase || !blirts.length) {
      setMediaUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const b of blirts) {
        const t = (b.type || '').toLowerCase();
        if ((t === 'video' || t === 'audio') && b.content.includes('/')) {
          const { data } = await supabase.storage
            .from('blirts-media')
            .createSignedUrl(b.content, 7200);
          if (data?.signedUrl) next[b.id] = data.signedUrl;
        }
      }
      if (!cancelled) setMediaUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [blirts]);

  async function deleteBlirt(b: BlirtRow) {
    if (!supabase) return;
    const ok = window.confirm('Delete this Blirt permanently?');
    if (!ok) return;
    setBusyId(b.id);
    const t = (b.type || '').toLowerCase();
    if ((t === 'video' || t === 'audio') && b.content.includes('/')) {
      await supabase.storage.from('blirts-media').remove([b.content]);
    }
    await supabase.from('blirts').delete().eq('id', b.id);
    setBusyId(null);
    setViewerBlirt((prev) => (prev?.id === b.id ? null : prev));
    setSelectedIds((prev) => prev.filter((id) => id !== b.id));
    loadBlirts();
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

  async function downloadQrPng() {
    const svg = qrWrapRef.current?.querySelector('svg');
    if (!svg) {
      window.alert('QR code is not ready yet.');
      return;
    }
    setQrBusy(true);
    try {
      const png = await svgQrToPngDataUrl(svg, 1200);
      const slug = eventTitleForFiles
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      downloadPngDataUrl(png, `blirt-qr-${slug || eventId}.png`);
    } catch {
      window.alert('Could not build the image. Try another browser or update your browser.');
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
        if ((t === 'video' || t === 'audio') && b.content.includes('/')) {
          const { data, error } = await supabase.storage
            .from('blirts-media')
            .createSignedUrl(b.content, 86400);
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
      const { blob, skipped } = await buildBlirtsZip({ supabase, items, eventId });
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
      </div>

      {tab === 'blirts' && (
        <div className={styles.card}>
          <div className={styles.h2}>Blirts ({blirts.length})</div>
          <p className={styles.muted} style={{ marginBottom: 12 }}>
            Click a row to open and view. Use checkboxes to export only what you select, or export everything.
          </p>
          <p className={styles.muted} style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.45 }}>
            <strong>CSV</strong> = spreadsheet with text plus <strong>clickable links</strong> to video/audio (not the video files themselves).{' '}
            <strong>ZIP</strong> = downloads the actual video, voice, and text files.
          </p>
          <div className={styles.exportRow}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonGhost}`}
              onClick={() => exportCsvAll()}
              disabled={exporting || zipExporting || blirts.length === 0}
            >
              {exporting ? 'Exporting…' : 'Export all (CSV)'}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonGhost}`}
              onClick={() => exportCsvSelected()}
              disabled={exporting || zipExporting || selectedIds.length === 0}
            >
              {exporting ? 'Exporting…' : `Export selected (${selectedIds.length}) CSV`}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonGhost}`}
              onClick={() => exportZipAll()}
              disabled={zipExporting || exporting || blirts.length === 0}
            >
              {zipExporting ? 'Building ZIP…' : 'Download all (ZIP)'}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonGhost}`}
              onClick={() => exportZipSelected()}
              disabled={zipExporting || exporting || selectedIds.length === 0}
            >
              {zipExporting ? 'Building ZIP…' : `Download selected (${selectedIds.length}) ZIP`}
            </button>
          </div>
          {blirts.length > 0 && (
            <label className={styles.selectAllRow}>
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              <span>Select all</span>
            </label>
          )}

          {blirts.length === 0 ? (
            <p className={styles.muted}>Nothing yet—share your guest link.</p>
          ) : (
            blirts.map((b) => {
              const t = (b.type || '').toLowerCase();
              const url = mediaUrls[b.id];
              const guest = (b.guest_name ?? '').trim();
              const promptLine = (b.prompt_snapshot ?? '').trim();
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
                  <button
                    type="button"
                    className={styles.blirtRowMain}
                    onClick={() => setViewerBlirt(b)}
                  >
                    <div className={styles.blirtMeta}>
                      <strong>{b.type}</strong>
                      {guest ? ` · From: ${guest}` : ''} · {b.status ?? '—'} ·{' '}
                      {b.created_at ? new Date(b.created_at).toLocaleString() : ''}
                    </div>
                    {promptLine ? (
                      <div className={styles.blirtPreviewPrompt}>
                        <span className={styles.blirtPromptLabel}>Prompt</span> {promptLine}
                      </div>
                    ) : null}
                    {t === 'text' && (
                      <div className={styles.blirtPreviewText}>{b.content}</div>
                    )}
                    {t === 'video' && (
                      <div className={styles.blirtPreviewHint}>
                        {url ? 'Video — tap to play' : 'Loading…'}
                      </div>
                    )}
                    {t === 'audio' && (
                      <div className={styles.blirtPreviewHint}>
                        {url ? 'Voice note — tap to play' : 'Loading…'}
                      </div>
                    )}
                  </button>
                  <div className={styles.blirtRowActions}>
                    {(t === 'video' || t === 'audio') && url && (
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
                      disabled={busyId === b.id}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
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
            <div className={styles.modalMeta}>
              <strong>{viewerBlirt.type}</strong>
              {(viewerBlirt.guest_name ?? '').trim()
                ? ` · From: ${(viewerBlirt.guest_name ?? '').trim()}`
                : ''}
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
              if (vt === 'video' && viewerUrl) {
                return <VideoFit src={viewerUrl} variant="modal" />;
              }
              if (vt === 'audio' && viewerUrl) {
                return <audio src={viewerUrl} controls className={styles.modalAudio} />;
              }
              return <p className={styles.muted}>Loading media…</p>;
            })()}
            {viewerUrl && (viewerBlirt.type || '').toLowerCase() !== 'text' && (
              <a
                className={styles.link}
                href={viewerUrl}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-block', marginTop: 12 }}
              >
                Open / download file
              </a>
            )}
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonDanger}`}
                onClick={() => {
                  deleteBlirt(viewerBlirt);
                }}
                disabled={busyId === viewerBlirt.id}
              >
                Delete
              </button>
            </div>
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
                onClick={() => void printQrSheet()}
                disabled={qrBusy}
              >
                Print QR sheet
              </button>
            </div>
            <p className={styles.muted} style={{ margin: 0 }}>
              Download a high-resolution image for signs, or print a sheet with the link and QR. One
              code per event — it always opens this guest page.
            </p>
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
    </div>
  );
}

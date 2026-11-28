import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileCode2,
  FileJson,
  Globe,
  Link2,
  Loader2,
  Lock,
  Trash2,
  X
} from 'lucide-react';
import type { DevReadyBundle } from '../types';
import {
  createEncryptedShareLink,
  encodeClipboardBundle,
  getSavedShareLinks,
  revokeCloudShareLink,
  type SavedShareLink
} from '../lib/transfer';
import { buildStandaloneHtml } from '../lib/codegen';
import { fmtMod } from '../lib/platform';

interface ShareModalProps {
  bundle: DevReadyBundle;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ bundle, onClose, onNotify }) => {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    backend: string;
    ttlDays: number;
    encrypted: boolean;
    strippedScreenshot?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [activeLinks, setActiveLinks] = useState<SavedShareLink[]>(() => getSavedShareLinks(bundle.id));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActiveLinks(getSavedShareLinks(bundle.id));
  }, [bundle.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCreateLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await createEncryptedShareLink(bundle);
      setShareUrl(res.url);
      setMeta({
        backend: res.backend,
        ttlDays: res.ttlDays,
        encrypted: res.encrypted,
        strippedScreenshot: res.strippedScreenshot
      });
      setActiveLinks(getSavedShareLinks(bundle.id));
      await navigator.clipboard.writeText(res.url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      onNotify(res.backend === 'hash' ? 'Share link copied to clipboard' : 'Encrypted link copied to clipboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create share link');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (item: SavedShareLink) => {
    if (!item.revokeToken) return;
    setRevokingId(item.id);
    setError(null);
    try {
      await revokeCloudShareLink(item.id, item.revokeToken);
      setActiveLinks(getSavedShareLinks(bundle.id));
      if (shareUrl === item.url) setShareUrl(null);
      onNotify('Shared link revoked — no longer accessible');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke link');
    } finally {
      setRevokingId(null);
    }
  };

  const downloadText = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const slug =
    bundle.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'screen';

  const handleExportHtml = () => {
    const html = buildStandaloneHtml(bundle);
    downloadText(html, `${slug}-devready.html`, 'text/html;charset=utf-8');
    onNotify(`Exported ${slug}-devready.html`);
  };

  const handleExportJson = () => {
    downloadText(JSON.stringify(bundle, null, 2), `${slug}.devready.json`, 'application/json;charset=utf-8');
    onNotify(`Exported ${slug}.devready.json`);
  };

  const handleCopyClipboardBundle = async () => {
    try {
      const encoded = await encodeClipboardBundle(bundle);
      await navigator.clipboard.writeText(encoded);
      onNotify('Copied clipboard bundle');
    } catch {
      setError('Could not access clipboard — export .devready.json instead.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fig-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share screen"
        onClick={e => e.stopPropagation()}
      >
        {/* Native Figma UI3 Share Header */}
        <div className="fig-modal-head">
          <h2>Share &ldquo;{bundle.name}&rdquo;</h2>
          <button className="fig-modal-close" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* Link Share Block */}
        <div className="fig-modal-body">
          <div className="fig-share-access">
            <div className="fig-access-ic">
              <Globe size={14} />
            </div>
            <div className="fig-access-copy">
              <div className="fig-access-title">Anyone with the link</div>
              <div className="fig-access-sub">
                {meta?.backend === 'hash'
                  ? 'Permanent portable link · Full Dev Mode & codegen · No login needed'
                  : meta?.backend === 'upstash'
                    ? `Can inspect & copy code · ${meta.ttlDays}d · E2E encrypted`
                    : 'Opens full interactive Dev Mode, redlines & codegen in any browser'}
              </div>
            </div>
          </div>

          {!shareUrl ? (
            <button
              className="fig-btn-primary full"
              onClick={handleCreateLink}
              disabled={loading}
            >
              {loading ? <Loader2 size={13} className="spin" /> : <Link2 size={13} />}
              <span>{loading ? 'Creating share link…' : 'Create & copy share link'}</span>
            </button>
          ) : (
            <>
              <div className="fig-input-row">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="fig-input"
                  onFocus={e => e.currentTarget.select()}
                />
                <button
                  className="fig-btn-primary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                      onNotify('Link copied');
                    } catch {
                      onNotify('Clipboard blocked — select link & press Copy');
                    }
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="fig-hint-line" style={{ marginTop: 8 }}>
                {meta?.backend === 'hash'
                  ? meta.strippedScreenshot
                    ? 'Vector specs, layout & code included in URL #hash (works forever). Use Interactive HTML below to include the 2× PNG screenshot.'
                    : 'All layers, tokens & code live directly inside the URL #hash — works forever on any browser with zero server storage.'
                  : 'Send this link to any developer — they can inspect layers, redlines & code without Figma.'}
              </p>
            </>
          )}

          {error && (
            <div className="fig-alert-err">
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          {activeLinks.length > 0 && (
            <div className="share-active-list">
              <div className="share-active-label">
                <span>Active links ({activeLinks.length})</span>
                <span className="mono">Revoke anytime</span>
              </div>
              {activeLinks.slice(0, 4).map(item => (
                <div key={item.id} className="share-active-row">
                  <div className="share-active-info">
                    <span className="share-active-id mono">?s={item.id}</span>
                    <span className="share-active-meta">
                      Created{' '}
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="share-active-actions">
                    <button
                      type="button"
                      className="quiet-icon-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(item.url).catch(() => {});
                        onNotify('Link copied');
                      }}
                      title="Copy link"
                    >
                      <Copy size={11} />
                    </button>
                    {item.revokeToken && (
                      <button
                        type="button"
                        className="share-revoke-btn"
                        disabled={revokingId === item.id}
                        onClick={() => handleRevoke(item)}
                        title="Revoke link immediately"
                      >
                        {revokingId === item.id ? (
                          <Loader2 size={11} className="spin" />
                        ) : (
                          <Trash2 size={11} />
                        )}
                        <span>Revoke</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hairline Section Divider + Flat Offline Export Rows */}
        <div className="fig-modal-section">
          <div className="fig-modal-sec-label">Offline export</div>

          <button className="fig-menu-row" onClick={handleExportHtml}>
            <FileCode2 size={14} className="fig-menu-ic" />
            <div className="fig-menu-text">
              <span className="fig-menu-title">Interactive HTML</span>
              <span className="fig-menu-sub">Standalone inspect file for Slack or Drive</span>
            </div>
            <Download size={13} className="fig-menu-trail" />
          </button>

          <button className="fig-menu-row" onClick={handleExportJson}>
            <FileJson size={14} className="fig-menu-ic" />
            <div className="fig-menu-text">
              <span className="fig-menu-title">.devready.json</span>
              <span className="fig-menu-sub">Drop into any DevReady Studio tab</span>
            </div>
            <Download size={13} className="fig-menu-trail" />
          </button>

          <button className="fig-menu-row" onClick={handleCopyClipboardBundle}>
            <Copy size={14} className="fig-menu-ic" />
            <div className="fig-menu-text">
              <span className="fig-menu-title">Copy clipboard bundle</span>
              <span className="fig-menu-sub">Paste directly with {fmtMod('V')} in another browser</span>
            </div>
            <Copy size={12} className="fig-menu-trail" />
          </button>
        </div>

        {/* Hairline Footer */}
        <div className="fig-modal-foot">
          <span className="fig-foot-meta">
            <Lock size={11} />
            <span>Key stays in URL #hash · Never sent to server</span>
          </span>
          <button className="fig-btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

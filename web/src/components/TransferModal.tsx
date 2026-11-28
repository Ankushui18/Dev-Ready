import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Frame,
  Link2,
  Lock,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import type { DevReadyBundle } from '../types';
import { decodeClipboardOrJson } from '../lib/transfer';
import {
  fetchFigmaBundle,
  listFigmaFrames,
  parseFigmaUrl,
  type FigmaFrameCandidate
} from '../lib/figmaApi';
import { downloadBridgePluginZip } from '../lib/pluginZip';
import { fmtMod } from '../lib/platform';

export type ImportTab = 'figma-url' | 'paste' | 'file' | 'plugin';

interface TransferModalProps {
  initialTab?: ImportTab;
  initialFigmaUrl?: string;
  onClose: () => void;
  onImport: (bundle: DevReadyBundle) => void;
  onImportBatch?: (bundles: DevReadyBundle[]) => void;
}

const MANIFEST_PATH = 'web/figma-bridge-plugin/manifest.json';
export const PAT_STORAGE_KEY = 'devready-figma-pat-v1';

export const TransferModal: React.FC<TransferModalProps> = ({
  initialTab = 'figma-url',
  initialFigmaUrl = '',
  onClose,
  onImport,
  onImportBatch
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<ImportTab>(initialTab);
  const [pasteVal, setPasteVal] = useState('');
  const [figmaUrl, setFigmaUrl] = useState(initialFigmaUrl);
  const [figmaToken, setFigmaToken] = useState(() => {
    try {
      return localStorage.getItem(PAT_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [rememberToken, setRememberToken] = useState(() => {
    try {
      return Boolean(localStorage.getItem(PAT_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [showToken, setShowToken] = useState(false);
  const [stageMsg, setStageMsg] = useState<string | null>(null);
  const [framePicker, setFramePicker] = useState<{
    fileKey: string;
    fileName: string;
    frames: FigmaFrameCandidate[];
  } | null>(null);
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(new Set());
  const [frameQuery, setFrameQuery] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [downloadedZip, setDownloadedZip] = useState(false);

  const parsedUrl = useMemo(() => parseFigmaUrl(figmaUrl), [figmaUrl]);

  const filteredFrames = useMemo(() => {
    if (!framePicker) return [];
    const q = frameQuery.trim().toLowerCase();
    if (!q) return framePicker.frames;
    return framePicker.frames.filter(
      f => f.name.toLowerCase().includes(q) || f.pageName.toLowerCase().includes(q)
    );
  }, [framePicker, frameQuery]);

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

  useEffect(() => {
    if (tab === 'paste') {
      pasteInputRef.current?.focus();
    } else if (tab === 'figma-url') {
      urlInputRef.current?.focus();
    }
    setError(null);
  }, [tab]);

  const persistTokenPreference = (token: string, save: boolean) => {
    try {
      if (save && token.trim()) {
        localStorage.setItem(PAT_STORAGE_KEY, token.trim());
      } else {
        localStorage.removeItem(PAT_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleClearSavedToken = () => {
    setFigmaToken('');
    setRememberToken(false);
    try {
      localStorage.removeItem(PAT_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleDecodeText = async (raw: string) => {
    if (!raw.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const bundle = await decodeClipboardOrJson(raw);
      onImport(bundle);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import Figma bundle');
    } finally {
      setBusy(false);
    }
  };

  const handleReadClipboard = async () => {
    setError(null);
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt.trim()) {
        setError('Clipboard is empty. Copy a frame in the Figma Bridge plugin first.');
        return;
      }
      await handleDecodeText(txt);
    } catch {
      setError(`Clipboard access blocked — press ${fmtMod('V')} inside the field above.`);
      pasteInputRef.current?.focus();
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      await handleDecodeText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read file');
      setBusy(false);
    }
  };

  const handleImportFigmaFrame = async (
    fileKey: string,
    nodeId: string,
    fileName?: string,
    pageName?: string
  ) => {
    setError(null);
    setBusy(true);
    try {
      persistTokenPreference(figmaToken, rememberToken);
      const bundle = await fetchFigmaBundle({
        fileKey,
        nodeId,
        fileName,
        pageName,
        token: figmaToken,
        onStage: setStageMsg
      });
      onImport(bundle);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fetch frame from Figma');
    } finally {
      setBusy(false);
      setStageMsg(null);
    }
  };

  const handleBatchImport = async () => {
    if (!framePicker || selectedFrameIds.size === 0) return;
    setError(null);
    setBusy(true);
    persistTokenPreference(figmaToken, rememberToken);

    const targets = framePicker.frames.filter(f => selectedFrameIds.has(f.id)).slice(0, 12);
    const imported: DevReadyBundle[] = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        const fr = targets[i];
        setStageMsg(`Importing ${i + 1} of ${targets.length}: ${fr.name}…`);
        const bundle = await fetchFigmaBundle({
          fileKey: framePicker.fileKey,
          nodeId: fr.id,
          fileName: framePicker.fileName,
          pageName: fr.pageName,
          token: figmaToken
        });
        imported.push(bundle);
      }
      if (imported.length === 1) {
        onImport(imported[0]);
      } else if (imported.length > 1) {
        if (onImportBatch) {
          onImportBatch(imported);
        } else {
          for (const b of imported) onImport(b);
        }
      }
      onClose();
    } catch (e) {
      if (imported.length > 0) {
        if (onImportBatch) onImportBatch(imported);
        else for (const b of imported) onImport(b);
      }
      setError(
        e instanceof Error
          ? `${e.message}${imported.length ? ` (${imported.length} frames saved before error)` : ''}`
          : 'Batch import interrupted'
      );
    } finally {
      setBusy(false);
      setStageMsg(null);
    }
  };

  const toggleFrameSelect = (id: string) => {
    setSelectedFrameIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFigmaUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!parsedUrl) {
      setError('Paste a valid Figma link (e.g. https://www.figma.com/design/FILE_KEY/...).');
      return;
    }
    if (!figmaToken.trim()) {
      setError('Enter your read-only Figma Personal Access Token (starts with figd_).');
      return;
    }

    persistTokenPreference(figmaToken, rememberToken);

    if (parsedUrl.nodeId) {
      await handleImportFigmaFrame(parsedUrl.fileKey, parsedUrl.nodeId);
      return;
    }

    // No node-id in URL: list top-level frames so user can pick 1 or batch-import multiple!
    setBusy(true);
    setStageMsg('Listing frames in Figma file…');
    try {
      const { fileName, frames } = await listFigmaFrames(parsedUrl.fileKey, figmaToken);
      if (frames.length === 0) {
        setError('No top-level frames found in this Figma file. Right-click a frame → Copy link to selection.');
      } else if (frames.length === 1) {
        await handleImportFigmaFrame(parsedUrl.fileKey, frames[0].id, fileName, frames[0].pageName);
        return;
      } else {
        setFramePicker({ fileKey: parsedUrl.fileKey, fileName, frames });
        setSelectedFrameIds(new Set([frames[0].id]));
        setFrameQuery('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read Figma file');
    } finally {
      setBusy(false);
      setStageMsg(null);
    }
  };

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(MANIFEST_PATH).catch(() => {});
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1600);
  };

  const handleDownloadPlugin = () => {
    downloadBridgePluginZip();
    setDownloadedZip(true);
    setTimeout(() => setDownloadedZip(false), 2400);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fig-modal fig-modal-import"
        role="dialog"
        aria-modal="true"
        aria-label="Import from Figma"
        onClick={e => e.stopPropagation()}
      >
        {/* Native Figma UI3 44px Header */}
        <div className="fig-modal-head">
          <h2>Import from Figma</h2>
          <button className="fig-modal-close" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* Figma Underline Tabs */}
        <div className="fig-modal-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'figma-url'}
            className={tab === 'figma-url' ? 'active' : ''}
            onClick={() => setTab('figma-url')}
          >
            Figma URL
          </button>
          <button
            role="tab"
            aria-selected={tab === 'paste'}
            className={tab === 'paste' ? 'active' : ''}
            onClick={() => setTab('paste')}
          >
            Paste
          </button>
          <button
            role="tab"
            aria-selected={tab === 'file'}
            className={tab === 'file' ? 'active' : ''}
            onClick={() => setTab('file')}
          >
            Upload file
          </button>
          <button
            role="tab"
            aria-selected={tab === 'plugin'}
            className={tab === 'plugin' ? 'active' : ''}
            onClick={() => setTab('plugin')}
          >
            Figma plugin
          </button>
        </div>

        {/* Body */}
        <div className="fig-modal-body">
          {error && (
            <div className="fig-alert-err">
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          {tab === 'figma-url' && (
            <>
              {framePicker ? (
                <div className="fig-frame-picker">
                  <div className="fig-frame-picker-head">
                    <div>
                      <div className="fig-frame-picker-title">{framePicker.fileName}</div>
                      <div className="fig-frame-picker-sub">
                        Select 1 or multiple frames ({framePicker.frames.length} found · up to 12/batch)
                      </div>
                    </div>
                    <button
                      type="button"
                      className="fig-btn-ghost"
                      onClick={() => setFramePicker(null)}
                      disabled={busy}
                    >
                      Change link
                    </button>
                  </div>

                  <div className="fig-frame-toolbar">
                    <div className="fig-frame-search">
                      <Search size={11} />
                      <input
                        type="text"
                        placeholder="Filter frames or pages…"
                        value={frameQuery}
                        onChange={e => setFrameQuery(e.target.value)}
                        disabled={busy}
                      />
                    </div>
                    <button
                      type="button"
                      className="fig-mini-link"
                      disabled={busy}
                      onClick={() => {
                        if (selectedFrameIds.size > 0) {
                          setSelectedFrameIds(new Set());
                        } else {
                          setSelectedFrameIds(new Set(filteredFrames.slice(0, 12).map(f => f.id)));
                        }
                      }}
                    >
                      {selectedFrameIds.size > 0 ? 'Clear' : 'Select up to 12'}
                    </button>
                  </div>

                  <div className="fig-frame-list">
                    {filteredFrames.slice(0, 80).map(fr => {
                      const checked = selectedFrameIds.has(fr.id);
                      return (
                        <div
                          key={fr.id}
                          className={`fig-frame-item ${checked ? 'is-checked' : ''}`}
                          onClick={() => !busy && toggleFrameSelect(fr.id)}
                          onDoubleClick={() =>
                            !busy &&
                            handleImportFigmaFrame(framePicker.fileKey, fr.id, framePicker.fileName, fr.pageName)
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy}
                            onChange={() => toggleFrameSelect(fr.id)}
                            onClick={e => e.stopPropagation()}
                            aria-label={`Select ${fr.name}`}
                          />
                          <Frame size={13} className="fig-frame-ic" />
                          <div className="fig-frame-meta">
                            <span className="fig-frame-name">{fr.name}</span>
                            <span className="fig-frame-page">{fr.pageName}</span>
                          </div>
                          <span className="fig-frame-dim mono">
                            {fr.width}×{fr.height}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="fig-btn-primary fig-btn-full"
                    disabled={selectedFrameIds.size === 0 || busy}
                    onClick={handleBatchImport}
                  >
                    {busy
                      ? stageMsg || 'Importing frames…'
                      : selectedFrameIds.size === 1
                        ? 'Import 1 Selected Frame'
                        : `Import ${Math.min(selectedFrameIds.size, 12)} Selected Frames`}
                  </button>
                </div>
              ) : (
                <form className="fig-url-form" onSubmit={handleFigmaUrlSubmit}>
                  <div className="fig-field-block">
                    <div className="fig-label-row">
                      <label className="fig-field-label" htmlFor="fig-url-input">
                        Figma file or frame link
                      </label>
                      {parsedUrl && (
                        <span className="fig-parsed-badge">
                          <Link2 size={10} />
                          <span>
                            {parsedUrl.nodeId ? `Frame ${parsedUrl.nodeId}` : 'Whole file (multi-select)'}
                          </span>
                        </span>
                      )}
                    </div>
                    <input
                      id="fig-url-input"
                      ref={urlInputRef}
                      type="url"
                      className="fig-input"
                      placeholder="https://www.figma.com/design/abc123/App?node-id=1-2"
                      value={figmaUrl}
                      onChange={e => setFigmaUrl(e.target.value)}
                      disabled={busy}
                    />
                  </div>

                  <div className="fig-field-block">
                    <div className="fig-label-row">
                      <label className="fig-field-label" htmlFor="fig-token-input">
                        Figma Personal Access Token
                      </label>
                      <a
                        className="fig-token-help-link"
                        href="https://www.figma.com/settings"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span>Create token</span>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                    <div className="fig-token-wrap">
                      <input
                        id="fig-token-input"
                        type={showToken ? 'text' : 'password'}
                        className="fig-input fig-token-input mono"
                        placeholder="figd_••••••••••••••••••••"
                        value={figmaToken}
                        onChange={e => setFigmaToken(e.target.value)}
                        disabled={busy}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="fig-token-eye"
                        onClick={() => setShowToken(v => !v)}
                        aria-label={showToken ? 'Hide token' : 'Show token'}
                      >
                        {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>

                  <div className="fig-url-options">
                    <label className="fig-check-row">
                      <input
                        type="checkbox"
                        checked={rememberToken}
                        onChange={e => {
                          setRememberToken(e.target.checked);
                          persistTokenPreference(figmaToken, e.target.checked);
                        }}
                      />
                      <span>Remember token on this browser</span>
                    </label>
                    {figmaToken && (
                      <button
                        type="button"
                        className="fig-clear-token"
                        onClick={handleClearSavedToken}
                      >
                        <Trash2 size={11} />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="fig-btn-primary fig-btn-full"
                    disabled={!figmaUrl.trim() || !figmaToken.trim() || busy}
                  >
                    {busy ? stageMsg || 'Importing from Figma…' : 'Fetch & Inspect Frame'}
                  </button>

                  <p className="fig-hint-line">
                    Calls <code>api.figma.com</code> directly from your browser — your token never touches our server or share links.
                  </p>
                </form>
              )}
            </>
          )}

          {tab === 'paste' && (
            <>
              <div className="fig-field-block">
                <label className="fig-field-label" htmlFor="fig-import-input">
                  Share link, clipboard copy, or JSON
                </label>
                <form
                  className="fig-input-row"
                  onSubmit={e => {
                    e.preventDefault();
                    handleDecodeText(pasteVal);
                  }}
                >
                  <input
                    id="fig-import-input"
                    ref={pasteInputRef}
                    type="text"
                    className="fig-input"
                    placeholder="Paste link, clipboard copy, or JSON…"
                    value={pasteVal}
                    onChange={e => setPasteVal(e.target.value)}
                    disabled={busy}
                  />
                  <button
                    type="submit"
                    className="fig-btn-primary"
                    disabled={!pasteVal.trim() || busy}
                  >
                    {busy ? 'Loading…' : 'Import'}
                  </button>
                </form>
              </div>

              <button
                type="button"
                className="fig-btn-clipboard"
                onClick={handleReadClipboard}
                disabled={busy}
              >
                <span className="fig-btn-clipboard-left">
                  <ClipboardPaste size={13} />
                  <span>Paste directly from clipboard</span>
                </span>
                <kbd>{fmtMod('V')}</kbd>
              </button>

              <p className="fig-hint-line">
                Copy any frame with the Figma plugin, or press {fmtMod('V')} anywhere to import instantly.
              </p>
            </>
          )}

          {tab === 'file' && (
            <div
              className={`fig-dropzone ${dragging ? 'is-drag' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragEnter={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
            >
              <div className="fig-drop-ic">
                <Upload size={15} />
              </div>
              <div className="fig-drop-title">Drop .devready.json file</div>
              <div className="fig-drop-sub">or click to browse from computer</div>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.devready,application/json"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          )}

          {tab === 'plugin' && (
            <div className="fig-plugin-tab">
              <div className="fig-plugin-dl-card">
                <div className="fig-plugin-dl-copy">
                  <div className="fig-plugin-dl-title">DevReady Web Bridge Plugin</div>
                  <div className="fig-plugin-dl-sub">
                    Sync selected Figma frames, Local Variables, SVG icons &amp; PNGs in 1 click.
                  </div>
                </div>
                <button
                  type="button"
                  className="fig-btn-primary"
                  onClick={handleDownloadPlugin}
                >
                  {downloadedZip ? <Check size={12} /> : <Download size={12} />}
                  <span>{downloadedZip ? 'Downloaded!' : 'Download .zip'}</span>
                </button>
              </div>

              <div className="fig-steps">
                <div className="fig-step">
                  <span className="fig-step-num">1</span>
                  <div className="fig-step-text">
                    Download &amp; unzip <strong>devready-figma-bridge-plugin.zip</strong> (or use the repo folder below).
                  </div>
                </div>
                <div className="fig-step">
                  <span className="fig-step-num">2</span>
                  <div className="fig-step-text">
                    In Figma Desktop, open <strong>Plugins → Development → Import plugin from manifest…</strong> and select <code>manifest.json</code>:
                    <button
                      type="button"
                      className="fig-path-pill"
                      onClick={handleCopyPath}
                      title="Copy repo manifest path"
                    >
                      <code className="fig-path-text">{MANIFEST_PATH}</code>
                      {copiedPath ? <Check size={11} className="ic-ok" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
                <div className="fig-step">
                  <span className="fig-step-num">3</span>
                  <div className="fig-step-text">
                    Select any frame and click <strong>Open in Web Dev Mode ↗</strong>.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hairline Footer */}
        <div className="fig-modal-foot">
          <span className="fig-foot-meta">
            <Lock size={11} />
            <span>Saved locally · Private</span>
          </span>
          <button className="fig-btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Copy,
  Lock,
  Upload,
  X
} from 'lucide-react';
import type { DevReadyBundle } from '../types';
import { decodeClipboardOrJson } from '../lib/transfer';
import { fmtMod } from '../lib/platform';

interface TransferModalProps {
  onClose: () => void;
  onImport: (bundle: DevReadyBundle) => void;
}

type ImportTab = 'paste' | 'file' | 'plugin';

const MANIFEST_PATH = 'web/figma-bridge-plugin/manifest.json';

export const TransferModal: React.FC<TransferModalProps> = ({ onClose, onImport }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<ImportTab>('paste');
  const [pasteVal, setPasteVal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

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
      inputRef.current?.focus();
    }
    setError(null);
  }, [tab]);

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
      inputRef.current?.focus();
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

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(MANIFEST_PATH).catch(() => {});
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1600);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fig-modal"
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
                    ref={inputRef}
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
                Copy any frame with the Figma plugin, or press {fmtMod('V')} anywhere on the canvas to import instantly.
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
            <div className="fig-steps">
              <div className="fig-step">
                <span className="fig-step-num">1</span>
                <div className="fig-step-text">
                  In Figma Desktop, open <strong>Plugins → Development → Import plugin from manifest…</strong>
                </div>
              </div>
              <div className="fig-step">
                <span className="fig-step-num">2</span>
                <div className="fig-step-text">
                  <div>Select the companion bridge manifest:</div>
                  <button
                    type="button"
                    className="fig-path-pill"
                    onClick={handleCopyPath}
                    title="Copy manifest path"
                  >
                    <code className="fig-path-text">{MANIFEST_PATH}</code>
                    {copiedPath ? <Check size={11} className="ic-ok" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>
              <div className="fig-step">
                <span className="fig-step-num">3</span>
                <div className="fig-step-text">
                  Select any frame and click <strong>Open in Web Dev Mode ↗</strong> to inspect full-screen.
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

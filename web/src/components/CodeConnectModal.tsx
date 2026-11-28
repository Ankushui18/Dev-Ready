import React, { useEffect, useState } from 'react';
import { Code2, Trash2, X } from 'lucide-react';
import type { CodeConnectEntry } from '../types';

interface CodeConnectModalProps {
  componentName: string;
  initial?: CodeConnectEntry;
  onSave: (entry: CodeConnectEntry) => void;
  onRemove?: () => void;
  onClose: () => void;
}

export const CodeConnectModal: React.FC<CodeConnectModalProps> = ({
  componentName,
  initial,
  onSave,
  onRemove,
  onClose
}) => {
  const cleanSymbol = componentName.replace(/[^A-Za-z0-9]/g, '') || 'Component';
  const [importPath, setImportPath] = useState(
    initial?.importPath || `import { ${cleanSymbol} } from '@/components/ui/${cleanSymbol.toLowerCase()}';`
  );
  const [snippet, setSnippet] = useState(
    initial?.snippet || `<${cleanSymbol}\n  variant="default"\n/>`
  );
  const [docsUrl, setDocsUrl] = useState(initial?.docsUrl || '');

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importPath.trim() || !snippet.trim()) return;
    onSave({
      componentName,
      importPath: importPath.trim(),
      snippet: snippet.trim(),
      docsUrl: docsUrl.trim() || undefined
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fig-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Code Connect — ${componentName}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="fig-modal-head">
          <h2>Code Connect — {componentName}</h2>
          <button className="fig-modal-close" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fig-modal-body">
            <div className="fig-field-block">
              <label className="fig-field-label" htmlFor="cc-import">
                Import statement
              </label>
              <input
                id="cc-import"
                type="text"
                className="fig-input"
                placeholder="import { Button } from '@/components/ui/button';"
                value={importPath}
                onChange={e => setImportPath(e.target.value)}
                autoFocus
              />
            </div>

            <div className="fig-field-block">
              <label className="fig-field-label" htmlFor="cc-snippet">
                Production component snippet
              </label>
              <textarea
                id="cc-snippet"
                className="fig-textarea mono"
                rows={5}
                value={snippet}
                onChange={e => setSnippet(e.target.value)}
                placeholder="<Button variant='primary'>Label</Button>"
              />
            </div>

            <div className="fig-field-block">
              <label className="fig-field-label" htmlFor="cc-docs">
                Source / Storybook URL (optional)
              </label>
              <input
                id="cc-docs"
                type="text"
                className="fig-input"
                placeholder="https://github.com/org/repo/blob/main/..."
                value={docsUrl}
                onChange={e => setDocsUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="fig-modal-foot">
            {initial && onRemove ? (
              <button
                type="button"
                className="fig-btn-danger-ghost"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
              >
                <Trash2 size={11} />
                <span>Disconnect</span>
              </button>
            ) : (
              <span className="fig-foot-meta">
                <Code2 size={11} />
                <span>Synced with Code tab &amp; AI export</span>
              </span>
            )}
            <div className="fig-foot-actions">
              <button type="button" className="fig-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="fig-btn-primary"
                disabled={!importPath.trim() || !snippet.trim()}
              >
                Save mapping
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
